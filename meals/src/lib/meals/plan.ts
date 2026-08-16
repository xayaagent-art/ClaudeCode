import { addDays } from "@/lib/date";
import { canonicalName } from "@/lib/kitchen/match";
import { scoreRecipe } from "@/lib/meals/rank";
import type { HouseholdContext, InventoryItem, PlanEntry, Recipe } from "@/lib/types";
import { isEligible } from "@/lib/meals/rank";

/**
 * Weekly dinner planning.
 *
 * The point of a week plan is not seven independent good dinners — it is seven
 * dinners that share a shopping trip. So each day's score gets a bonus for
 * reusing ingredients already committed earlier in the week, batch-cooking
 * recipes push their leftovers onto the next day's lunch, and the use-soon
 * bonus decays because spinach bought today will not still be good on Friday.
 */

const REUSE_BONUS = 0.12;
const REPEAT_PENALTY = 0.5;
/** A dinner that cooks four portions buys back a lunch, so it is worth a nudge. */
const BATCH_BONUS = 0.05;
/** Charged per recent day sharing this recipe's cuisine, so a week is not all curry. */
const CUISINE_FATIGUE = 0.07;
/** Charged per recent day sharing this recipe's protein, so a week is not all eggs. */
const PROTEIN_FATIGUE = 0.06;

const PROTEIN_KEYS = ["egg", "paneer", "chicken", "chickpea", "black bean", "kidney bean", "lentil", "feta"];

function proteinOf(recipe: Recipe): string | null {
  const keys = new Set(recipe.ingredients.map((i) => canonicalName(i.ingredient_name)));
  return PROTEIN_KEYS.find((key) => keys.has(key)) ?? null;
}

function ingredientKeys(recipe: Recipe): Set<string> {
  return new Set(
    recipe.ingredients.filter((i) => !i.optional).map((i) => canonicalName(i.ingredient_name)),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let shared = 0;
  for (const key of a) if (b.has(key)) shared += 1;
  return shared / a.size;
}

export interface PlannedDay {
  date: string;
  recipe: Recipe;
  reason: string;
  availability: number;
  leftovers: boolean;
}

export function buildWeekPlan(
  candidates: Recipe[],
  inventory: InventoryItem[],
  context: HouseholdContext,
  startDate: string,
  days = 7,
): { entries: PlanEntry[]; planned: PlannedDay[] } {
  const eligible = candidates.filter((recipe) => isEligible(recipe, context));
  const planned: PlannedDay[] = [];
  const entries: PlanEntry[] = [];
  const committed = new Set<string>();
  const usedIngredients = new Set<string>();
  const pendingLeftovers: { date: string; title: string; recipeId: string }[] = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const date = addDays(startDate, dayIndex);

    // Fresh, short-dated produce is only realistically usable early in the week.
    const expiryWeight = dayIndex <= 1 ? 1 : dayIndex <= 3 ? 0.5 : 0;

    // Recency window used by the fatigue penalties below.
    const lookback = planned.slice(-3);

    let best: { recipe: Recipe; total: number; reason: string; availability: number } | null = null;

    for (const recipe of eligible) {
      const scored = scoreRecipe(recipe, inventory, context);
      const keys = ingredientKeys(recipe);
      const reuse = overlapRatio(keys, usedIngredients);

      const makesLeftovers =
        recipe.servings >= 4 || recipe.dietary_tags.includes("batch_cooks");
      const cuisineRepeats = lookback.filter((day) => day.recipe.cuisine === recipe.cuisine).length;
      const protein = proteinOf(recipe);
      const proteinRepeats = protein
        ? lookback.filter((day) => proteinOf(day.recipe) === protein).length
        : 0;

      let total =
        scored.score -
        scored.factors.expiry_priority * 0.1 * (1 - expiryWeight) +
        reuse * REUSE_BONUS +
        (makesLeftovers ? BATCH_BONUS : 0) -
        cuisineRepeats * CUISINE_FATIGUE -
        proteinRepeats * PROTEIN_FATIGUE;
      if (committed.has(recipe.id)) total -= REPEAT_PENALTY;

      if (!best || total > best.total) {
        best = { recipe, total, reason: scored.reason, availability: scored.availability.ratio };
      }
    }

    if (!best) break;

    const chosen = best;
    committed.add(chosen.recipe.id);
    for (const key of ingredientKeys(chosen.recipe)) usedIngredients.add(key);

    const makesLeftovers =
      chosen.recipe.servings >= 4 || chosen.recipe.dietary_tags.includes("batch_cooks");

    planned.push({
      date,
      recipe: chosen.recipe,
      reason: chosen.reason,
      availability: chosen.availability,
      leftovers: makesLeftovers,
    });

    entries.push({
      date,
      meal_type: "dinner",
      kind: "recipe",
      recipe_id: chosen.recipe.id,
      recipe_title: chosen.recipe.title,
      note: chosen.reason,
    });

    if (makesLeftovers && dayIndex + 1 < days) {
      pendingLeftovers.push({
        date: addDays(startDate, dayIndex + 1),
        title: chosen.recipe.title,
        recipeId: chosen.recipe.id,
      });
    }
  }

  for (const leftover of pendingLeftovers) {
    entries.push({
      date: leftover.date,
      meal_type: "lunch",
      kind: "leftovers",
      recipe_id: leftover.recipeId,
      recipe_title: leftover.title,
      note: `Leftover ${leftover.title.toLowerCase()}`,
    });
  }

  entries.sort((a, b) =>
    a.date === b.date ? (a.meal_type === "lunch" ? -1 : 1) : a.date.localeCompare(b.date),
  );

  return { entries, planned };
}
