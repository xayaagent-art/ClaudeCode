import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The OpenAI provider switch, exercised entirely against stubs.
 *
 * Nothing here reaches the network or spends anything: `fetch` returns
 * Responses-API-shaped payloads, so model discovery, the call layer, candidate
 * generation, the dietary backstop and the recipe-id invariant are all driven
 * by the code a real key would run.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-openai-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { chooseModel, openAIModelFor, openAIModelHint, resetOpenAIModelCatalogue, listOpenAIModels } =
  await import("@/lib/ai/openai-models");
const { resetOpenAIClient } = await import("@/lib/ai/providers/openai-provider");
const { generateMealCandidates, candidateGenerationEnabled } = await import(
  "@/lib/meals/candidates"
);
const { animalProductsInName, animalProductsIn } = await import("@/lib/meals/diet");
const { isEligible, rankRecipes } = await import("@/lib/meals/rank");
const { recommendMeals } = await import("@/lib/meals/recommend");
const { getRecipeDetail } = await import("@/lib/views/recipe");
const { buildHouseholdContext } = await import("@/lib/household/context");
const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { inventoryItem } = await import("./helpers");

const db = localDatabase();

// ---------------------------------------------------------------------------

/** A Responses-API success payload the OpenAI SDK will parse. */
function responsePayload(body: unknown, options: { incompleteReason?: string } = {}) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1,
    model: "gpt-5.6-terra",
    status: options.incompleteReason ? "incomplete" : "completed",
    incomplete_details: options.incompleteReason ? { reason: options.incompleteReason } : null,
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(body), annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 1200,
      output_tokens: 800,
      total_tokens: 2000,
      output_tokens_details: { reasoning_tokens: 250 },
    },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function modelsPayload(ids: string[]) {
  return {
    object: "list",
    data: ids.map((id) => ({ id, object: "model", created: 1, owned_by: "openai" })),
  };
}

/**
 * Stub the API by route, so a test does not have to know whether model
 * discovery happens to run first.
 */
function stubOpenAI(handlers: {
  models?: () => Response;
  responses?: (body: Record<string, unknown>) => Response;
}) {
  const seen: { url: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
      seen.push({ url, body });

      if (url.includes("/models")) {
        return (handlers.models ?? (() => jsonResponse(modelsPayload(DEFAULT_MODELS))))();
      }
      return (handlers.responses ?? (() => jsonResponse(responsePayload({}))))(body ?? {});
    }),
  );
  return seen;
}

const DEFAULT_MODELS = [
  "gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini",
  "gpt-5.6-luna", "gpt-5.6-luna-2026-07-01", "gpt-5.6-terra",
  "text-embedding-3-small", "whisper-1",
];

const CONCEPTS = [
  {
    title: "Palak Paneer",
    cuisine: "Indian",
    description: "Spinach and paneer in a spiced gravy.",
    likely_ingredients: ["baby spinach", "paneer", "yellow onions", "garam masala"],
    estimated_cook_minutes: 30,
    dietary_tags: ["vegetarian"],
    protein_intent: "high",
    search_query: "palak paneer recipe",
    fit_reason: "Uses the spinach that needs eating and the paneer you have.",
  },
  {
    title: "Chana Masala",
    cuisine: "Indian",
    description: "Chickpeas simmered with tomato and cumin.",
    likely_ingredients: ["chickpeas", "cherry tomatoes", "cumin", "yellow onions"],
    estimated_cook_minutes: 25,
    dietary_tags: ["vegetarian"],
    protein_intent: "moderate",
    search_query: "chana masala recipe",
    fit_reason: "Store-cupboard dinner from what is already in the kitchen.",
  },
  {
    title: "Greek Chickpea Salad",
    cuisine: "Greek",
    description: "Chickpeas, cucumber and feta with olive oil.",
    likely_ingredients: ["chickpeas", "persian cucumbers", "feta cheese", "olive oil"],
    estimated_cook_minutes: 15,
    dietary_tags: ["vegetarian", "quick"],
    protein_intent: "moderate",
    search_query: "greek chickpea salad recipe",
    fit_reason: "Nothing to cook on a hot evening.",
  },
];

function openAIMode() {
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  process.env.OPENAI_RETRY_BASE_MS = "1";
  resetOpenAIClient();
}

async function stockKitchen() {
  const names = [
    "Baby Spinach", "Paneer", "Cherry Tomatoes", "Chickpeas", "Feta Cheese",
    "Yellow Onions", "Cumin", "Olive Oil", "Persian Cucumbers", "Garam Masala",
  ];
  await db.addInventoryItems(
    names.map((name) => {
      const { id: _i, household_id: _h, created_at: _c, updated_at: _u, ...rest } =
        inventoryItem(name);
      return rest;
    }),
  );
}

beforeEach(async () => {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_RECEIPT_MODEL;
  delete process.env.OPENAI_MEAL_MODEL;
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.DYNAMIC_MEALS;
  resetOpenAIClient();
  resetOpenAIModelCatalogue();
  await resetLocalDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetOpenAIClient();
  resetOpenAIModelCatalogue();
});

// ---------------------------------------------------------------------------

describe("model ids are discovered, never guessed", () => {
  it("resolves each task to the id the account actually has", () => {
    expect(chooseModel("receipt_vision", DEFAULT_MODELS)).toBe("gpt-5.6-luna");
    expect(chooseModel("meal_generation", DEFAULT_MODELS)).toBe("gpt-5.6-terra");
  });

  it("falls back through model tiers rather than to nothing", () => {
    // No luna/terra on this account: the next-best real id wins.
    expect(chooseModel("receipt_vision", ["gpt-4o", "gpt-5", "gpt-5-mini"])).toBe("gpt-5");
    // Nothing recognisable at all: a conservative id, not an invented one.
    expect(chooseModel("meal_generation", ["whisper-1"])).toBe("gpt-5");
  });

  it("prefers the plain id over a dated variant of the same model", () => {
    expect(chooseModel("receipt_vision", ["gpt-5.6-luna-2026-07-01", "gpt-5.6-luna"])).toBe(
      "gpt-5.6-luna",
    );
  });

  it("lets an env override win without touching the network", async () => {
    openAIMode();
    process.env.OPENAI_MEAL_MODEL = "gpt-5-mini";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await openAIModelFor("meal_generation")).toBe("gpt-5-mini");
    expect(openAIModelHint("meal_generation")).toBe("gpt-5-mini");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the catalogue once per process, not once per call", async () => {
    openAIMode();
    const seen = stubOpenAI({});

    await openAIModelFor("receipt_vision");
    await openAIModelFor("meal_generation");
    await openAIModelFor("receipt_vision");

    expect(seen.filter((call) => call.url.includes("/models"))).toHaveLength(1);
  });

  it("degrades to a known id when discovery itself fails", async () => {
    openAIMode();
    stubOpenAI({ models: () => jsonResponse({ error: { message: "nope" } }, 500) });

    // Discovery is an optimisation, not a dependency: a failed list must not
    // take receipt scanning down with it.
    expect(await listOpenAIModels()).toEqual([]);
    expect(await openAIModelFor("receipt_vision")).toBe("gpt-5");
  });
});

// ---------------------------------------------------------------------------

describe("dynamic meal generation on OpenAI", () => {
  it("turns model concepts into rankable recipes", async () => {
    openAIMode();
    stubOpenAI({ responses: () => jsonResponse(responsePayload({ candidates: CONCEPTS })) });

    const { context } = await buildHouseholdContext("dinner");
    const result = await generateMealCandidates(context);

    expect(result.outcome).toBe("generated");
    expect(result.error).toBeNull();
    expect(result.model).toBe("gpt-5.6-terra");
    expect(result.recipes).toHaveLength(3);

    const palak = result.recipes.find((r) => r.title === "Palak Paneer")!;
    expect(palak.source_type).toBe("generated");
    expect(palak.ingredients.map((i) => i.ingredient_name)).toContain("baby spinach");
    expect(palak.dietary_tags).toContain("high_protein");
    expect(result.searchQueries.get(palak.id)).toBe("palak paneer recipe");
  });

  it("asks with strict structured output, and asks once", async () => {
    openAIMode();
    const seen = stubOpenAI({
      responses: () => jsonResponse(responsePayload({ candidates: CONCEPTS })),
    });

    const { context } = await buildHouseholdContext("dinner");
    await generateMealCandidates(context);

    const calls = seen.filter((call) => call.url.includes("/responses"));
    expect(calls).toHaveLength(1);

    const format = (calls[0].body?.text as { format?: Record<string, unknown> })?.format;
    expect(format?.type).toBe("json_schema");
    expect(format?.strict).toBe(true);
    // Strict mode rejects an open object; the schema has to say so itself.
    expect((format?.schema as Record<string, unknown>).additionalProperties).toBe(false);
  });

  it("computes nutrition in code rather than taking it from the model", async () => {
    openAIMode();
    stubOpenAI({ responses: () => jsonResponse(responsePayload({ candidates: CONCEPTS })) });

    const { context } = await buildHouseholdContext("dinner");
    const result = await generateMealCandidates(context);
    const palak = result.recipes.find((r) => r.title === "Palak Paneer")!;

    // The schema has no field for a number, so whatever is here was derived
    // deterministically from the ingredient list.
    expect(JSON.stringify(CONCEPTS)).not.toContain("calories");
    expect(palak.calories_per_serving).toBeGreaterThan(0);
    expect(palak.protein_per_serving).toBeGreaterThan(0);
  });

  it("reports a provider failure as a typed failure, never as no ideas", async () => {
    openAIMode();
    process.env.OPENAI_MAX_ATTEMPTS = "1";
    stubOpenAI({ responses: () => jsonResponse({ error: { message: "slow down" } }, 429) });

    const { context } = await buildHouseholdContext("dinner");
    const result = await generateMealCandidates(context);

    expect(result.outcome).toBe("failed");
    expect(result.failureKind).toBe("rate_limit");
    expect(result.recipes).toEqual([]);
    delete process.env.OPENAI_MAX_ATTEMPTS;
  });

  it("is inert without a key, so nothing silently costs money", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(candidateGenerationEnabled()).toBe(false);
    const { context } = await buildHouseholdContext("dinner");
    const result = await generateMealCandidates(context);

    expect(result.outcome).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off in mock mode, so fixtures and real ideas never blend", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    expect(candidateGenerationEnabled()).toBe(false);
  });

  it("honours the DYNAMIC_MEALS kill switch", async () => {
    openAIMode();
    process.env.DYNAMIC_MEALS = "off";
    expect(candidateGenerationEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("dietary rules read ingredients, not just tags", () => {
  it("names the animal products in an ingredient", () => {
    expect([...animalProductsInName("chicken thighs")]).toEqual(["chicken"]);
    expect([...animalProductsInName("smoked bacon")]).toEqual(["red_meat"]);
    expect([...animalProductsInName("king prawns")]).toEqual(["seafood"]);
    expect([...animalProductsInName("free range eggs")]).toEqual(["egg"]);
  });

  it("does not mistake a plant for an animal", () => {
    // Every one of these has previously broken a substring-matching filter.
    for (const name of [
      "eggplant", "chickpeas", "beefsteak tomato", "hamburger bun",
      "oyster mushrooms", "graham crackers", "buttermilk",
    ]) {
      expect(animalProductsInName(name), name).toEqual(new Set());
    }
  });

  it("treats an imitation product as what it is", () => {
    expect(animalProductsInName("vegan chorizo")).toEqual(new Set());
    expect(animalProductsInName("plant based chicken strips")).toEqual(new Set());
  });

  it("rejects a mis-tagged chicken dish on its ingredients alone", async () => {
    const { context } = await buildHouseholdContext("dinner");
    // Chicken needs every member to be up for it, and only one of them is — so
    // the seeded household is the "no chicken" case, and allowing it is the
    // variation.
    const noChicken = context;
    const chickenOk = {
      ...context,
      preferences: { ...context.preferences, chicken_allowed: true },
    };

    const misTagged = {
      ...catalogRecipes[0],
      id: "gen-mistagged",
      title: "Weeknight Traybake",
      // The model claimed this was vegetarian. It is not.
      dietary_tags: ["vegetarian", "high_protein"],
      ingredients: [
        {
          id: "i1", recipe_id: "gen-mistagged", ingredient_name: "chicken thighs",
          normalized_name: "chicken", quantity: null, unit: null, optional: false,
        },
        {
          id: "i2", recipe_id: "gen-mistagged", ingredient_name: "yellow onions",
          normalized_name: "onion", quantity: null, unit: null, optional: false,
        },
      ],
    };

    expect(animalProductsIn(misTagged).has("chicken")).toBe(true);
    expect(isEligible(misTagged, noChicken)).toBe(false);
    expect(rankRecipes([misTagged], [], noChicken)).toHaveLength(0);
    // The same dish is fine for a household that does eat chicken — the filter
    // enforces the preference, it does not ban an ingredient outright.
    expect(isEligible(misTagged, chickenOk)).toBe(true);
  });

  it("keeps vegetarian meaning vegetarian for fish, which no tag mentioned", async () => {
    const { context } = await buildHouseholdContext("dinner");
    const vegetarian = { ...context, preferences: { ...context.preferences, vegetarian: true } };

    const fish = {
      ...catalogRecipes[0],
      id: "gen-fish",
      title: "Lemon Salmon Traybake",
      dietary_tags: ["high_protein"],
      ingredients: [
        {
          id: "f1", recipe_id: "gen-fish", ingredient_name: "salmon fillets",
          normalized_name: "salmon", quantity: null, unit: null, optional: false,
        },
      ],
    };

    expect(isEligible(fish, vegetarian)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the recipe-id invariant holds end to end on OpenAI", () => {
  it("every id returned to the client opens through the same lookup", async () => {
    openAIMode();
    await stockKitchen();
    stubOpenAI({ responses: () => jsonResponse(responsePayload({ candidates: CONCEPTS })) });

    const result = await recommendMeals({ count: 3 });
    expect(result.recommendations.length).toBeGreaterThan(0);

    for (const rec of result.recommendations) {
      // /recipes/[id] resolves through exactly this call. If it returns null
      // here, the app has surfaced a dish that cannot be opened.
      const detail = await getRecipeDetail(rec.recipe.id, "dinner");
      expect(detail, `${rec.recipe.title} should open`).not.toBeNull();
      expect(detail!.recipe.title).toBe(rec.recipe.title);
    }
  });

  it("keeps them openable after a regeneration", async () => {
    openAIMode();
    await stockKitchen();
    stubOpenAI({ responses: () => jsonResponse(responsePayload({ candidates: CONCEPTS })) });

    const first = await recommendMeals({ count: 3 });
    const second = await recommendMeals({
      count: 3,
      excludeRecipeIds: first.recommendations.map((r) => r.recipe.id),
      regenerate: true,
    });

    for (const rec of [...first.recommendations, ...second.recommendations]) {
      expect(await getRecipeDetail(rec.recipe.id, "dinner")).not.toBeNull();
    }
  });
});
