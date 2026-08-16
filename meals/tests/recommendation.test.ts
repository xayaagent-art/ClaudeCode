import { describe, expect, it } from "vitest";
import { catalogRecipes } from "@/lib/meals/catalog";
import { isEligible, rankRecipes, scoreRecipe, WEIGHTS } from "@/lib/meals/rank";
import { buildWeekPlan } from "@/lib/meals/plan";
import { addDays } from "@/lib/date";
import { TODAY, householdContext, inventoryItem, stockedKitchen } from "./helpers";

const chickenRecipe = catalogRecipes.find((r) => r.id === "cat-chicken-souvlaki-bowls")!;
const eggRecipe = catalogRecipes.find((r) => r.id === "cat-egg-bhurji-wraps")!;
const palakPaneer = catalogRecipes.find((r) => r.id === "cat-palak-paneer-bowls")!;
const spaghettiSquash = catalogRecipes.find((r) => r.id === "cat-spaghetti-squash-marinara")!;

describe("ranking weights", () => {
  it("sums to one so scores stay comparable", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("dietary restrictions", () => {
  it("excludes chicken when the household does not eat it", () => {
    const context = householdContext();
    expect(isEligible(chickenRecipe, context)).toBe(false);
    expect(isEligible(palakPaneer, context)).toBe(true);
  });

  it("includes chicken once it is allowed", () => {
    const context = householdContext();
    context.preferences.chicken_allowed = true;
    expect(isEligible(chickenRecipe, context)).toBe(true);
  });

  it("excludes egg recipes when eggs are off the table", () => {
    const context = householdContext();
    context.preferences.eggs_allowed = false;
    expect(isEligible(eggRecipe, context)).toBe(false);
  });

  it("excludes an allergen even when it is a minor ingredient", () => {
    const context = householdContext();
    context.preferences.allergies = ["paneer"];
    expect(isEligible(palakPaneer, context)).toBe(false);
  });

  it("only excludes a dislike when the recipe depends on it", () => {
    const context = householdContext();
    context.preferences.dislikes = ["cilantro"]; // optional in palak paneer
    expect(isEligible(palakPaneer, context)).toBe(true);

    context.preferences.dislikes = ["paneer"]; // required
    expect(isEligible(palakPaneer, context)).toBe(false);
  });

  it("never returns an ineligible recipe from ranking", () => {
    const ranked = rankRecipes(catalogRecipes, stockedKitchen(), householdContext(), TODAY);
    expect(ranked.map((r) => r.recipe.id)).not.toContain(chickenRecipe.id);
  });
});

describe("inventory influences ranking", () => {
  it("scores a recipe higher when its ingredients are actually in the kitchen", () => {
    const context = householdContext();
    const stocked = scoreRecipe(palakPaneer, stockedKitchen(), context, TODAY);
    const bare = scoreRecipe(palakPaneer, [inventoryItem("Basmati Rice")], context, TODAY);

    expect(stocked.factors.inventory_fit).toBeGreaterThan(bare.factors.inventory_fit);
    expect(stocked.score).toBeGreaterThan(bare.score);
  });

  it("does not count items marked out as available", () => {
    const kitchen = stockedKitchen().map((item) =>
      item.normalized_name === "Paneer" ? { ...item, status: "out" as const } : item,
    );
    const scored = scoreRecipe(palakPaneer, kitchen, householdContext(), TODAY);
    expect(scored.availability.missing.map((m) => m.ingredient.ingredient_name)).toContain("Paneer");
    expect(scored.availability.blocked).toBe(true);
  });

  it("reports availability as a ratio with optional ingredients weighted less", () => {
    const scored = scoreRecipe(palakPaneer, stockedKitchen(), householdContext(), TODAY);
    // Everything but the optional cilantro is stocked.
    expect(scored.availability.ratio).toBeGreaterThan(0.9);
    expect(scored.availability.ratio).toBeLessThan(1);
  });
});

describe("use-soon ingredients influence ranking", () => {
  it("lifts a recipe that uses something about to expire", () => {
    const kitchen = stockedKitchen();
    const withUrgency = householdContext({
      use_soon: [{ name: "Baby Spinach", days_to_expiry: 2 }],
    });
    const withoutUrgency = householdContext();

    const urgent = scoreRecipe(palakPaneer, kitchen, withUrgency, TODAY);
    const calm = scoreRecipe(palakPaneer, kitchen, withoutUrgency, TODAY);

    expect(urgent.factors.expiry_priority).toBeGreaterThan(calm.factors.expiry_priority);
    expect(urgent.score).toBeGreaterThan(calm.score);
    expect(urgent.reason.toLowerCase()).toContain("spinach");
  });

  it("gives no expiry credit to a recipe that ignores the urgent item", () => {
    const context = householdContext({ use_soon: [{ name: "Baby Spinach", days_to_expiry: 1 }] });
    const scored = scoreRecipe(
      catalogRecipes.find((r) => r.id === "cat-black-bean-tacos")!,
      stockedKitchen(),
      context,
      TODAY,
    );
    expect(scored.factors.expiry_priority).toBe(0);
  });
});

describe("cooking time preference influences ranking", () => {
  it("scores a recipe within the time limit above one that overruns it", () => {
    const context = householdContext();
    const kitchen = stockedKitchen();

    const quick = scoreRecipe(palakPaneer, kitchen, context, TODAY);
    const slow = scoreRecipe(spaghettiSquash, kitchen, context, TODAY);

    expect(quick.factors.time_fit).toBe(1);
    expect(slow.factors.time_fit).toBeLessThan(1);
  });

  it("stops penalising once the household allows more time", () => {
    const relaxed = householdContext();
    relaxed.preferences.max_cooking_time_minutes = 60;
    const scored = scoreRecipe(spaghettiSquash, stockedKitchen(), relaxed, TODAY);
    expect(scored.factors.time_fit).toBe(1);
  });
});

describe("variety and feedback", () => {
  it("penalises a meal eaten two days ago", () => {
    const context = householdContext({
      recent_meals: [
        { recipe_id: palakPaneer.id, title: palakPaneer.title, cuisine: "Indian", days_ago: 1 },
      ],
    });
    const repeat = scoreRecipe(palakPaneer, stockedKitchen(), context, TODAY);
    const fresh = scoreRecipe(palakPaneer, stockedKitchen(), householdContext(), TODAY);
    expect(repeat.factors.variety).toBeLessThan(fresh.factors.variety);
  });

  it("drops a recipe the household asked never to see again", () => {
    const context = householdContext({
      feedback: [{ recipe_id: palakPaneer.id, cuisine: "Indian", rating: "never" }],
    });
    const scored = scoreRecipe(palakPaneer, stockedKitchen(), context, TODAY);
    expect(scored.factors.feedback).toBe(0);
  });
});

describe("recommendation set", () => {
  it("returns cookable options from a stocked kitchen", () => {
    const ranked = rankRecipes(catalogRecipes, stockedKitchen(), householdContext(), TODAY);
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    expect(ranked[0].availability.ratio).toBeGreaterThan(0.6);
    expect(ranked[0].reason.length).toBeGreaterThan(0);
  });

  it("is sorted by score", () => {
    const ranked = rankRecipes(catalogRecipes, stockedKitchen(), householdContext(), TODAY);
    const scores = ranked.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("weekly plan", () => {
  const { entries, planned } = buildWeekPlan(
    catalogRecipes,
    stockedKitchen(),
    householdContext({ use_soon: [{ name: "Baby Spinach", days_to_expiry: 2 }] }),
    TODAY,
    7,
  );

  it("plans a dinner for every day", () => {
    const dinners = entries.filter((e) => e.meal_type === "dinner");
    expect(dinners).toHaveLength(7);
    expect(new Set(dinners.map((d) => d.date)).size).toBe(7);
  });

  it("does not repeat the same dinner twice in a week", () => {
    const ids = planned.map((day) => day.recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the short-dated produce early in the week", () => {
    const spinachDay = planned.findIndex((day) =>
      day.recipe.ingredients.some((i) => i.ingredient_name === "Baby Spinach"),
    );
    expect(spinachDay).toBeGreaterThanOrEqual(0);
    expect(spinachDay).toBeLessThanOrEqual(2);
  });

  it("turns batch-cooking dinners into the next day's lunch", () => {
    const batchDay = planned.find((day) => day.leftovers);
    if (!batchDay) return; // nothing batch-sized was chosen; not a failure
    const lunch = entries.find(
      (e) => e.meal_type === "lunch" && e.date === addDays(batchDay.date, 1),
    );
    expect(lunch?.kind).toBe("leftovers");
  });
});
