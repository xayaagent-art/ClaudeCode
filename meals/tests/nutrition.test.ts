import { describe, expect, it } from "vitest";
import {
  MEAL_SHARE,
  logsForDay,
  macrosFor,
  portionFor,
  portionsFor,
  roundServings,
  targetsFor,
  totalsFor,
} from "@/lib/nutrition/engine";
import { estimateRecipeNutrition } from "@/lib/nutrition/estimate";
import { catalogRecipes } from "@/lib/meals/catalog";
import { seedMembers } from "@/lib/seed";
import type { MealLog } from "@/lib/types";

const recipe = catalogRecipes.find((r) => r.id === "cat-palak-paneer-bowls")!;
const [yash, survi] = seedMembers;

function log(overrides: Partial<MealLog>): MealLog {
  return {
    id: crypto.randomUUID(),
    household_id: "h",
    member_id: yash.id,
    recipe_id: recipe.id,
    recipe_title: recipe.title,
    meal_type: "dinner",
    servings: 1,
    calories: 620,
    protein: 42,
    consumed_at: "2026-08-15T19:00:00.000Z",
    batch_id: "b1",
    ...overrides,
  };
}

describe("serving maths", () => {
  it("is deterministic and quarter-serving granular", () => {
    expect(roundServings(1.31)).toBe(1.25);
    expect(roundServings(1.4)).toBe(1.5);

    const first = portionFor(recipe, yash, "dinner");
    const second = portionFor(recipe, yash, "dinner");
    expect(first).toEqual(second);
  });

  it("scales calories and protein directly from the serving count", () => {
    const portion = portionFor(recipe, yash, "dinner");
    expect(portion.calories).toBe(Math.round(recipe.calories_per_serving * portion.servings));
    expect(portion.protein).toBe(Math.round(recipe.protein_per_serving * portion.servings));
  });

  it("gives the household member with the larger target the larger portion", () => {
    const [forYash, forSurvi] = portionsFor(recipe, [yash, survi], "dinner");
    expect(forYash.servings).toBeGreaterThan(forSurvi.servings);
    expect(forYash.calories).toBeGreaterThan(forSurvi.calories);
  });

  it("sizes a portion from the meal's share of the daily target", () => {
    const portion = portionFor(recipe, yash, "dinner");
    const expected = (yash.profile.calorie_target * MEAL_SHARE.dinner) / recipe.calories_per_serving;
    expect(portion.servings).toBe(roundServings(expected));
  });
});

describe("daily totals", () => {
  const logs = [
    log({ member_id: yash.id, calories: 620, protein: 42 }),
    log({ member_id: survi.id, calories: 470, protein: 31, batch_id: "b1" }),
    log({ member_id: yash.id, calories: 400, protein: 25, batch_id: "b2" }),
    log({ member_id: yash.id, calories: 999, protein: 99, consumed_at: "2026-08-14T19:00:00.000Z" }),
  ];

  it("totals a single member's day", () => {
    const today = logsForDay(logs, "2026-08-15");
    expect(totalsFor(today, yash.id)).toEqual({ calories: 1020, protein: 67 });
  });

  it("totals the whole household", () => {
    const today = logsForDay(logs, "2026-08-15");
    expect(totalsFor(today, null)).toEqual({ calories: 1490, protein: 98 });
  });

  it("excludes meals eaten on another day", () => {
    expect(logsForDay(logs, "2026-08-15")).toHaveLength(3);
    expect(totalsFor(logsForDay(logs, "2026-08-14"), yash.id).calories).toBe(999);
  });

  it("sums targets per scope", () => {
    expect(targetsFor([yash, survi], yash.id).protein).toBe(150);
    expect(targetsFor([yash, survi], null)).toEqual({ calories: 3750, protein: 250 });
  });
});

describe("macro breakdown", () => {
  const withMacros = () => ({ carbs: 60, fat: 18 });
  const withoutMacros = () => ({ carbs: null, fat: null });

  const logs = [
    log({ member_id: yash.id, protein: 42, servings: 1.5 }),
    log({ member_id: survi.id, protein: 31, servings: 1 }),
  ];

  it("scales derived macros by the servings actually logged", () => {
    const totals = macrosFor(logs, null, withMacros);
    expect(totals.carbs).toBe(150); // 60 * 1.5 + 60 * 1
    expect(totals.fat).toBe(45); // 18 * 1.5 + 18 * 1
    expect(totals.logs_covered).toBe(2);
  });

  it("takes protein from the log rather than deriving it", () => {
    // The stub reports no macros at all; protein still totals, because it was
    // measured when the meal was logged.
    expect(macrosFor(logs, null, withoutMacros).protein).toBe(73);
  });

  it("reports unknown macros as null, never as zero", () => {
    const totals = macrosFor(logs, null, withoutMacros);
    expect(totals.carbs).toBeNull();
    expect(totals.fat).toBeNull();
    expect(totals.logs_covered).toBe(0);
    expect(totals.logs_total).toBe(2);
  });

  it("scopes to one member", () => {
    const totals = macrosFor(logs, survi.id, withMacros);
    expect(totals.protein).toBe(31);
    expect(totals.carbs).toBe(60);
    expect(totals.logs_total).toBe(1);
  });

  it("says how much of the day it could break down", () => {
    const mixed = macrosFor(logs, null, (id) => (id === recipe.id ? { carbs: 10, fat: 2 } : withoutMacros()));
    expect(mixed.logs_covered).toBe(2);
    expect(mixed.logs_total).toBe(2);
  });
});

describe("recipe macro estimates", () => {
  it("derives carbohydrate and fat from the ingredient list", () => {
    const estimate = estimateRecipeNutrition(recipe.ingredients);
    expect(estimate.carbs_per_serving).toBeGreaterThan(0);
    expect(estimate.fat_per_serving).toBeGreaterThan(0);
  });

  it("stays consistent with the energy it reports", () => {
    // Atwater: the macros should account for the calories to within the
    // rounding and the unmatched-ingredient gap, not drift by a factor.
    const e = estimateRecipeNutrition(recipe.ingredients);
    const fromMacros = 4 * e.protein_per_serving + 4 * e.carbs_per_serving! + 9 * e.fat_per_serving!;
    expect(fromMacros).toBeGreaterThan(e.calories_per_serving * 0.6);
    expect(fromMacros).toBeLessThan(e.calories_per_serving * 1.6);
  });

  it("returns null macros when nothing in the list resolves", () => {
    const estimate = estimateRecipeNutrition([
      { ingredient_name: "zzzz unmatchable", quantity: 1, unit: "cup", optional: false },
    ] as typeof recipe.ingredients);
    expect(estimate.carbs_per_serving).toBeNull();
    expect(estimate.fat_per_serving).toBeNull();
    expect(estimate.calories_per_serving).toBe(0);
  });
});
