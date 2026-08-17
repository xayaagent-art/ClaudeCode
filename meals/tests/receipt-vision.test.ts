import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Real receipt vision parsing, exercised entirely against stubs.
 *
 * No test here reaches the network or spends anything: `fetch` is replaced with
 * a function that returns Responses-API-shaped payloads, so the provider, the
 * retry policy, validation, and telemetry are all driven by the same code paths
 * a real key would use. Receipts are deliberately not Trader Joe's — the point
 * is that nothing in the pipeline is tuned to the bundled fixture.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-vision-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { AIFailure, classifyProviderError, copyForKind, isTransient } = await import(
  "@/lib/ai/failure"
);
const { withRetry } = await import("@/lib/ai/retry");
const { assertReadableImage, sniffImageFormat } = await import("@/lib/receipt/image");
const { validateParsedReceipt } = await import("@/lib/receipt/validate");
const { parseReceiptImage } = await import("@/lib/receipt/parse");
const { getAIProvider } = await import("@/lib/ai");
const { resetOpenAIClient } = await import("@/lib/ai/providers/openai-provider");
const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { ingestReceipt } = await import("@/lib/receipt/service");
const { confidenceDistribution } = await import("@/lib/receipt/normalize");

const db = localDatabase();

// ---------------------------------------------------------------------------
// Fixtures built here rather than imported: these represent what a *model*
// returns, which is a different thing from the app's bundled demo receipt.
// ---------------------------------------------------------------------------

function line(overrides: Record<string, unknown> = {}) {
  return {
    raw_name: "GALA APPLES 3LB",
    normalized_name: "Gala Apples",
    quantity: 1,
    package_size: "3 lb",
    unit_price: null,
    total_price: 4.99,
    category: "Produce",
    storage_location: "Produce",
    classification: "human_food",
    confidence: 0.95,
    uncertain_reason: null,
    ...overrides,
  };
}

/** A Safeway receipt: food, a household item, pet food, and an illegible line. */
const SAFEWAY = {
  merchant: "Safeway",
  purchase_date: "2026-08-14",
  currency: "USD",
  subtotal: 31.4,
  tax: 1.12,
  total: 32.52,
  items: [
    line(),
    line({
      raw_name: "LUCERNE 2% MILK GAL",
      normalized_name: "2% Milk",
      package_size: "1 gal",
      total_price: 4.29,
      category: "Dairy",
      storage_location: "Fridge",
    }),
    line({
      raw_name: "SIGNATURE PAPER TOWEL 6R",
      normalized_name: "Paper Towels",
      package_size: "6 rolls",
      total_price: 9.99,
      category: "Household",
      storage_location: "Pantry",
      classification: "non_food",
    }),
    line({
      raw_name: "PEDIGREE DOG FOOD 5LB",
      normalized_name: "Dog Food",
      package_size: "5 lb",
      total_price: 8.49,
      category: "Pet",
      storage_location: "Pantry",
      classification: "pet_food",
    }),
    line({
      raw_name: "XXQ4 ###",
      normalized_name: "Unreadable Line",
      package_size: null,
      total_price: null,
      category: "Other",
      storage_location: "Pantry",
      classification: "uncertain",
      confidence: 0.21,
      uncertain_reason: "The line was too faint to read.",
    }),
  ],
};

/** Minimal but valid PNG header padded past the size floor. */
function pngBytes(seed = "a"): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.from(seed.repeat(600))]);
}

/** A Responses-API success payload the OpenAI SDK will parse. */
function responsePayload(
  body: unknown,
  options: { status?: string; incompleteReason?: string; rawText?: string } = {},
) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1,
    model: "gpt-5",
    status: options.status ?? "completed",
    incomplete_details: options.incompleteReason ? { reason: options.incompleteReason } : null,
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: options.rawText ?? JSON.stringify(body),
            annotations: [],
          },
        ],
      },
    ],
    usage: { input_tokens: 1500, output_tokens: 900, total_tokens: 2400 },
  };
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Stub fetch with a queue of responses; returns the call counter. */
function stubFetchSequence(responses: (() => Response)[]) {
  const calls = { count: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const next = responses[Math.min(calls.count, responses.length - 1)];
      calls.count += 1;
      return next();
    }),
  );
  return calls;
}

function realMode() {
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  // Keep the suite fast: the policy is what's under test, not the wall clock.
  process.env.OPENAI_RETRY_BASE_MS = "1";
  resetOpenAIClient();
}

beforeEach(async () => {
  delete process.env.AI_PROVIDER;
  delete process.env.RECEIPT_PARSER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_RETRY_BASE_MS;
  delete process.env.OPENAI_MAX_ATTEMPTS;
  resetOpenAIClient();
  await resetLocalDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetOpenAIClient();
});

// ---------------------------------------------------------------------------

describe("image validation happens before any spend", () => {
  it("recognises the formats a phone camera produces", () => {
    expect(sniffImageFormat(pngBytes())).toBe("image/png");
    expect(sniffImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");

    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP"),
    ]);
    expect(sniffImageFormat(webp)).toBe("image/webp");

    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);
    expect(sniffImageFormat(heic)).toBe("image/heic");
  });

  it("rejects a file that isn't an image at all", () => {
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(1000, 0x20)]);
    expect(sniffImageFormat(pdf)).toBeNull();
    expect(() => assertReadableImage(pdf)).toThrowError(/invalid_image/);
  });

  it("rejects empty and truncated uploads", () => {
    expect(() => assertReadableImage(Buffer.alloc(0))).toThrowError(/invalid_image/);
    expect(() => assertReadableImage(Buffer.from([0xff, 0xd8, 0xff]))).toThrowError(/invalid_image/);
  });

  it("trusts the bytes over the client's declared type", () => {
    // A HEIC renamed to .jpg is the classic iPhone case.
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypmif1"),
      Buffer.alloc(600),
    ]);
    expect(assertReadableImage(heic).mimeType).toBe("image/heic");
  });

  it("never reaches the model when the bytes are not an image", async () => {
    realMode();
    const calls = stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    await expect(ingestReceipt(Buffer.from("this is a text file, not a photo"), "image/png")).rejects.toMatchObject(
      { kind: "invalid_image" },
    );
    expect(calls.count).toBe(0);
    // Nothing half-created: no receipt row, no telemetry, no stored image.
    expect(await db.listReceipts()).toHaveLength(0);
    expect(await db.listTelemetry()).toHaveLength(0);
  });

  it("keeps the failure detail free of file contents", () => {
    const secret = Buffer.concat([Buffer.from("CARD 4111111111111111"), Buffer.alloc(1000, 0x20)]);
    try {
      assertReadableImage(secret);
      throw new Error("expected a failure");
    } catch (error) {
      expect((error as Error).message).not.toContain("4111111111111111");
    }
  });
});

describe("failure classification", () => {
  it("maps provider errors onto actionable kinds", () => {
    expect(classifyProviderError({ status: 429, name: "RateLimitError" }).kind).toBe("rate_limit");
    expect(classifyProviderError({ status: 500, name: "InternalServerError" }).kind).toBe("api_error");
    expect(classifyProviderError({ name: "APIConnectionTimeoutError" }).kind).toBe("timeout");
    expect(classifyProviderError({ name: "AbortError" }).kind).toBe("timeout");
    expect(
      classifyProviderError({ status: 400, message: "Invalid image: could not decode" }).kind,
    ).toBe("invalid_image");
  });

  it("treats an unrecognised failure as transient rather than permanent", () => {
    const failure = classifyProviderError(new Error("something new"));
    expect(failure.kind).toBe("api_error");
    expect(failure.retryable).toBe(true);
  });

  it("reads Retry-After when the provider sends one", () => {
    const failure = classifyProviderError({
      status: 429,
      headers: new Headers({ "retry-after": "12" }),
    });
    expect(failure.retryAfterMs).toBe(12_000);
  });

  it("gives each kind distinct advice, and only retries what could succeed", () => {
    const kinds = [
      "invalid_image",
      "unreadable",
      "truncated",
      "schema_invalid",
      "rate_limit",
      "timeout",
      "api_error",
    ] as const;

    const messages = kinds.map((kind) => copyForKind(kind).userMessage);
    expect(new Set(messages).size).toBe(kinds.length);

    // Nothing about these three changes on a second identical attempt.
    expect(copyForKind("invalid_image").retryable).toBe(false);
    expect(copyForKind("unreadable").retryable).toBe(false);
    expect(copyForKind("truncated").retryable).toBe(false);
    expect(isTransient("rate_limit")).toBe(true);
    expect(isTransient("timeout")).toBe(true);
    expect(isTransient("schema_invalid")).toBe(false);
  });
});

describe("retry policy", () => {
  const noSleep = async () => {};

  it("retries a transient failure and returns the eventual success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 429, name: "RateLimitError" };
        return "parsed";
      },
      { sleep: noSleep, baseDelayMs: 0 },
    );

    expect(result.value).toBe("parsed");
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("does not retry a failure that cannot succeed", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new AIFailure("schema_invalid", "bad shape");
        },
        { sleep: noSleep, baseDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ kind: "schema_invalid" });

    expect(calls).toBe(1);
  });

  it("gives up after the attempt limit and reports how many it made", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 503 };
        },
        { attempts: 3, sleep: noSleep, baseDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ kind: "api_error", attempts: 3 });

    expect(calls).toBe(3);
  });

  it("backs off exponentially, and defers to Retry-After when given one", async () => {
    const delays: number[] = [];
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    await expect(
      withRetry(async () => { throw { status: 500 }; }, {
        attempts: 3,
        baseDelayMs: 100,
        sleep,
      }),
    ).rejects.toThrow();
    expect(delays).toHaveLength(2);
    expect(delays[1]).toBeGreaterThan(delays[0]);

    delays.length = 0;
    await expect(
      withRetry(
        async () => {
          throw { status: 429, headers: new Headers({ "retry-after": "2" }) };
        },
        { attempts: 2, baseDelayMs: 100, sleep },
      ),
    ).rejects.toThrow();
    expect(delays).toEqual([2000]);
  });
});

describe("parsing an arbitrary receipt", () => {
  it("reads a store it has never seen, with no fixture involved", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });

    expect(outcome.parser).toBe("openai");
    expect(outcome.receipt.merchant).toBe("Safeway");
    expect(outcome.receipt.total).toBe(32.52);
    expect(outcome.receipt.items).toHaveLength(5);
    expect(outcome.attempts).toBe(1);
    expect(outcome.dropped_items).toBe(0);
    // Nothing from the bundled demo receipt leaked in.
    expect(JSON.stringify(outcome.receipt)).not.toMatch(/trader joe/i);
  });

  it("keeps non-food and pet food out of the kitchen", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    const ingest = await ingestReceipt(pngBytes("safeway"), "image/png");
    const towels = ingest.items.find((i) => i.raw_name.includes("PAPER TOWEL"))!;
    const dogFood = ingest.items.find((i) => i.raw_name.includes("DOG FOOD"))!;

    expect(towels.classification).toBe("non_food");
    expect(towels.included).toBe(false);
    expect(dogFood.classification).toBe("pet_food");
    expect(dogFood.included).toBe(false);
  });

  it("flags an illegible line for review instead of guessing at it", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    const ingest = await ingestReceipt(pngBytes("safeway-2"), "image/png");
    const unclear = ingest.items.find((i) => i.raw_name === "XXQ4 ###")!;

    expect(unclear.classification).toBe("uncertain");
    expect(unclear.notes).toMatch(/too faint/i);
    // Included on the review screen, but it will not reach inventory on confirm.
    expect(unclear.included).toBe(true);
  });

  it("reports usage and an estimated cost for the call", async () => {
    realMode();
    process.env.OPENAI_RECEIPT_MODEL = "gpt-5";
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });
    expect(outcome.usage?.input_tokens).toBe(1500);
    expect(outcome.usage?.output_tokens).toBe(900);
    expect(outcome.usage?.estimated_cost_usd).toBeGreaterThan(0);
    delete process.env.OPENAI_RECEIPT_MODEL;
  });
});

describe("partial parses keep what was readable", () => {
  it("drops only the invalid lines and says how many went missing", () => {
    const outcome = validateParsedReceipt({
      ...SAFEWAY,
      items: [
        line(),
        // Quantity as a word: a real structured-output slip.
        line({ raw_name: "BANANAS", quantity: "two" }),
        line({ raw_name: "OAT MILK", normalized_name: "Oat Milk" }),
        // Confidence outside 0-1.
        line({ raw_name: "RICE 2LB", confidence: 4 }),
      ],
    });

    expect(outcome.receipt.items).toHaveLength(2);
    expect(outcome.dropped).toBe(2);
    expect(outcome.issues).toHaveLength(2);
    expect(outcome.issues.join(" ")).toContain("quantity");
  });

  it("names field paths only, never the values that failed", () => {
    const outcome = validateParsedReceipt({
      ...SAFEWAY,
      items: [line(), line({ raw_name: "VERY PRIVATE PURCHASE", quantity: -1 })],
    });
    expect(outcome.issues.join(" ")).not.toContain("VERY PRIVATE PURCHASE");
  });

  it("treats every line failing as a contract error worth retrying", () => {
    expect(() =>
      validateParsedReceipt({ ...SAFEWAY, items: [line({ quantity: "two" })] }),
    ).toThrowError(/schema_invalid/);
  });

  it("rejects a broken envelope outright", () => {
    expect(() => validateParsedReceipt({ merchant: 42 })).toThrowError(/schema_invalid/);
    expect(() => validateParsedReceipt("not even an object")).toThrowError(/schema_invalid/);
    expect(() =>
      validateParsedReceipt({ ...SAFEWAY, purchase_date: "14/08/2026" }),
    ).toThrowError(/schema_invalid/);
  });

  it("marks the receipt partially parsed and warns the user", async () => {
    realMode();
    stubFetchSequence([
      () =>
        jsonResponse(
          responsePayload({
            ...SAFEWAY,
            items: [line(), line({ raw_name: "BANANAS", quantity: "two" })],
          }),
        ),
    ]);

    const ingest = await ingestReceipt(pngBytes("partial"), "image/png");

    expect(ingest.receipt.processing_status).toBe("partially_parsed");
    expect(ingest.items).toHaveLength(1);
    expect(ingest.warnings.join(" ")).toMatch(/couldn't be read/i);

    const [telemetry] = await db.listTelemetry();
    expect(telemetry.dropped_item_count).toBe(1);
  });
});

describe("failures surface honestly", () => {
  it("reports an empty read as unreadable rather than an empty kitchen", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload({ ...SAFEWAY, items: [] }))]);

    await expect(parseReceiptImage({ base64: "x", mimeType: "image/png" })).rejects.toMatchObject({
      kind: "unreadable",
      retryable: false,
    });
  });

  it("distinguishes a rate limit from a server error", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse({ error: { message: "slow down" } }, 429)]);
    await expect(parseReceiptImage({ base64: "x", mimeType: "image/png" })).rejects.toMatchObject({
      kind: "rate_limit",
      retryable: true,
    });

    vi.unstubAllGlobals();
    resetOpenAIClient();
    stubFetchSequence([() => jsonResponse({ error: { message: "boom" } }, 500)]);
    await expect(parseReceiptImage({ base64: "x", mimeType: "image/png" })).rejects.toMatchObject({
      kind: "api_error",
    });
  });

  it("recovers when a transient failure is followed by a success", async () => {
    realMode();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return jsonResponse({ error: { message: "slow down" } }, 429);
        return jsonResponse(responsePayload(SAFEWAY));
      }),
    );

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });
    expect(outcome.receipt.merchant).toBe("Safeway");
    expect(outcome.attempts).toBe(2);
  });

  it("reports a truncated reply as too long, not as a bad receipt", async () => {
    realMode();
    stubFetchSequence([
      () =>
        jsonResponse(
          responsePayload(null, {
            status: "incomplete",
            incompleteReason: "max_output_tokens",
            rawText: '{"merchant":"Safeway","items":[{"raw_name":"GALA',
          }),
        ),
    ]);

    await expect(parseReceiptImage({ base64: "x", mimeType: "image/png" })).rejects.toMatchObject({
      kind: "truncated",
    });
  });

  it("reports malformed JSON as a schema failure", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload(null, { rawText: "Sure! Here you go:" }))]);

    await expect(parseReceiptImage({ base64: "x", mimeType: "image/png" })).rejects.toMatchObject({
      kind: "schema_invalid",
    });
  });

  it("never substitutes fixture data when the real provider fails", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse({ error: { message: "boom" } }, 500)]);

    await expect(ingestReceipt(pngBytes("failing"), "image/png")).rejects.toThrow();

    // The receipt row exists and is marked failed — no phantom groceries.
    const [receipt] = await db.listReceipts();
    expect(receipt.processing_status).toBe("failed");
    expect(await db.listReceiptItems(receipt.id)).toHaveLength(0);
    expect(await db.listInventory()).not.toContainEqual(
      expect.objectContaining({ normalized_name: "Herbed Goat Cheese" }),
    );
  });

  it("keeps the mock provider unreachable in real mode", () => {
    realMode();
    expect(getAIProvider().name).toBe("openai");
    process.env.MOCK_RECEIPT_FIXTURE = "trader-joes";
    expect(getAIProvider().name).toBe("openai");
    delete process.env.MOCK_RECEIPT_FIXTURE;
  });
});

describe("product mappings are reused before the model is trusted", () => {
  it("overrides the model with a line the household already corrected", async () => {
    realMode();
    await db.upsertMapping({
      merchant: "safeway",
      raw_name: "GALA APPLES 3LB",
      normalized_name: "Gala Apples, Organic",
      category: "Produce",
      storage_location: "Produce",
      classification: "human_food",
      confidence: 1,
      source: "user_correction",
    });

    stubFetchSequence([
      () =>
        jsonResponse(
          responsePayload({
            ...SAFEWAY,
            items: [line({ normalized_name: "Apples", confidence: 0.4 })],
          }),
        ),
    ]);

    const ingest = await ingestReceipt(pngBytes("mapped"), "image/png");
    const apples = ingest.items[0];

    expect(apples.normalized_name).toBe("Gala Apples, Organic");
    expect(apples.confidence).toBe(1);
    expect(ingest.mappings_applied).toContain("GALA APPLES 3LB");

    const [telemetry] = await db.listTelemetry();
    expect(telemetry.mapping_hit_count).toBe(1);
  });

  it("skips the model entirely for a photo it has already read", async () => {
    realMode();
    const bytes = pngBytes("repeat");
    const calls = stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    const first = await ingestReceipt(bytes, "image/png");
    expect(calls.count).toBe(1);

    const second = await ingestReceipt(bytes, "image/png");
    expect(second.duplicate_of).toBe(first.receipt.id);
    // The saving that actually matters: no second call, no second charge.
    expect(calls.count).toBe(1);
    expect(await db.listTelemetry()).toHaveLength(1);
  });
});

describe("cost and quality telemetry", () => {
  it("bands confidence and reports a mean", () => {
    const distribution = confidenceDistribution([
      { confidence: 0.99 },
      { confidence: 0.9 },
      { confidence: 0.7 },
      { confidence: 0.2 },
    ]);
    expect(distribution).toEqual({ high: 2, medium: 1, low: 1, mean: 0.698 });
    expect(confidenceDistribution([])).toEqual({ high: 0, medium: 0, low: 0, mean: null });
  });

  it("records model, usage, latency, cost and confidence for a real parse", async () => {
    realMode();
    process.env.OPENAI_RECEIPT_MODEL = "gpt-5";
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    await ingestReceipt(pngBytes("telemetry"), "image/png");
    const [entry] = await db.listTelemetry();

    expect(entry.provider).toBe("openai");
    expect(entry.model).toBe("gpt-5");
    expect(entry.success).toBe(true);
    expect(entry.attempts).toBe(1);
    expect(entry.input_tokens).toBe(1500);
    expect(entry.output_tokens).toBe(900);
    expect(entry.estimated_cost_usd).toBeGreaterThan(0);
    expect(entry.latency_ms).toBeGreaterThanOrEqual(0);
    expect(entry.item_count).toBe(5);
    expect(entry.confidence_high + entry.confidence_medium + entry.confidence_low).toBe(5);
    expect(entry.mean_confidence).toBeGreaterThan(0);
    delete process.env.OPENAI_RECEIPT_MODEL;
  });

  it("records the typed failure kind and the attempts it cost", async () => {
    realMode();
    process.env.OPENAI_MAX_ATTEMPTS = "2";
    stubFetchSequence([() => jsonResponse({ error: { message: "slow down" } }, 429)]);

    await expect(ingestReceipt(pngBytes("rate-limited"), "image/png")).rejects.toMatchObject({
      kind: "rate_limit",
    });

    const [entry] = await db.listTelemetry();
    expect(entry.success).toBe(false);
    expect(entry.error_kind).toBe("rate_limit");
    expect(entry.attempts).toBe(2);
    delete process.env.OPENAI_MAX_ATTEMPTS;
  });

  it("stores no image bytes, prompt text or model reply", async () => {
    realMode();
    stubFetchSequence([() => jsonResponse(responsePayload(SAFEWAY))]);

    await ingestReceipt(pngBytes("secret-bytes"), "image/png");
    const [entry] = await db.listTelemetry();
    const serialised = JSON.stringify(entry);

    expect(serialised).not.toContain("secret-bytes");
    expect(serialised).not.toContain("Transcribe this grocery receipt");
    expect(serialised).not.toContain("GALA APPLES");
    expect(serialised).not.toContain("sk-test");
  });
});
