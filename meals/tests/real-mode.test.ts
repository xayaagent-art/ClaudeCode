import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "meals-realmode-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { activeProviderName, isRealMode } = await import("@/lib/ai/provider");
const { getAIProvider } = await import("@/lib/ai");
const { activeParser, hashImage, parseReceiptImage } = await import("@/lib/receipt/parse");
const { estimateCostUsd } = await import("@/lib/ai/pricing");
const {
  applyMappings,
  indexMappings,
  isTrusted,
  lookupMapping,
  mappingFromCorrection,
  merchantKey,
  rawKey,
} = await import("@/lib/receipt/mappings");
const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { ingestReceipt } = await import("@/lib/receipt/service");
const { receiptFixtures } = await import("@/fixtures/receipts");
const { postProcess } = await import("@/lib/receipt/normalize");
import type { ProductMapping } from "@/lib/types";

const db = localDatabase();

function clearEnv() {
  delete process.env.AI_PROVIDER;
  delete process.env.RECEIPT_PARSER;
  delete process.env.OPENAI_API_KEY;
}

beforeEach(async () => {
  clearEnv();
  await resetLocalDatabase();
});

afterEach(() => {
  clearEnv();
  vi.unstubAllGlobals();
});

describe("provider mode resolution", () => {
  it("honours an explicit AI_PROVIDER over everything else", () => {
    process.env.AI_PROVIDER = "mock";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(activeProviderName()).toBe("mock");
    expect(isRealMode()).toBe(false);

    process.env.AI_PROVIDER = "openai";
    expect(activeProviderName()).toBe("openai");
    expect(isRealMode()).toBe(true);
  });

  it("defaults to mock when nothing is configured", () => {
    expect(activeProviderName()).toBe("mock");
    expect(activeParser()).toBe("fixture");
  });

  it("defaults to openai when a key is present", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(activeProviderName()).toBe("openai");
    expect(activeParser()).toBe("openai");
  });

  it("selects the matching provider implementation", () => {
    process.env.AI_PROVIDER = "mock";
    expect(getAIProvider().name).toBe("mock");
    process.env.AI_PROVIDER = "openai";
    expect(getAIProvider().name).toBe("openai");
  });
});

describe("real mode never falls back to fixture data", () => {
  it("fails with a recoverable error when the key is missing", async () => {
    process.env.AI_PROVIDER = "openai";
    await expect(
      parseReceiptImage({ base64: "abc", mimeType: "image/png" }),
    ).rejects.toMatchObject({
      name: "ReceiptParseError",
      userMessage: expect.stringMatching(/isn't configured/i),
    });
  });

  it("surfaces a parse failure instead of returning the fixture", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream exploded", { status: 500 })),
    );

    await expect(
      parseReceiptImage({ base64: "abc", mimeType: "image/png" }),
    ).rejects.toMatchObject({
      name: "ReceiptParseError",
      userMessage: expect.stringMatching(/couldn't read this receipt/i),
    });
  });

  it("returns the labelled fixture only in mock mode", async () => {
    process.env.AI_PROVIDER = "mock";
    const outcome = await parseReceiptImage({ base64: "abc", mimeType: "image/png" });
    expect(outcome.parser).toBe("fixture");
    expect(outcome.receipt.merchant).toBe("Trader Joe's");
    expect(outcome.warnings[0]).toMatch(/Mock mode/);
    expect(outcome.usage).toBeNull();
  });
});

describe("cost telemetry", () => {
  it("prices a known model and refuses to guess an unknown one", () => {
    expect(estimateCostUsd("gpt-5", 1_000_000, 0)).toBeCloseTo(1.25, 5);
    expect(estimateCostUsd("gpt-5-mini", 0, 1_000_000)).toBeCloseTo(2, 5);
    // Dated model ids fall back to their family.
    expect(estimateCostUsd("gpt-5-2026-01-01", 1_000_000, 0)).toBeCloseTo(1.25, 5);
    expect(estimateCostUsd("some-unknown-model", 1000, 1000)).toBeNull();
  });

  it("records a telemetry row for every parse", async () => {
    process.env.AI_PROVIDER = "mock";
    await ingestReceipt(Buffer.from("receipt-a"), "image/png");

    const telemetry = await db.listTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0].provider).toBe("mock");
    expect(telemetry[0].success).toBe(true);
    expect(telemetry[0].item_count).toBeGreaterThan(0);
    expect(
      telemetry[0].high_confidence_count +
        telemetry[0].needs_review_count +
        telemetry[0].excluded_count,
    ).toBe(telemetry[0].item_count);
  });

  it("stores no prompt or image content", async () => {
    process.env.AI_PROVIDER = "mock";
    await ingestReceipt(Buffer.from("receipt-a"), "image/png");
    const [entry] = await db.listTelemetry();
    expect(JSON.stringify(entry)).not.toContain("receipt-a");
  });
});

describe("duplicate image detection", () => {
  it("hashes deterministically and distinguishes different images", () => {
    expect(hashImage(Buffer.from("same"))).toBe(hashImage(Buffer.from("same")));
    expect(hashImage(Buffer.from("a"))).not.toBe(hashImage(Buffer.from("b")));
  });

  it("recognises a re-upload instead of parsing again", async () => {
    process.env.AI_PROVIDER = "mock";
    const bytes = Buffer.from("same-receipt-bytes");

    const first = await ingestReceipt(bytes, "image/png");
    expect(first.duplicate_of).toBeNull();

    const second = await ingestReceipt(bytes, "image/png");
    expect(second.duplicate_of).toBe(first.receipt.id);
    expect(second.receipt.id).toBe(first.receipt.id);

    // No second parse means no second telemetry row and no second spend.
    expect(await db.listTelemetry()).toHaveLength(1);
    expect(await db.listReceipts()).toHaveLength(1);
  });
});

describe("store-specific mappings", () => {
  function mapping(overrides: Partial<ProductMapping> = {}): ProductMapping {
    return {
      id: "m1",
      household_id: "h",
      merchant: "trader joes",
      raw_name: "HERB GOAT LOG 8OZ",
      normalized_name: "Herbed Goat Cheese",
      category: "Dairy",
      storage_location: "Fridge",
      classification: "human_food",
      confidence: 1,
      source: "user_correction",
      times_seen: 1,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      ...overrides,
    };
  }

  it("normalises merchant and line keys", () => {
    expect(merchantKey("Trader Joe's")).toBe("trader joes");
    expect(merchantKey("  TRADER   JOE'S  ")).toBe("trader joes");
    expect(merchantKey(null)).toBeNull();
    expect(rawKey("  herb goat   log  ")).toBe("HERB GOAT LOG");
  });

  it("prefers a store-scoped mapping over a global one", () => {
    const index = indexMappings([
      mapping(),
      mapping({ id: "m2", merchant: null, normalized_name: "Generic Goat Cheese" }),
    ]);
    expect(lookupMapping(index, "Trader Joe's", "HERB GOAT LOG 8OZ")?.normalized_name).toBe(
      "Herbed Goat Cheese",
    );
    expect(lookupMapping(index, "Safeway", "HERB GOAT LOG 8OZ")?.normalized_name).toBe(
      "Generic Goat Cheese",
    );
  });

  it("trusts a user correction but not a one-off model guess", () => {
    expect(isTrusted(mapping())).toBe(true);
    expect(isTrusted(mapping({ source: "model", confidence: 0.95, times_seen: 1 }))).toBe(false);
    expect(isTrusted(mapping({ source: "model", confidence: 0.95, times_seen: 3 }))).toBe(true);
  });

  it("resolves a previously corrected line so it skips Needs Review", () => {
    const processed = postProcess(receiptFixtures[0].parsed);
    const index = indexMappings([mapping()]);
    const { items, applied } = applyMappings(processed.items, index, "Trader Joe's");

    const goat = items.find((i) => i.raw_name === "HERB GOAT LOG 8OZ")!;
    expect(goat.normalized_name).toBe("Herbed Goat Cheese");
    expect(goat.confidence).toBe(1);
    expect(goat.uncertain_reason).toBeNull();
    expect(applied).toContain("HERB GOAT LOG 8OZ");
  });

  it("leaves lines without a mapping untouched", () => {
    const processed = postProcess(receiptFixtures[0].parsed);
    const { items } = applyMappings(processed.items, indexMappings([]), "Trader Joe's");
    expect(items).toEqual(processed.items);
  });

  it("builds a mapping from a correction and strengthens it on repeat", async () => {
    const built = mappingFromCorrection({
      merchant: "Trader Joe's",
      raw_name: "herb goat log 8oz",
      normalized_name: "Herbed Goat Cheese",
      category: "Dairy",
      storage_location: "Fridge",
      classification: "human_food",
    });
    expect(built.merchant).toBe("trader joes");
    expect(built.raw_name).toBe("HERB GOAT LOG 8OZ");
    expect(built.source).toBe("user_correction");

    const first = await db.upsertMapping(built);
    expect(first.times_seen).toBe(1);
    const second = await db.upsertMapping(built);
    expect(second.times_seen).toBe(2);
    expect(await db.listMappings()).toHaveLength(1);
  });
});

describe("fixture registry", () => {
  it("keeps Trader Joe's as regression fixture #1", () => {
    expect(receiptFixtures[0].id).toBe("trader-joes");
    expect(receiptFixtures[0].imagePath).toBe("/fixtures/trader-joes-receipt.png");
  });

  it("holds every fixture to the same retailer-agnostic invariants", () => {
    for (const fixture of receiptFixtures) {
      const processed = postProcess(fixture.parsed);
      // Raw text preserved.
      expect(processed.items.every((i) => i.raw_name.length > 0)).toBe(true);
      // Nothing non-food is offered to the kitchen.
      const plannable = processed.items.filter(
        (i) => i.classification === "human_food" || i.classification === "uncertain",
      );
      expect(plannable.some((i) => /sanitizer|dog food/i.test(i.normalized_name))).toBe(false);
      // Confidence is a real 0–1 value.
      expect(processed.items.every((i) => i.confidence >= 0 && i.confidence <= 1)).toBe(true);
    }
  });
});

describe("trust over recall", () => {
  it("keeps uncertain lines out of inventory on confirm", async () => {
    process.env.AI_PROVIDER = "mock";
    const { confirmReceipt } = await import("@/lib/receipt/service");
    const ingest = await ingestReceipt(Buffer.from("uncertain-receipt"), "image/png");

    // Force one line to uncertain, as a low-confidence real parse would.
    const target = ingest.items.find((i) => i.raw_name === "HERB GOAT LOG 8OZ")!;
    await db.updateReceiptItem(target.id, { classification: "uncertain" });

    const before = (await db.listInventory()).length;
    await confirmReceipt(ingest.receipt.id);
    const added = (await db.listInventory()).slice(before);

    expect(added.some((i) => i.normalized_name === "Herbed Goat Cheese")).toBe(false);
  });
});
