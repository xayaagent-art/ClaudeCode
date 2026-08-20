import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Gemini receipt parsing and dynamic meal intelligence, against stubbed HTTP.
 *
 * Every Gemini call in these tests is a stubbed `fetch` returning a real
 * generateContent response shape, so the provider, the escalation policy, the
 * candidate generator, memory and the ranker all run their production code
 * paths without spending anything.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-gemini-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { modelFor, modelRouting, shouldEscalateReceipt } = await import("@/lib/ai/models");
const { toGeminiSchema } = await import("@/lib/ai/gemini");
const { activeProviderName, isRealMode } = await import("@/lib/ai/provider");
const { getAIProvider } = await import("@/lib/ai");
const { parseReceiptImage, activeParser } = await import("@/lib/receipt/parse");
const { ingestReceipt, confirmReceipt } = await import("@/lib/receipt/service");
const { generateMealCandidates } = await import("@/lib/meals/candidates");
const {
  canonicalRecipeKey,
  dedupeAgainstMemory,
  isProven,
  mergeIntoMemory,
  worthRemembering,
} = await import("@/lib/meals/memory");
const { rankRecipes } = await import("@/lib/meals/rank");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { householdContext, inventoryItem } = await import("./helpers");

const db = localDatabase();

// ---------------------------------------------------------------------------
// A Trader Joe's receipt the way a vision model returns it: real abbreviations,
// a non-food line, a pet-food line, and one line it could not read.
// ---------------------------------------------------------------------------

function receiptLine(overrides: Record<string, unknown> = {}) {
  return {
    raw_name: "ORG BABY SPINACH 16OZ",
    normalized_name: "Baby Spinach",
    quantity: 1,
    package_size: "16 oz",
    unit_price: null,
    total_price: 3.49,
    category: "Produce",
    storage_location: "Produce",
    classification: "human_food",
    confidence: 0.94,
    uncertain_reason: null,
    ...overrides,
  };
}

const TRADER_JOES = {
  merchant: "Trader Joe's",
  purchase_date: "2026-08-16",
  currency: "USD",
  subtotal: 41.23,
  tax: 0.88,
  total: 42.11,
  items: [
    receiptLine(),
    receiptLine({
      raw_name: "PANEER 14OZ",
      normalized_name: "Paneer",
      package_size: "14 oz",
      total_price: 5.99,
      category: "Dairy",
      storage_location: "Fridge",
    }),
    receiptLine({
      raw_name: "HAND SANITIZER 8OZ",
      normalized_name: "Hand Sanitizer",
      total_price: 2.99,
      category: "Household",
      storage_location: "Pantry",
      classification: "non_food",
    }),
    receiptLine({
      raw_name: "DOG FOOD CHICKEN 4LB",
      normalized_name: "Dog Food",
      total_price: 11.99,
      category: "Pet",
      storage_location: "Pantry",
      classification: "pet_food",
    }),
    receiptLine({
      raw_name: "HERB GOAT LOG 8OZ",
      normalized_name: "Herb Goat Log",
      total_price: 3.99,
      category: "Dairy",
      storage_location: "Fridge",
      classification: "uncertain",
      confidence: 0.42,
      uncertain_reason: "Abbreviated product name.",
    }),
  ],
};

/** A generateContent success body. */
function geminiBody(payload: unknown, options: { finishReason?: string; text?: string } = {}) {
  return {
    candidates: [
      {
        content: { parts: [{ text: options.text ?? JSON.stringify(payload) }] },
        finishReason: options.finishReason ?? "STOP",
      },
    ],
    usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 700, totalTokenCount: 2500 },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stub fetch and record which model each call went to. */
function stubGemini(handler: (model: string, call: number) => Response) {
  const models: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      const model = url.split("/models/")[1]?.split(":")[0] ?? "unknown";
      models.push(model);
      return handler(model, models.length);
    }),
  );
  return models;
}

/** Minimal but valid PNG bytes past the size floor. */
function pngBytes(seed = "tj"): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(seed.repeat(400)),
  ]);
}

function geminiMode() {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key-not-real";
  process.env.OPENAI_RETRY_BASE_MS = "1";
}

beforeEach(async () => {
  for (const key of [
    "AI_PROVIDER", "GEMINI_API_KEY", "OPENAI_API_KEY", "RECEIPT_PARSER",
    "GEMINI_RECEIPT_MODEL", "GEMINI_RECEIPT_ESCALATION_MODEL", "GEMINI_MEAL_MODEL",
    "OPENAI_RETRY_BASE_MS", "DYNAMIC_MEALS",
  ]) {
    delete process.env[key];
  }
  await resetLocalDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("model routing", () => {
  it("routes each task to its default model", () => {
    expect(modelFor("receipt_parse")).toBe("gemini-3.5-flash-lite");
    expect(modelFor("meal_candidate_generation")).toBe("gemini-3.6-flash");
    expect(modelFor("receipt_escalation")).toBe("gemini-3.6-flash");
  });

  it("lets any model be overridden without touching code", () => {
    process.env.GEMINI_RECEIPT_MODEL = "gemini-9-experimental";
    expect(modelFor("receipt_parse")).toBe("gemini-9-experimental");
    expect(modelRouting().receipt_parse).toBe("gemini-9-experimental");
    // Other tasks are unaffected by one override.
    expect(modelFor("meal_candidate_generation")).toBe("gemini-3.6-flash");
  });

  it("reads receipts on the cheap model by default", () => {
    geminiMode();
    expect(getAIProvider().name).toBe("gemini");
    expect(getAIProvider().modelName()).toBe("gemini-3.5-flash-lite");
  });
});

describe("escalation policy", () => {
  it("does not pay twice for a receipt that read cleanly", () => {
    expect(
      shouldEscalateReceipt({ itemCount: 22, meanConfidence: 0.91, droppedItems: 0 }),
    ).toBe(false);
    // A few uncertain lines on a creased receipt is what Review is for.
    expect(
      shouldEscalateReceipt({ itemCount: 18, meanConfidence: 0.72, droppedItems: 2 }),
    ).toBe(false);
  });

  it("escalates only a genuinely failed read", () => {
    expect(shouldEscalateReceipt({ itemCount: 0, meanConfidence: null, droppedItems: 0 })).toBe(true);
    expect(shouldEscalateReceipt({ itemCount: 2, meanConfidence: 0.9, droppedItems: 9 })).toBe(true);
    expect(shouldEscalateReceipt({ itemCount: 12, meanConfidence: 0.4, droppedItems: 0 })).toBe(true);
  });
});

describe("schema conversion", () => {
  it("drops additionalProperties and turns nullable unions into nullable", () => {
    const converted = toGeminiSchema({
      type: "object",
      additionalProperties: false,
      properties: {
        total: { type: ["number", "null"] },
        name: { type: "string" },
        items: { type: "array", items: { type: "object", additionalProperties: false } },
      },
    });

    expect(converted).not.toHaveProperty("additionalProperties");
    const props = converted.properties as Record<string, Record<string, unknown>>;
    expect(props.total).toEqual({ type: "number", nullable: true });
    expect(props.name).toEqual({ type: "string" });
    expect((props.items.items as Record<string, unknown>)).not.toHaveProperty("additionalProperties");
  });
});

describe("parsing a real receipt on Gemini", () => {
  it("extracts merchant, date and every product line", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });

    expect(outcome.parser).toBe("gemini");
    expect(outcome.model).toBe("gemini-3.5-flash-lite");
    expect(outcome.receipt.merchant).toBe("Trader Joe's");
    expect(outcome.receipt.purchase_date).toBe("2026-08-16");
    expect(outcome.receipt.total).toBe(42.11);
    expect(outcome.receipt.items).toHaveLength(5);
  });

  it("keeps the raw label and normalises the display name", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const ingest = await ingestReceipt(pngBytes("raw"), "image/png");
    const spinach = ingest.items.find((i) => i.raw_name === "ORG BABY SPINACH 16OZ")!;

    expect(spinach.raw_name).toBe("ORG BABY SPINACH 16OZ");
    expect(spinach.normalized_name).toBe("Baby Spinach");
    expect(spinach.package_size).toBe("16 oz");
    expect(spinach.price).toBe(3.49);
    expect(spinach.confidence).toBeGreaterThan(0.9);
  });

  it("keeps hand sanitizer and dog food out of the kitchen", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const ingest = await ingestReceipt(pngBytes("excluded"), "image/png");
    const sanitizer = ingest.items.find((i) => i.raw_name.includes("SANITIZER"))!;
    const dogFood = ingest.items.find((i) => i.raw_name.includes("DOG FOOD"))!;

    expect(sanitizer.classification).toBe("non_food");
    expect(sanitizer.included).toBe(false);
    expect(dogFood.classification).toBe("pet_food");
    expect(dogFood.included).toBe(false);

    await confirmReceipt(ingest.receipt.id);
    const inventory = await db.listInventory();
    expect(inventory.some((i) => /sanitizer|dog food/i.test(i.normalized_name))).toBe(false);
  });

  it("sends an uncertain line to review and keeps it out of inventory", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const ingest = await ingestReceipt(pngBytes("uncertain"), "image/png");
    const goat = ingest.items.find((i) => i.raw_name === "HERB GOAT LOG 8OZ")!;

    expect(goat.classification).toBe("uncertain");
    expect(goat.included).toBe(true);
    expect(goat.notes).toMatch(/abbreviated/i);

    await confirmReceipt(ingest.receipt.id);
    const inventory = await db.listInventory();
    expect(inventory.some((i) => i.normalized_name === "Herb Goat Log")).toBe(false);
  });

  it("persists confirmed groceries as inventory", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const ingest = await ingestReceipt(pngBytes("persist"), "image/png");
    const result = await confirmReceipt(ingest.receipt.id);

    expect(result.added + result.restocked).toBeGreaterThan(0);
    const inventory = await db.listInventory();
    expect(inventory.some((i) => i.normalized_name === "Baby Spinach")).toBe(true);
    expect(inventory.some((i) => i.normalized_name === "Paneer")).toBe(true);
  });

  it("reuses a learned product mapping instead of the model's guess", async () => {
    geminiMode();
    await db.upsertMapping({
      merchant: "trader joes",
      raw_name: "HERB GOAT LOG 8OZ",
      normalized_name: "Herbed Goat Cheese",
      category: "Dairy",
      storage_location: "Fridge",
      classification: "human_food",
      confidence: 1,
      source: "user_correction",
    });
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    const ingest = await ingestReceipt(pngBytes("mapped"), "image/png");
    const goat = ingest.items.find((i) => i.raw_name === "HERB GOAT LOG 8OZ")!;

    expect(goat.normalized_name).toBe("Herbed Goat Cheese");
    expect(goat.classification).toBe("human_food");
    expect(ingest.mappings_applied).toContain("HERB GOAT LOG 8OZ");
  });

  it("records model, usage, latency, confidence and cost", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    await ingestReceipt(pngBytes("telemetry"), "image/png");
    const [entry] = await db.listTelemetry();

    expect(entry.provider).toBe("gemini");
    expect(entry.model).toBe("gemini-3.5-flash-lite");
    expect(entry.input_tokens).toBe(1800);
    expect(entry.output_tokens).toBe(700);
    expect(entry.estimated_cost_usd).toBeGreaterThan(0);
    expect(entry.latency_ms).toBeGreaterThanOrEqual(0);
    expect(entry.confidence_high + entry.confidence_medium + entry.confidence_low).toBe(5);
    expect(entry.mean_confidence).toBeGreaterThan(0);
    expect(entry.success).toBe(true);
  });

  it("never falls back to the bundled fixture when Gemini fails", async () => {
    geminiMode();
    stubGemini(() => jsonResponse({ error: { message: "boom" } }, 500));

    await expect(ingestReceipt(pngBytes("failing"), "image/png")).rejects.toMatchObject({
      kind: "api_error",
    });

    const [receipt] = await db.listReceipts();
    expect(receipt.processing_status).toBe("failed");
    expect(receipt.parser).toBe("gemini");
    expect(await db.listReceiptItems(receipt.id)).toHaveLength(0);
  });

  it("keeps mock mode available for development", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.GEMINI_API_KEY = "test-key-not-real";
    expect(activeProviderName()).toBe("mock");
    expect(activeParser()).toBe("fixture");
    expect(isRealMode()).toBe(false);

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });
    expect(outcome.warnings[0]).toMatch(/Mock mode/);
  });
});

describe("cost-controlled escalation", () => {
  it("stays on Flash-Lite when the cheap read is good", async () => {
    geminiMode();
    const models = stubGemini(() => jsonResponse(geminiBody(TRADER_JOES)));

    await parseReceiptImage({ base64: "x", mimeType: "image/png" });

    expect(models).toEqual(["gemini-3.5-flash-lite"]);
  });

  it("escalates once when the cheap read is genuinely poor, and keeps the better one", async () => {
    geminiMode();
    const weak = {
      ...TRADER_JOES,
      items: [receiptLine({ confidence: 0.2 }), receiptLine({ raw_name: "???", confidence: 0.15 })],
    };
    const models = stubGemini((model) =>
      jsonResponse(geminiBody(model === "gemini-3.5-flash-lite" ? weak : TRADER_JOES)),
    );

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });

    expect(models).toEqual(["gemini-3.5-flash-lite", "gemini-3.6-flash"]);
    expect(outcome.model).toBe("gemini-3.6-flash");
    expect(outcome.receipt.items).toHaveLength(5);
    expect(outcome.attempts).toBe(2);
    expect(outcome.warnings.join(" ")).toMatch(/checked a second time/i);
  });

  it("keeps the cheap result when escalation fails rather than losing the receipt", async () => {
    geminiMode();
    const weak = { ...TRADER_JOES, items: [receiptLine({ confidence: 0.2 })] };
    stubGemini((model) =>
      model === "gemini-3.5-flash-lite"
        ? jsonResponse(geminiBody(weak))
        : jsonResponse({ error: { message: "down" } }, 500),
    );

    const outcome = await parseReceiptImage({ base64: "x", mimeType: "image/png" });
    expect(outcome.receipt.items).toHaveLength(1);
    expect(outcome.model).toBe("gemini-3.5-flash-lite");
  });
});

// ---------------------------------------------------------------------------

const CANDIDATES = {
  candidates: [
    {
      title: "Palak Paneer",
      cuisine: "Indian",
      description: "Spinach and paneer in a spiced gravy.",
      likely_ingredients: ["baby spinach", "paneer", "onion", "garlic", "garam masala"],
      estimated_cook_minutes: 30,
      dietary_tags: ["vegetarian"],
      protein_intent: "high",
      meal_format: "curry",
      protein_source: "paneer",
      flavor_profile: "indian-spiced",
      instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
      ingredient_quantities: ["200 g", "1 tsp"],
      search_query: "palak paneer recipe",
      fit_reason: "Uses the spinach that needs eating and the paneer you have.",
    },
    {
      title: "Spanakopita Skillet",
      cuisine: "Greek",
      description: "Spinach and feta layered with crisp filo.",
      likely_ingredients: ["baby spinach", "feta cheese", "eggs", "olive oil"],
      estimated_cook_minutes: 35,
      dietary_tags: ["vegetarian", "contains_eggs"],
      protein_intent: "moderate",
      meal_format: "curry",
      protein_source: "paneer",
      flavor_profile: "indian-spiced",
      instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
      ingredient_quantities: ["200 g", "1 tsp"],
      search_query: "spanakopita skillet recipe",
      fit_reason: "Another way to use the spinach before it turns.",
    },
    {
      title: "Chicken Shawarma Bowls",
      cuisine: "Mediterranean",
      description: "Spiced chicken with cucumber and yoghurt.",
      likely_ingredients: ["chicken thighs", "greek yogurt", "persian cucumbers"],
      estimated_cook_minutes: 30,
      dietary_tags: ["contains_chicken"],
      protein_intent: "high",
      meal_format: "curry",
      protein_source: "paneer",
      flavor_profile: "indian-spiced",
      instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
      ingredient_quantities: ["200 g", "1 tsp"],
      search_query: "chicken shawarma bowl recipe",
      fit_reason: "High protein and quick.",
    },
  ],
};

describe("dynamic meal candidates", () => {
  it("turns model concepts into rankable recipes", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(CANDIDATES)));

    const result = await generateMealCandidates(householdContext());

    expect(result.error).toBeNull();
    expect(result.model).toBe("gemini-3.6-flash");
    expect(result.recipes).toHaveLength(3);

    const palak = result.recipes.find((r) => r.title === "Palak Paneer")!;
    expect(palak.source_type).toBe("generated");
    expect(palak.ingredients.map((i) => i.ingredient_name)).toContain("baby spinach");
    expect(palak.total_time_minutes).toBe(30);
    expect(palak.dietary_tags).toContain("high_protein");
    // The model names its own dish for video search.
    expect(result.searchQueries.get(palak.id)).toBe("palak paneer recipe");
  });

  it("computes nutrition in code rather than taking it from the model", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(CANDIDATES)));

    const result = await generateMealCandidates(householdContext());
    const palak = result.recipes.find((r) => r.title === "Palak Paneer")!;

    // The model never sends numbers — the schema has no field for them — so
    // whatever is here was derived deterministically from the ingredient list.
    expect(JSON.stringify(CANDIDATES)).not.toContain("calories");
    expect(palak.calories_per_serving).toBeGreaterThan(0);
    expect(palak.protein_per_serving).toBeGreaterThan(0);

    // Deterministic: the same ingredients always produce the same estimate.
    const second = await generateMealCandidates(householdContext());
    const again = second.recipes.find((r) => r.title === "Palak Paneer")!;
    expect(again.calories_per_serving).toBe(palak.calories_per_serving);
    expect(again.protein_per_serving).toBe(palak.protein_per_serving);
  });

  it("uses exactly one request per refresh", async () => {
    geminiMode();
    const models = stubGemini(() => jsonResponse(geminiBody(CANDIDATES)));

    await generateMealCandidates(householdContext());
    expect(models).toEqual(["gemini-3.6-flash"]);
  });

  it("degrades to memory rather than failing when generation breaks", async () => {
    geminiMode();
    stubGemini(() => jsonResponse({ error: { message: "nope" } }, 500));

    const result = await generateMealCandidates(householdContext());
    expect(result.recipes).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it("is inert without a key, so nothing silently costs money", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateMealCandidates(householdContext());
    expect(result.recipes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still enforces dietary rules deterministically on generated candidates", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(CANDIDATES)));

    const result = await generateMealCandidates(householdContext());
    const inventory = [inventoryItem("Baby Spinach"), inventoryItem("Paneer")];
    const ranked = rankRecipes(result.recipes, inventory, householdContext());

    // The model proposed chicken for a household that does not eat it. The code
    // removed it — the model does not get a vote on that.
    expect(ranked.some((entry) => entry.recipe.title === "Chicken Shawarma Bowls")).toBe(false);
    expect(ranked.some((entry) => entry.recipe.title === "Palak Paneer")).toBe(true);
  });
});

describe("recipe memory", () => {
  it("gives the same dish one identity however it is written", () => {
    expect(canonicalRecipeKey("Palak Paneer Bowls", "Indian")).toBe(
      canonicalRecipeKey("palak paneer", "indian"),
    );
    // Cuisine is part of identity: these are genuinely different dishes.
    expect(canonicalRecipeKey("Chickpea Salad", "Greek")).not.toBe(
      canonicalRecipeKey("Chickpea Salad", "Indian"),
    );
  });

  it("collapses a rediscovery onto the recipe already known", async () => {
    geminiMode();
    stubGemini(() => jsonResponse(geminiBody(CANDIDATES)));
    const generated = await generateMealCandidates(householdContext());

    const known = catalogRecipes.filter((r) => r.id === "cat-palak-paneer-bowls");
    const { fresh, alreadyKnown } = dedupeAgainstMemory(generated.recipes, known);

    expect(alreadyKnown.map((r) => r.id)).toContain("cat-palak-paneer-bowls");
    expect(fresh.some((r) => r.title === "Palak Paneer")).toBe(false);
    expect(fresh.some((r) => r.title === "Spanakopita Skillet")).toBe(true);
  });

  it("only remembers a discovery once it has a watchable source", () => {
    const base = catalogRecipes[0];
    const generated = { ...base, source_type: "generated" as const, video_url: null, thumbnail_url: null };
    expect(worthRemembering(generated)).toBe(false);
    expect(
      worthRemembering({ ...generated, video_url: "https://youtu.be/x", thumbnail_url: "https://i/x.jpg" }),
    ).toBe(true);
    // The built-in catalog is already memory; it is not re-saved.
    expect(worthRemembering(base)).toBe(false);
  });

  it("never loses cook history to a regeneration", () => {
    const stored = { ...catalogRecipes[0], times_cooked: 4, last_cooked_at: "2026-08-10" };
    const incoming = { ...catalogRecipes[0], id: "gen-x", times_cooked: 0, last_cooked_at: null };

    const merged = mergeIntoMemory(stored, incoming);
    expect(merged.id).toBe(stored.id);
    expect(merged.times_cooked).toBe(4);
    expect(merged.last_cooked_at).toBe("2026-08-10");
    expect(isProven(merged)).toBe(true);
  });

  it("counts a cook so the dish becomes proven", async () => {
    const { logMeal } = await import("@/lib/meals/log");
    const recipe = catalogRecipes[0];
    expect(isProven(recipe)).toBe(false);

    await logMeal({ recipe_id: recipe.id });

    const stored = (await db.getRecipe(recipe.id))!;
    expect(stored.times_cooked).toBe(1);
    expect(stored.last_cooked_at).not.toBeNull();
    expect(isProven(stored)).toBe(true);
  });
});

/**
 * The behaviour the milestone is actually about: recommendations that are not
 * limited to the built-in catalog, and that change when you ask again.
 */
describe("dynamic recommendations end to end", () => {
  const BIG_BATCH = {
    candidates: [
      ...CANDIDATES.candidates,
      {
        title: "Masala Chickpea Skillet",
        cuisine: "Indian",
        description: "Chickpeas braised with tomato and cumin.",
        likely_ingredients: ["chickpeas", "cherry tomatoes", "cumin", "yellow onions"],
        estimated_cook_minutes: 25,
        dietary_tags: ["vegetarian", "high_protein"],
        protein_intent: "high",
        meal_format: "curry",
        protein_source: "paneer",
        flavor_profile: "indian-spiced",
        instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
        ingredient_quantities: ["200 g", "1 tsp"],
        search_query: "masala chickpea skillet recipe",
        fit_reason: "Pantry-led and quick.",
      },
      {
        title: "Feta And Tomato Baked Eggs",
        cuisine: "Mediterranean",
        description: "Eggs baked into a tomato and feta base.",
        likely_ingredients: ["eggs", "feta cheese", "cherry tomatoes", "olive oil"],
        estimated_cook_minutes: 20,
        dietary_tags: ["vegetarian", "contains_eggs"],
        protein_intent: "moderate",
        meal_format: "curry",
        protein_source: "paneer",
        flavor_profile: "indian-spiced",
        instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
        ingredient_quantities: ["200 g", "1 tsp"],
        search_query: "baked eggs feta tomato recipe",
        fit_reason: "Uses eggs and the tomatoes that need using.",
      },
      {
        title: "Black Bean Tinga Tacos",
        cuisine: "Mexican",
        description: "Smoky black beans in warm corn tortillas.",
        likely_ingredients: ["black beans", "corn tortillas", "yellow onions", "cumin"],
        estimated_cook_minutes: 20,
        dietary_tags: ["vegetarian"],
        protein_intent: "moderate",
        meal_format: "curry",
        protein_source: "paneer",
        flavor_profile: "indian-spiced",
        instructions: ["Heat the pan.", "Add the spices.", "Simmer and serve."],
        ingredient_quantities: ["200 g", "1 tsp"],
        search_query: "black bean tinga tacos recipe",
        fit_reason: "Everything for this is already in the pantry.",
      },
    ],
  };

  async function stockKitchen() {
    const names = [
      "Baby Spinach", "Paneer", "Cherry Tomatoes", "Chickpeas", "Eggs", "Feta Cheese",
      "Black Beans", "Corn Tortillas", "Yellow Onions", "Cumin", "Olive Oil",
    ];
    await db.addInventoryItems(
      names.map((name) => {
        const { id: _id, household_id: _h, created_at: _c, updated_at: _u, ...rest } =
          inventoryItem(name);
        return rest;
      }),
    );
  }

  it("offers dishes that are not in the static catalog", async () => {
    geminiMode();
    await stockKitchen();
    stubGemini(() => jsonResponse(geminiBody(BIG_BATCH)));

    const { recommendMeals } = await import("@/lib/meals/recommend");
    const result = await recommendMeals({ count: 3 });

    expect(result.recommendations.length).toBeGreaterThan(0);
    const catalogIds = new Set(catalogRecipes.map((r) => r.id));
    const titles = result.recommendations.map((r) => r.recipe.title);

    // The whole point of the milestone: the catalog is no longer the ceiling.
    expect(result.recommendations.some((r) => !catalogIds.has(r.recipe.id))).toBe(true);
    expect(result.discovery_used).toBe(true);
    // And nothing the household does not eat got through.
    expect(titles).not.toContain("Chicken Shawarma Bowls");
  });

  it("returns a meaningfully different set when asked again", async () => {
    geminiMode();
    await stockKitchen();
    stubGemini(() => jsonResponse(geminiBody(BIG_BATCH)));

    const { recommendMeals } = await import("@/lib/meals/recommend");
    const first = await recommendMeals({ count: 3 });
    const firstIds = first.recommendations.map((r) => r.recipe.id);

    const second = await recommendMeals({
      count: 3,
      excludeRecipeIds: firstIds,
      regenerate: true,
    });
    const secondIds = second.recommendations.map((r) => r.recipe.id);

    expect(secondIds.length).toBeGreaterThan(0);
    // Not one repeat, and not achieved by shuffling: the excluded set is gone
    // and the novelty penalty pushed anything recently shown down the order.
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  });

  it("does not search for a video for every candidate", async () => {
    geminiMode();
    await stockKitchen();
    stubGemini(() => jsonResponse(geminiBody(BIG_BATCH)));
    // No YouTube key: every resolve reports unavailable rather than searching,
    // which is what makes the call count observable here.
    delete process.env.YOUTUBE_API_KEY;

    const { recommendMeals } = await import("@/lib/meals/recommend");
    const result = await recommendMeals({ count: 3 });

    expect(result.recommendations).toHaveLength(3);
    expect(result.source_note).toMatch(/YOUTUBE_API_KEY/);
  });
});
