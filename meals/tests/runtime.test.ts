import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Production-runtime regressions.
 *
 * These cover the things that broke on a real phone while every stubbed test
 * passed: the exact request payload sent to each model, the timeout budget
 * fitting inside a serverless function, provider failures staying visible, and
 * fixture data being unreachable in Gemini mode.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-runtime-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { generateContent, resetGeminiCapabilities } = await import("@/lib/ai/gemini");
const { generateMealCandidates } = await import("@/lib/meals/candidates");
const { buildHouseholdContext } = await import("@/lib/household/context");
const { ingestReceipt } = await import("@/lib/receipt/service");
const { parseReceiptImage } = await import("@/lib/receipt/parse");
const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");

const db = localDatabase();

interface Sent {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Capture exactly what goes on the wire. */
function captureRequests(respond: () => Response) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({
        url: typeof input === "string" ? input : input.toString(),
        body: JSON.parse(String(init?.body ?? "{}")),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return respond();
    }),
  );
  return sent;
}

function geminiOk(payload: unknown) {
  return () =>
    new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

const CONCEPTS = {
  candidates: [
    {
      title: "Chana Masala",
      cuisine: "Indian",
      description: "Chickpeas braised with tomato.",
      likely_ingredients: ["chickpeas", "cherry tomatoes"],
      estimated_cook_minutes: 25,
      dietary_tags: ["vegetarian"],
      protein_intent: "high",
      meal_format: "curry",
      protein_source: "paneer",
      flavor_profile: "indian-spiced",
      instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
      ingredient_quantities: ["200 g", "1 tsp"],
      search_query: "chana masala recipe",
      fit_reason: "Uses the chickpeas you have.",
    },
  ],
};

function pngBytes(seed = "r"): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(seed.repeat(400)),
  ]);
}

beforeEach(async () => {
  for (const key of [
    "AI_PROVIDER", "GEMINI_API_KEY", "OPENAI_API_KEY", "GEMINI_TEMPERATURE",
    "GEMINI_SEND_TEMPERATURE", "GEMINI_TIMEOUT_MS", "GEMINI_BUDGET_MS", "DYNAMIC_MEALS",
  ]) {
    delete process.env[key];
  }
  await resetLocalDatabase();
  resetGeminiCapabilities();
});

afterEach(() => vi.unstubAllGlobals());

describe("gemini request payload", () => {
  const models = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];

  it.each(models)("sends a minimal, supported generationConfig to %s", async (model) => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const sent = captureRequests(geminiOk(CONCEPTS));

    await generateContent({
      model,
      system: "system framing",
      prompt: "user prompt",
      maxOutputTokens: 4000,
      thinkingLevel: "low",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    );

    const config = sent[0].body.generationConfig as Record<string, unknown>;
    // Only fields this app depends on. An unsupported knob fails the whole
    // request, and that failure is indistinguishable from an empty answer.
    expect(Object.keys(config).sort()).toEqual([
      "maxOutputTokens",
      "responseMimeType",
      "thinkingConfig",
    ]);
    // Production evidence: without capping this the entire output budget goes
    // on internal reasoning and the reply comes back empty with MAX_TOKENS.
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" });
    // Deprecated sampling params are gone entirely.
    expect(config).not.toHaveProperty("topP");
    expect(config).not.toHaveProperty("topK");
    // temperature is NOT sent by default, even though the caller asked for one.
    expect(config).not.toHaveProperty("temperature");
    expect(config.responseMimeType).toBe("application/json");
  });

  it("uses the documented camelCase systemInstruction field", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const sent = captureRequests(geminiOk(CONCEPTS));
    await generateContent({ model: "gemini-3.6-flash", system: "framing", prompt: "hi" });

    expect(sent[0].body).toHaveProperty("systemInstruction");
    expect(sent[0].body).not.toHaveProperty("system_instruction");
  });

  it("never sends sampling parameters", async () => {
    process.env.GEMINI_API_KEY = "test-key-not-real";
    const sent = captureRequests(geminiOk(CONCEPTS));
    await generateContent({ model: "gemini-3.6-flash", system: "s", prompt: "p" });

    const config = sent[0].body.generationConfig as Record<string, unknown>;
    expect(config).not.toHaveProperty("temperature");
  });

  it("keeps the key in a header, never in the URL", async () => {
    process.env.GEMINI_API_KEY = "super-secret-key";
    const sent = captureRequests(geminiOk(CONCEPTS));
    await generateContent({ model: "gemini-3.6-flash", system: "s", prompt: "p" });

    expect(sent[0].url).not.toContain("super-secret-key");
    expect(sent[0].headers["x-goog-api-key"]).toBe("super-secret-key");
  });

  it("attaches a response schema only when one is given", async () => {
    process.env.GEMINI_API_KEY = "k";
    const sent = captureRequests(geminiOk(CONCEPTS));
    await generateContent({
      model: "gemini-3.6-flash",
      system: "s",
      prompt: "p",
      responseSchema: { type: "object" },
    });
    expect((sent[0].body.generationConfig as Record<string, unknown>).responseSchema).toEqual({
      type: "object",
    });
  });
});

describe("timeout budget fits inside a serverless function", () => {
  it("stops retrying before the budget is spent", async () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.GEMINI_TIMEOUT_MS = "60";
    process.env.GEMINI_BUDGET_MS = "150";

    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        // Never resolves within the attempt timeout.
        await new Promise((resolve) => setTimeout(resolve, 500));
        return new Response("{}", { status: 200 });
      }),
    );

    const startedAt = Date.now();
    await expect(
      generateContent({ model: "gemini-3.6-flash", system: "s", prompt: "p" }),
    ).rejects.toMatchObject({ kind: "timeout" });

    // The whole call is bounded, not attempts × timeout.
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(calls).toBeLessThanOrEqual(2);
  });
});

describe("gemini failure is never silent", () => {
  it("reports a typed failure instead of an empty result", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    captureRequests(() => new Response(JSON.stringify({ error: {} }), { status: 500 }));

    const { context } = await buildHouseholdContext("dinner");
    const result = await generateMealCandidates(context);

    expect(result.outcome).toBe("failed");
    expect(result.failureKind).toBe("api_error");
    expect(result.error).toBeTruthy();
    expect(result.recipes).toEqual([]);
  });

  it("distinguishes a real failure from being switched off", async () => {
    const { context } = await buildHouseholdContext("dinner");
    const off = await generateMealCandidates(context);
    expect(off.outcome).toBe("disabled");
    expect(off.failureKind).toBeNull();
  });

  it("tells the recommender that generation failed", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    captureRequests(() => new Response(JSON.stringify({ error: {} }), { status: 500 }));

    const { recommendMeals } = await import("@/lib/meals/recommend");
    const result = await recommendMeals({ count: 3 });

    expect(result.generation_failed).toBe(true);
    expect(result.generation_note).toMatch(/saved recipes/i);
  });
});

describe("gemini mode can never show the demo fixture", () => {
  it("re-parses a photo that was previously read in mock mode", async () => {
    // Scan once with the fixture parser.
    process.env.AI_PROVIDER = "mock";
    const bytes = pngBytes("same-photo");
    const mock = await ingestReceipt(bytes, "image/png");
    expect(mock.parser).toBe("fixture");

    // Switch to Gemini and upload the identical photo. The cached fixture
    // result must not come back — that is what put "Offline demo parser" on a
    // live screen after the provider had already been switched.
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    captureRequests(
      geminiOk({
        merchant: "Trader Joe's",
        purchase_date: "2026-08-16",
        currency: "USD",
        subtotal: 3.49,
        tax: 0,
        total: 3.49,
        items: [
          {
            raw_name: "ORG BABY SPINACH",
            normalized_name: "Baby Spinach",
            quantity: 1,
            package_size: "16 oz",
            unit_price: null,
            total_price: 3.49,
            category: "Produce",
            storage_location: "Produce",
            classification: "human_food",
            confidence: 0.95,
            uncertain_reason: null,
          },
        ],
      }),
    );

    const real = await ingestReceipt(bytes, "image/png");
    expect(real.parser).toBe("gemini");
    expect(real.duplicate_of).toBeNull();
    expect(real.receipt.parser).toBe("gemini");
  });

  it("fails visibly rather than falling back when Gemini is down", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "k";
    captureRequests(() => new Response(JSON.stringify({ error: {} }), { status: 500 }));

    await expect(
      parseReceiptImage({ base64: "x", mimeType: "image/png" }),
    ).rejects.toMatchObject({ kind: "api_error" });
  });

  it("still allows the fixture when mock mode is explicitly chosen", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.GEMINI_API_KEY = "k";
    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });
    expect(outcome.parser).toBe("fixture");
    expect(outcome.warnings[0]).toMatch(/Mock mode/);
  });
});

describe("recipe id invariant", () => {
  it("drops a recipe that was written but cannot be read back", async () => {
    const { materialize } = await import("@/lib/meals/registry");
    const { catalogRecipes } = await import("@/lib/meals/catalog");

    const ghost = {
      ...catalogRecipes[0],
      id: "gen-ghost",
      title: "Ghost Dish",
      cuisine: "Nowhere",
      source_type: "generated" as const,
      canonical_key: null,
    };

    // upsert succeeds, the read-back finds nothing — exactly the shape of an
    // RLS refusal or a partial write. It must not be offered to the client.
    const upsert = vi.spyOn(db, "upsertRecipe").mockResolvedValue(ghost);
    const get = vi.spyOn(db, "getRecipe").mockResolvedValue(null);

    const resolved = await materialize([ghost]);

    expect(upsert).toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith("gen-ghost");
    expect(resolved.has("gen-ghost")).toBe(false);

    upsert.mockRestore();
    get.mockRestore();
  });

  it("returns the row as read back, not the row as written", async () => {
    const { materialize } = await import("@/lib/meals/registry");
    const { catalogRecipes } = await import("@/lib/meals/catalog");

    const written = {
      ...catalogRecipes[0],
      id: "gen-readback",
      title: "Read Back",
      cuisine: "Testland",
      source_type: "generated" as const,
      canonical_key: null,
      times_cooked: 0,
    };
    // The stored copy is authoritative — here it already has a cook history.
    const stored = { ...written, times_cooked: 7 };

    vi.spyOn(db, "upsertRecipe").mockResolvedValue(written);
    vi.spyOn(db, "getRecipe").mockResolvedValue(stored);

    const resolved = await materialize([written]);
    expect(resolved.get("gen-readback")?.times_cooked).toBe(7);
    vi.restoreAllMocks();
  });
});


describe("thinking budget", () => {
  it("caps reasoning per task: minimal to read, low to propose", async () => {
    const { thinkingLevelFor } = await import("@/lib/ai/models");
    expect(thinkingLevelFor("receipt_parse")).toBe("minimal");
    expect(thinkingLevelFor("meal_candidate_generation")).toBe("low");

    process.env.GEMINI_API_KEY = "k";
    const sent = captureRequests(geminiOk(CONCEPTS));
    await generateContent({
      model: "gemini-3.5-flash-lite",
      system: "s",
      prompt: "p",
      thinkingLevel: "minimal",
    });
    expect((sent[0].body.generationConfig as Record<string, unknown>).thinkingConfig).toEqual({
      thinkingLevel: "minimal",
    });
  });

  it("drops the field and recovers when the model rejects it", async () => {
    process.env.GEMINI_API_KEY = "k";
    const sent: Record<string, unknown>[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body ?? "{}")));
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({ error: { message: "Unknown name \"thinkingConfig\"" } }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        return geminiOk(CONCEPTS)();
      }),
    );

    const result = await generateContent({ model: "gemini-3.6-flash", system: "s", prompt: "p" });

    expect(result.attempts).toBe(2);
    // First attempt carried it, the retry did not — one failure, then working.
    expect(sent[0].generationConfig).toHaveProperty("thinkingConfig");
    expect(sent[1].generationConfig).not.toHaveProperty("thinkingConfig");
  });
});
