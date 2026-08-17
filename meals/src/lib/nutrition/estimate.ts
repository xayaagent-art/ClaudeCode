import { builtinGenericMatch } from "@/lib/nutrition/sources";
import type { RecipeIngredient } from "@/lib/types";

/**
 * Deterministic nutrition estimate for a recipe that arrived without numbers.
 *
 * A generated meal concept has an ingredient list and nothing else. Leaving its
 * calories at zero is not neutral — the ranker reads those numbers, so a zero
 * silently guarantees the dish loses on nutrition fit and no dynamic candidate
 * can ever win. Asking the model for the numbers is worse: they would look like
 * measurements and become a ranking signal built on a guess.
 *
 * So the code estimates, from the same generic per-100g table the rest of the
 * app uses, with fixed assumed portions. It is coarse and it is honest about
 * being coarse — good enough to rank with, and never presented as a measurement.
 */

/** Assumed grams per serving, by the role an ingredient plays in a dish. */
const PORTION_GRAMS = {
  /** Rice, pasta, beans, the protein — what the plate is built on. */
  base: 110,
  /** Vegetables and dairy that show up in quantity. */
  body: 70,
  /** Aromatics: onion, garlic, ginger. */
  aromatic: 20,
  /** Oils and fats, used sparingly but calorie-dense. */
  fat: 10,
  /** Spices and herbs. Nutritionally irrelevant, included for completeness. */
  trace: 2,
} as const;

const FAT_WORDS = ["oil", "butter", "ghee", "cream"];
const AROMATIC_WORDS = ["onion", "garlic", "ginger", "shallot", "scallion", "chilli", "chili"];
const TRACE_WORDS = [
  "salt", "pepper", "cumin", "masala", "turmeric", "paprika", "oregano", "cinnamon",
  "coriander", "spice", "herb", "bay", "chilli flake", "seasoning",
];
const BASE_WORDS = [
  "rice", "pasta", "noodle", "bean", "chickpea", "lentil", "paneer", "tofu", "chicken",
  "egg", "quinoa", "potato", "tortilla", "bread", "squash", "fish", "yogurt", "yoghurt",
];

function portionFor(name: string): number {
  const lower = name.toLowerCase();
  if (TRACE_WORDS.some((word) => lower.includes(word))) return PORTION_GRAMS.trace;
  if (FAT_WORDS.some((word) => lower.includes(word))) return PORTION_GRAMS.fat;
  if (AROMATIC_WORDS.some((word) => lower.includes(word))) return PORTION_GRAMS.aromatic;
  if (BASE_WORDS.some((word) => lower.includes(word))) return PORTION_GRAMS.base;
  return PORTION_GRAMS.body;
}

export interface NutritionEstimate {
  calories_per_serving: number;
  protein_per_serving: number;
  /** How much of the ingredient list the generic table actually recognised. */
  coverage: number;
}

/**
 * Estimate per-serving calories and protein from an ingredient list.
 *
 * Optional ingredients are excluded — a garnish should not decide whether a
 * dish reads as high protein. Results are clamped to a plausible dinner range
 * so a table miss cannot produce a 4,000-calorie recommendation.
 */
export function estimateRecipeNutrition(ingredients: RecipeIngredient[]): NutritionEstimate {
  const used = ingredients.filter((ingredient) => !ingredient.optional);
  if (used.length === 0) {
    return { calories_per_serving: 0, protein_per_serving: 0, coverage: 0 };
  }

  let calories = 0;
  let protein = 0;
  let matched = 0;

  for (const ingredient of used) {
    const match = builtinGenericMatch(ingredient.ingredient_name);
    if (!match) continue;
    matched += 1;
    const grams = portionFor(ingredient.ingredient_name);
    calories += (match.calories_per_100g * grams) / 100;
    protein += (match.protein_per_100g * grams) / 100;
  }

  const coverage = matched / used.length;
  // Nothing recognised means we genuinely do not know; say so rather than
  // returning a confident-looking zero.
  if (matched === 0) return { calories_per_serving: 0, protein_per_serving: 0, coverage: 0 };

  return {
    calories_per_serving: Math.round(Math.min(Math.max(calories, 150), 1200)),
    protein_per_serving: Math.round(Math.min(Math.max(protein, 3), 90)),
    coverage: Math.round(coverage * 100) / 100,
  };
}
