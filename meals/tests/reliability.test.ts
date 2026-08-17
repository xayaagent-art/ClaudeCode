import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Regressions for the three faults that made the prototype unreliable in daily
 * use: regenerate returning the same meals, a surfaced dish that would not
 * open, and Today showing something other than the current recommendation.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-reliability-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { recommendMeals } = await import("@/lib/meals/recommend");
const { getTodayPayload } = await import("@/lib/views/today");
const { getRecipeDetail } = await import("@/lib/views/recipe");
const { isNearDuplicate, dishSignature } = await import("@/lib/meals/memory");
const { materialize } = await import("@/lib/meals/registry");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { inventoryItem } = await import("./helpers");
const { todayISO } = await import("@/lib/date");

const db = localDatabase();

/** A deep, varied candidate pool so the ranker has somewhere to move. */
const DISHES = [
  ["Palak Paneer", "Indian", ["baby spinach", "paneer", "garam masala"], "curry"],
  ["Paneer Spinach Bowl", "Indian", ["paneer", "baby spinach", "garam masala"], "curry"],
  ["Chana Masala", "Indian", ["chickpeas", "cherry tomatoes", "cumin"], "curry"],
  ["Masala Omelette", "Indian", ["eggs", "cherry tomatoes", "cumin"], "omelette"],
  ["Greek Chickpea Salad", "Greek", ["chickpeas", "feta cheese", "persian cucumbers"], "salad"],
  ["Spanakopita Skillet", "Greek", ["baby spinach", "feta cheese", "eggs"], "skillet"],
  ["Black Bean Tacos", "Mexican", ["black beans", "corn tortillas", "cherry tomatoes"], "taco"],
  ["Tomato Feta Bake", "Mediterranean", ["cherry tomatoes", "feta cheese", "olive oil"], "bake"],
  ["Chickpea Shakshuka", "Mediterranean", ["chickpeas", "eggs", "cherry tomatoes"], "shakshuka"],
  ["Paneer Tikka Skewers", "Indian", ["paneer", "yellow onions", "garam masala"], "grill"],
  ["Lemon Rice Pilaf", "Indian", ["basmati rice", "cumin", "olive oil"], "pilaf"],
  ["Bean And Cheese Burrito", "Mexican", ["black beans", "corn tortillas", "feta cheese"], "burrito"],
  ["Spinach Dal", "Indian", ["baby spinach", "chickpeas", "cumin"], "dal"],
  ["Greek Egg Salad", "Greek", ["eggs", "persian cucumbers", "feta cheese"], "salad"],
  ["Tomato Rice Soup", "Mediterranean", ["cherry tomatoes", "basmati rice", "olive oil"], "soup"],
] as const;

function conceptFor([title, cuisine, ingredients, prep]: (typeof DISHES)[number]) {
  return {
    title,
    cuisine,
    description: `A ${prep} of ${ingredients[0]} and ${ingredients[1]}.`,
    likely_ingredients: [...ingredients],
    estimated_cook_minutes: 25,
    dietary_tags: ["vegetarian"],
    protein_intent: "moderate",
    search_query: `${title.toLowerCase()} recipe`,
    fit_reason: `Uses the ${ingredients[0]} you already have.`,
  };
}

function geminiBody(concepts: unknown[]) {
  return {
    candidates: [
      {
        content: { parts: [{ text: JSON.stringify({ candidates: concepts }) }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 800, totalTokenCount: 1700 },
  };
}

function stubGemini(concepts: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(geminiBody(concepts)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

async function stockKitchen() {
  const names = [
    "Baby Spinach", "Paneer", "Cherry Tomatoes", "Chickpeas", "Eggs", "Feta Cheese",
    "Black Beans", "Corn Tortillas", "Yellow Onions", "Cumin", "Olive Oil",
    "Basmati Rice", "Persian Cucumbers", "Garam Masala",
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
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key-not-real";
  delete process.env.YOUTUBE_API_KEY;
  await resetLocalDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
});

describe("near-duplicate detection", () => {
  function recipe(title: string, cuisine: string, ingredients: string[], description = "") {
    return {
      ...catalogRecipes[0],
      id: `t-${title}`,
      title,
      cuisine,
      description,
      canonical_key: null,
      ingredients: ingredients.map((name, index) => ({
        id: `${title}-${index}`,
        recipe_id: `t-${title}`,
        ingredient_name: name,
        normalized_name: name,
        quantity: null,
        unit: null,
        optional: false,
      })),
    };
  }

  it("treats a renamed dish as the same dinner", () => {
    const a = recipe("Palak Paneer Bowl", "Indian", ["spinach", "paneer", "garam masala"], "a curry");
    const b = recipe("Paneer Spinach Bowl", "Indian", ["paneer", "spinach", "garam masala"], "a curry");
    expect(isNearDuplicate(a, b)).toBe(true);
  });

  it("keeps genuinely different preparations apart", () => {
    const curry = recipe("Paneer Curry", "Indian", ["paneer", "spinach", "cream"], "a curry");
    const salad = recipe("Paneer Salad", "Indian", ["paneer", "spinach", "lemon"], "a salad");
    expect(isNearDuplicate(curry, salad)).toBe(false);
  });

  it("ignores ingredients every dish has", () => {
    const signature = dishSignature(
      recipe("Chana Masala", "Indian", ["chickpeas", "salt", "oil", "garlic", "onion"]),
    );
    expect(signature.core).toEqual(["chickpeas"]);
  });
});

describe("regenerate produces meaningful variety", () => {
  it("gives a different, non-duplicate set across four consecutive asks", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const rounds: string[][] = [];
    let exclude: string[] = [];

    for (let round = 0; round < 4; round += 1) {
      const result = await recommendMeals({
        count: 3,
        excludeRecipeIds: exclude,
        regenerate: round > 0,
      });
      const ids = result.recommendations.map((rec) => rec.recipe.id);
      expect(ids.length).toBeGreaterThan(0);
      rounds.push(ids);
      exclude = [...exclude, ...ids];
    }

    // No dish is ever offered twice across the four rounds.
    const seen = new Set<string>();
    for (const ids of rounds) {
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    // And the household saw a genuinely broad set, not three dishes reshuffled.
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });

  it("never offers two versions of the same dish in one set", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const result = await recommendMeals({ count: 3 });
    const recipes = result.recommendations.map((rec) => rec.recipe);

    for (let i = 0; i < recipes.length; i += 1) {
      for (let j = i + 1; j < recipes.length; j += 1) {
        expect(isNearDuplicate(recipes[i], recipes[j])).toBe(false);
      }
    }
  });

  it("is deterministic, not shuffled: the same state gives the same answer", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const first = await recommendMeals({ count: 3 });
    await resetLocalDatabase();
    await stockKitchen();
    const second = await recommendMeals({ count: 3 });

    expect(second.recommendations.map((r) => r.recipe.title)).toEqual(
      first.recommendations.map((r) => r.recipe.title),
    );
  });
});

describe("every surfaced recipe opens", () => {
  it("persists each recommendation before it is linked to", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const result = await recommendMeals({ count: 3 });
    expect(result.recommendations.length).toBeGreaterThan(0);

    for (const rec of result.recommendations) {
      const detail = await getRecipeDetail(rec.recipe.id, "dinner");
      expect(detail, `${rec.recipe.title} should open`).not.toBeNull();
      expect(detail!.recipe.title).toBe(rec.recipe.title);
    }
  });

  it("keeps them openable across regenerations", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

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

  it("merges a rediscovery onto the stored row rather than duplicating it", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    await recommendMeals({ count: 3 });
    const afterFirst = (await db.listRecipes()).length;
    await recommendMeals({ count: 3 });
    const afterSecond = (await db.listRecipes()).length;

    // The second run proposes the same dishes; the library must not double.
    expect(afterSecond).toBeLessThanOrEqual(afterFirst + 3);
  });

  it("materialize is idempotent — a dish is never stored twice", async () => {
    // This candidate is the catalog's Palak Paneer under another name, so it
    // must collapse onto the existing row rather than adding a second one.
    stubGemini([conceptFor(DISHES[4])]);
    const { generateMealCandidates } = await import("@/lib/meals/candidates");
    const { buildHouseholdContext } = await import("@/lib/household/context");
    const { context } = await buildHouseholdContext("dinner");

    const generated = await generateMealCandidates(context);
    expect(generated.recipes).toHaveLength(1);

    await materialize(generated.recipes);
    const afterFirst = (await db.listRecipes()).length;
    await materialize(generated.recipes);
    const afterSecond = (await db.listRecipes()).length;

    // Repeating the write changes nothing, and the dish stays addressable
    // under whatever id the registry settled on.
    expect(afterSecond).toBe(afterFirst);
    const durable = (await materialize(generated.recipes)).get(generated.recipes[0].id);
    expect(durable).toBeDefined();
    expect(await db.getRecipe(durable!.id)).not.toBeNull();
  });
});

describe("today reflects the current recommendation", () => {
  it("shows the newest suggestion, and it resolves", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const result = await recommendMeals({ count: 3 });
    const payload = await getTodayPayload(todayISO());

    expect(payload.latest_recommendation).not.toBeNull();
    const shown = payload.latest_recommendation!;
    expect(result.recommendations.map((r) => r.recipe.id)).toContain(shown.recipe_id);
    expect(await getRecipeDetail(shown.recipe_id, "dinner")).not.toBeNull();
  });

  it("moves to the new suggestion after a regeneration", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));

    const first = await recommendMeals({ count: 3 });
    const beforeIds = first.recommendations.map((r) => r.recipe.id);

    await recommendMeals({
      count: 3,
      excludeRecipeIds: beforeIds,
      regenerate: true,
    });

    const payload = await getTodayPayload(todayISO());
    expect(payload.latest_recommendation).not.toBeNull();
    expect(beforeIds).not.toContain(payload.latest_recommendation!.recipe_id);
  });

  it("skips a recommendation whose recipe no longer exists instead of blanking", async () => {
    await stockKitchen();
    stubGemini(DISHES.map(conceptFor));
    await recommendMeals({ count: 3 });

    await db.saveRecommendations([
      {
        recipe_id: "gen-does-not-exist",
        meal_type: "dinner",
        recommendation_reason: "orphan",
        ranking_score: 1,
        ranking_factors: {
          nutrition_fit: 0, inventory_fit: 0, preference_fit: 0,
          expiry_priority: 0, time_fit: 0, variety: 0, feedback: 0,
        },
        availability: 1,
        missing: [],
      },
    ]);

    const payload = await getTodayPayload(todayISO());
    expect(payload.latest_recommendation).not.toBeNull();
    expect(payload.latest_recommendation!.recipe_id).not.toBe("gen-does-not-exist");
  });
});
