import type { MealLog, MealType, Member, Recipe } from "@/lib/types";

/**
 * Deterministic nutrition maths. No model ever performs arithmetic here — the
 * AI layer is only allowed to *match* a product to a nutrition record; every
 * number the user sees is computed by these functions.
 */

/** Share of a day's calories a meal type is expected to carry. */
export const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.22,
  lunch: 0.3,
  dinner: 0.35,
  snack: 0.13,
};

const MIN_SERVINGS = 0.5;
const MAX_SERVINGS = 2.5;

/** Round to the nearest quarter serving — the finest granularity worth showing. */
export function roundServings(value: number): number {
  return Math.round(value * 4) / 4;
}

export function clampServings(value: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, value));
}

export interface Portion {
  member_id: string;
  member_name: string;
  servings: number;
  calories: number;
  protein: number;
}

/**
 * Portion for one member: enough of this recipe to cover their share of the
 * day's calories. Members with different targets get different servings of the
 * same recipe rather than a separate recipe.
 */
export function portionFor(recipe: Recipe, member: Member, mealType: MealType): Portion {
  const targetCalories = member.profile.calorie_target * MEAL_SHARE[mealType];
  const perServing = recipe.calories_per_serving > 0 ? recipe.calories_per_serving : 1;
  const servings = clampServings(roundServings(targetCalories / perServing));
  return {
    member_id: member.id,
    member_name: member.name,
    servings,
    calories: Math.round(recipe.calories_per_serving * servings),
    protein: Math.round(recipe.protein_per_serving * servings),
  };
}

export function portionsFor(recipe: Recipe, members: Member[], mealType: MealType): Portion[] {
  return members.map((member) => portionFor(recipe, member, mealType));
}

export interface DayTotals {
  calories: number;
  protein: number;
}

/** Sum a member's logs. Pass `null` for the whole household. */
export function totalsFor(logs: MealLog[], memberId: string | null): DayTotals {
  return logs
    .filter((log) => memberId === null || log.member_id === memberId)
    .reduce<DayTotals>(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        protein: acc.protein + log.protein,
      }),
      { calories: 0, protein: 0 },
    );
}

export function targetsFor(members: Member[], memberId: string | null): DayTotals {
  const scope = memberId === null ? members : members.filter((m) => m.id === memberId);
  return scope.reduce<DayTotals>(
    (acc, member) => ({
      calories: acc.calories + member.profile.calorie_target,
      protein: acc.protein + member.profile.protein_target,
    }),
    { calories: 0, protein: 0 },
  );
}

/** Logs whose consumed_at falls on the given local calendar day. */
export function logsForDay(logs: MealLog[], dayISO: string): MealLog[] {
  return logs.filter((log) => log.consumed_at.slice(0, 10) === dayISO);
}

export interface MacroTotals {
  /** Grams eaten. Protein is persisted per log; the other two are derived. */
  protein: number;
  carbs: number | null;
  fat: number | null;
  /**
   * How many of the day's logs we could break down. The UI needs this to say
   * "estimated from 2 of 3 meals" rather than presenting a partial sum as the
   * day's total.
   */
  logs_covered: number;
  logs_total: number;
}

/**
 * Carbohydrate and fat eaten today, worked out from the recipes behind the
 * logs.
 *
 * Calories and protein are recorded at the moment a meal is logged, so they are
 * measurements of what the household said it ate. Carbohydrate and fat are not
 * stored anywhere — the recipe row has never carried them — so they are derived
 * here from the ingredient list, at the serving size actually logged.
 *
 * That difference is deliberate and is surfaced in the UI: the ring is real,
 * the carbohydrate and fat figures are labelled as estimates. The alternative
 * considered was inventing carbohydrate and fat targets by splitting the
 * calorie goal, which would put two invented numbers on the screen; a household
 * that has not set those targets does not have them, and the screen says so.
 */
export function macrosFor(
  logs: MealLog[],
  memberId: string | null,
  perServing: (recipeId: string) => { carbs: number | null; fat: number | null },
): MacroTotals {
  const scope = logs.filter((log) => memberId === null || log.member_id === memberId);

  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let covered = 0;

  for (const log of scope) {
    protein += log.protein;
    const per = perServing(log.recipe_id);
    if (per.carbs === null || per.fat === null) continue;
    covered += 1;
    carbs += per.carbs * log.servings;
    fat += per.fat * log.servings;
  }

  return {
    protein: Math.round(protein),
    carbs: covered > 0 ? Math.round(carbs) : null,
    fat: covered > 0 ? Math.round(fat) : null,
    logs_covered: covered,
    logs_total: scope.length,
  };
}
