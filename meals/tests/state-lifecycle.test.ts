import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The state lifecycle, pinned.
 *
 * Every fault this covers had the same shape: the screen was the only place
 * the answer lived, so leaving the screen destroyed it and coming back asked
 * the model again. These assert the rule that replaces that — persisted state
 * is the source of truth, and the model is only ever asked when a person asks.
 */

const scratch = mkdtempSync(join(tmpdir(), "meals-state-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { recommendMeals } = await import("@/lib/meals/recommend");
const { getCurrentRecommendations, groupIntoLatestSet } = await import(
  "@/lib/views/recommendations"
);
const { getTodayPayload } = await import("@/lib/views/today");
const { getRecipeDetail } = await import("@/lib/views/recipe");
const { planCovers } = await import("@/lib/db/plan-window");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { inventoryItem } = await import("./helpers");
const { addDays, todayISO } = await import("@/lib/date");

const db = localDatabase();

/** Counts every outbound call, so "did this reach the model" is answerable. */
let aiCalls = 0;

function stubModel() {
  aiCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      aiCalls += 1;
      const concepts = [
        "Spinach Paneer Curry",
        "Chickpea Tomato Stew",
        "Black Bean Tacos",
        "Greek Feta Salad",
        "Lemon Rice Pilaf",
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

describe("recommendation state survives navigation", () => {
  it("serves the current set from storage without asking the model again", async () => {
    await stockKitchen();
    const first = await recommendMeals({ mealType: "dinner" });
    expect(first.recommendations.length).toBeGreaterThan(0);

    // Standing in for opening a recipe, watching a video and pressing back:
    // the screen is rebuilt from the server with no client state left.
    const callsAfterGenerating = aiCalls;
    const restored = await getCurrentRecommendations();

    expect(aiCalls).toBe(callsAfterGenerating);
    expect(restored.recommendations.map((r) => r.recipe.id)).toEqual(
      first.recommendations.map((r) => r.recipe.id),
    );
    expect(restored.generated_at).not.toBeNull();
  });

  it("returns one set, not a merge of every set ever shown", async () => {
    await stockKitchen();
    await recommendMeals({ mealType: "dinner" });
    const second = await recommendMeals({ mealType: "dinner", regenerate: true });

    const current = await getCurrentRecommendations();
    // The newest write wins outright; an older set must not pad it out.
    expect(current.recommendations.length).toBe(second.recommendations.length);
    expect(new Set(current.recommendations.map((r) => r.recipe.id))).toEqual(
      new Set(second.recommendations.map((r) => r.recipe.id)),
    );
  });

  it("groups a set by the write it belongs to", () => {
    const row = (id: string, batch: string | null, iso: string) =>
      ({
        recipe_id: id,
        batch_id: batch,
        created_at: iso,
        recommendation_reason: "",
        availability: 1,
        missing: [],
      }) as never;

    const rows = [
      row("a", "batch-2", "2026-08-20T10:00:02.000Z"),
      row("b", "batch-2", "2026-08-20T10:00:02.000Z"),
      // Written a few milliseconds earlier by a second press — a timestamp
      // window would have swallowed these, the batch id does not.
      row("c", "batch-1", "2026-08-20T10:00:01.980Z"),
      row("d", "batch-1", "2026-08-20T10:00:01.980Z"),
    ];
    expect(groupIntoLatestSet(rows).map((r) => r.recipe_id)).toEqual(["a", "b"]);
  });

  it("falls back to the timestamp for rows written before batches existed", () => {
    const row = (id: string, iso: string) =>
      ({
        recipe_id: id,
        batch_id: null,
        created_at: iso,
        recommendation_reason: "",
        availability: 1,
        missing: [],
      }) as never;
    const rows = [
      row("a", "2026-08-20T10:00:02.000Z"),
      row("b", "2026-08-20T10:00:02.000Z"),
      row("c", "2026-08-20T09:40:00.000Z"),
    ];
    expect(groupIntoLatestSet(rows).map((r) => r.recipe_id)).toEqual(["a", "b"]);
  });

  it("never offers a recipe whose detail page cannot open it", async () => {
    await stockKitchen();
    await recommendMeals({ mealType: "dinner" });

    const current = await getCurrentRecommendations();
    expect(current.recommendations.length).toBeGreaterThan(0);
    for (const rec of current.recommendations) {
      // The same lookup /recipes/[id] uses.
      expect(await getRecipeDetail(rec.recipe.id)).not.toBeNull();
    }
  });

  it("keeps Today on the current dynamic suggestion, not an older catalog one", async () => {
    await stockKitchen();
    // A catalog dish recommended long ago is exactly the stale card Today used
    // to show once dynamic generation started working.
    await db.saveRecommendations([
      {
        recipe_id: catalogRecipes[0].id,
        meal_type: "dinner",
        recommendation_reason: "An older catalog pick.",
        ranking_score: 0.9,
        ranking_factors: {} as never,
        availability: 0.9,
        missing: [],
      },
    ]);

    const generated = await recommendMeals({ mealType: "dinner" });
    const today = await getTodayPayload(todayISO());

    expect(today.latest_recommendation).not.toBeNull();
    expect(generated.recommendations.map((r) => r.recipe.id)).toContain(
      today.latest_recommendation!.recipe_id,
    );
    expect(today.latest_recommendation!.recipe_id).not.toBe(catalogRecipes[0].id);
  });

  it("reads Today from storage without generating anything", async () => {
    await stockKitchen();
    await recommendMeals({ mealType: "dinner" });

    const before = aiCalls;
    await getTodayPayload(todayISO());
    // Opening Today is not a request for a new suggestion.
    expect(aiCalls).toBe(before);
  });
});

describe("plan state", () => {
  it("still answers the day after it was made", () => {
    const start = "2026-08-17";
    const plan = {
      start_date: start,
      entries: Array.from({ length: 7 }, (_, index) => ({
        date: addDays(start, index),
        meal_type: "dinner" as const,
        kind: "recipe" as const,
        recipe_id: `r${index}`,
        recipe_title: `Dish ${index}`,
        note: null,
      })),
    } as never;

    // The bug: read on any day but the first, this returned nothing and Plan
    // offered to build a week that already existed.
    expect(planCovers(plan, start)).toBe(true);
    expect(planCovers(plan, addDays(start, 3))).toBe(true);
    expect(planCovers(plan, addDays(start, 6))).toBe(true);
    // Genuinely finished, and genuinely not started.
    expect(planCovers(plan, addDays(start, 7))).toBe(false);
    expect(planCovers(plan, addDays(start, -1))).toBe(false);
  });

  it("retrieves a plan saved earlier in the week", async () => {
    const start = addDays(todayISO(), -2);
    await db.savePlan({
      start_date: start,
      entries: Array.from({ length: 7 }, (_, index) => ({
        date: addDays(start, index),
        meal_type: "dinner" as const,
        kind: "recipe" as const,
        recipe_id: catalogRecipes[index % catalogRecipes.length].id,
        recipe_title: catalogRecipes[index % catalogRecipes.length].title,
        note: null,
      })),
    });

    const current = await db.getCurrentPlan(todayISO());
    expect(current).not.toBeNull();
    expect(current!.start_date).toBe(start);
  });

  it("resolves every planned recipe id", async () => {
    const start = todayISO();
    await db.savePlan({
      start_date: start,
      entries: Array.from({ length: 7 }, (_, index) => ({
        date: addDays(start, index),
        meal_type: "dinner" as const,
        kind: "recipe" as const,
        recipe_id: catalogRecipes[index % catalogRecipes.length].id,
        recipe_title: catalogRecipes[index % catalogRecipes.length].title,
        note: null,
      })),
    });

    const plan = await db.getCurrentPlan(start);
    for (const entry of plan!.entries) {
      if (!entry.recipe_id) continue;
      expect(await db.getRecipe(entry.recipe_id)).not.toBeNull();
    }
  });

  it("replaces one day without disturbing the other six", async () => {
    await stockKitchen();
    const start = todayISO();
    const entries = Array.from({ length: 7 }, (_, index) => ({
      date: addDays(start, index),
      meal_type: "dinner" as const,
      kind: "recipe" as const,
      recipe_id: catalogRecipes[index % catalogRecipes.length].id,
      recipe_title: catalogRecipes[index % catalogRecipes.length].title,
      note: null,
    }));
    await db.savePlan({ start_date: start, entries });

    const target = addDays(start, 3);
    const before = await db.getCurrentPlan(start);
    const callsBefore = aiCalls;

    const { POST } = await import("@/app/api/plans/day/route");
    const response = await POST(
      new Request("http://test/api/plans/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: start, date: target }),
      }),
    );
    expect(response.status).toBe(200);

    const after = await db.getCurrentPlan(start);
    const changed = after!.entries.filter((entry, index) => {
      const was = before!.entries[index];
      return entry.recipe_id !== was.recipe_id;
    });

    // Exactly one dinner moved, and swapping a day never calls the model.
    expect(changed).toHaveLength(1);
    expect(changed[0].date).toBe(target);
    expect(aiCalls).toBe(callsBefore);
    // The replacement has to be openable, like every other link in the week.
    expect(await db.getRecipe(changed[0].recipe_id!)).not.toBeNull();
  });
});
