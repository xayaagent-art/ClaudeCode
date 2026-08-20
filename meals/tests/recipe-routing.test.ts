import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Every link the product renders must open.
 *
 * The failure these exist to prevent shipped once and reached a phone: a
 * recommendation rendered, the card linked to `/recipes/<id>`, and the route
 * answered "We couldn't find that". The cause was upstream of any UI — a
 * `Recipe` field was added in code and the column was never added to the
 * deployed database, so `upsertRecipe` sent a column PostgREST rejects, every
 * write failed, and the recipe the card pointed at had never been stored.
 *
 * So these do not test that a component renders. They take the id the product
 * would actually put in the href and push it through the same lookup the
 * recipe route uses, which is the only thing that proves the link works.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-routing-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { recommendMeals } = await import("@/lib/meals/recommend");
const { getTodayPayload } = await import("@/lib/views/today");
const { getCurrentRecommendations } = await import("@/lib/views/recommendations");
const { getRecipeDetail } = await import("@/lib/views/recipe");
const { inventoryItem } = await import("./helpers");
const { todayISO } = await import("@/lib/date");

const db = localDatabase();

function stubModel() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const concepts = [
        "Spinach Paneer Curry",
        "Chickpea Tomato Stew",
        "Black Bean Tacos",
        "Greek Feta Salad",
      ].map((title) => ({
        title,
        cuisine: "Indian",
        description: `A dish of ${title.toLowerCase()}.`,
        likely_ingredients: ["baby spinach", "paneer", "cumin"],
        estimated_cook_minutes: 25,
        dietary_tags: ["vegetarian"],
        protein_intent: "moderate",
        search_query: `${title.toLowerCase()} recipe`,
        fit_reason: "Uses the spinach you already have.",
        meal_format: "curry",
        protein_source: "paneer",
        flavor_profile: "indian-spiced",
        instructions: ["Heat the oil.", "Add the spices.", "Simmer and serve."],
        ingredient_quantities: ["200 g", "150 g", "1 tsp"],
      }));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify({ candidates: concepts }) }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 800 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
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
  stubModel();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("every recipe id the product renders resolves", () => {
  it("opens the dinner Today links to", async () => {
    await stockKitchen();
    await recommendMeals({ mealType: "dinner" });

    // Exactly what the page renders into href={`/recipes/${recipe_id}`}.
    const payload = await getTodayPayload(todayISO());
    expect(payload.latest_recommendation).not.toBeNull();

    const href = payload.latest_recommendation!.recipe_id;
    // And exactly what /recipes/[id] does with it.
    expect(await getRecipeDetail(href)).not.toBeNull();
  });

  it("opens every alternative in the current set", async () => {
    await stockKitchen();
    await recommendMeals({ mealType: "dinner" });

    const set = await getCurrentRecommendations();
    expect(set.recommendations.length).toBeGreaterThan(0);

    for (const entry of set.recommendations) {
      expect(await getRecipeDetail(entry.recipe.id)).not.toBeNull();
    }
  });

  it("opens every dinner on the saved week", async () => {
    await stockKitchen();
    const { POST } = await import("@/app/api/plans/generate/route");
    const response = await POST(
      new Request("http://test/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      }),
    );
    expect(response.status).toBe(200);

    const plan = await db.getCurrentPlan(todayISO());
    const planned = (plan?.entries ?? []).filter(
      (entry) => entry.kind === "recipe" && entry.recipe_id,
    );
    expect(planned.length).toBeGreaterThan(0);

    for (const entry of planned) {
      expect(await getRecipeDetail(entry.recipe_id!)).not.toBeNull();
    }
  });

  it("survives a swap: the replacement day opens too", async () => {
    await stockKitchen();
    const { POST: generate } = await import("@/app/api/plans/generate/route");
    await generate(
      new Request("http://test/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      }),
    );

    const start = todayISO();
    const before = await db.getCurrentPlan(start);
    const target = before!.entries[3].date;

    const { POST: swap } = await import("@/app/api/plans/day/route");
    await swap(
      new Request("http://test/api/plans/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: start, date: target }),
      }),
    );

    const after = await db.getCurrentPlan(start);
    const replaced = after!.entries.find(
      (entry) => entry.date === target && entry.meal_type === "dinner",
    );
    expect(replaced?.recipe_id).toBeTruthy();
    expect(await getRecipeDetail(replaced!.recipe_id!)).not.toBeNull();
  });
});

/**
 * The exact columns the deployed database has for `recipes`, read from
 * Supabase at the time this was written.
 *
 * `upsertRecipe` writes the whole Recipe object, so this list and the Recipe
 * type must agree — a field present in code and absent in the database makes
 * every recipe write 400, which drops the dish before it is stored and turns
 * every card linking to it into "We couldn't find that". That shipped once.
 *
 * Adding a field to Recipe should fail this test. The fix is not to edit the
 * list: it is to apply the migration to the deployed database first, confirm
 * the column exists, and then update the list in the same change.
 */
const DEPLOYED_RECIPE_COLUMNS = [
  "attribution", "calories_per_serving", "canonical_key", "cook_time_minutes",
  "cooking_summary", "created_at", "cuisine", "description", "dietary_tags",
  "discovered_at", "id", "image_url", "instructions", "last_cooked_at",
  "prep_time_minutes", "protein_per_serving", "servings", "source_name",
  "source_quality", "source_type", "source_url", "thumbnail_url",
  "times_cooked", "title", "total_time_minutes", "video_platform", "video_url",
].sort();

describe("the write path a link depends on", () => {
  it("writes no column the deployed database does not have", async () => {
    const { catalogRecipes } = await import("@/lib/meals/catalog");
    // Exactly what upsertRecipe sends: the Recipe minus its ingredients.
    const { ingredients: _ingredients, ...row } = catalogRecipes[0];
    expect(Object.keys(row).sort()).toEqual(DEPLOYED_RECIPE_COLUMNS);
  });

  it("stores every column the Recipe type declares", async () => {
    // The M3 regression in one assertion. `upsertRecipe` writes the whole
    // Recipe object, so a field added in code is a column the database must
    // already have — otherwise the write 400s, materialize drops the dish, and
    // the card links to a recipe that was never stored. Adding a field to
    // Recipe without a migration applied to the deployed database is what
    // breaks this, and it breaks it silently everywhere at once.
    const { catalogRecipes } = await import("@/lib/meals/catalog");
    const sample = { ...catalogRecipes[0], id: "write-path-check" };

    await db.upsertRecipe(sample);
    const readBack = await db.getRecipe(sample.id);
    expect(readBack).not.toBeNull();

    for (const key of Object.keys(sample) as (keyof typeof sample)[]) {
      if (key === "ingredients") continue;
      expect(readBack, `${String(key)} did not survive the round trip`).toHaveProperty(key);
    }
  });
});
