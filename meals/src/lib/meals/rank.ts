import type { HouseholdContext, InventoryItem, RankingFactors, Recipe } from "@/lib/types";
import { assessRecipe, canonicalName, type RecipeAvailability } from "@/lib/kitchen/match";
import { currentConfidence } from "@/lib/kitchen/state";

/**
 * Transparent weighted ranking.
 *
 * Every factor is a pure 0–1 score and the weights are declared here rather than
 * buried in a prompt, so a bad recommendation can always be explained after the
 * fact. `ranking_factors` is persisted with each recommendation for exactly that.
 */
export const WEIGHTS: RankingFactors = {
  nutrition_fit: 0.3,
  inventory_fit: 0.25,
  preference_fit: 0.15,
  expiry_priority: 0.1,
  time_fit: 0.1,
  variety: 0.05,
  feedback: 0.05,
};

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  factors: RankingFactors;
  availability: RecipeAvailability;
  reason: string;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Hard filters. These are safety and dietary rules, never soft-scored. */
export function isEligible(recipe: Recipe, context: HouseholdContext): boolean {
  const prefs = context.preferences;
  const tags = recipe.dietary_tags;
  const ingredientNames = recipe.ingredients.map((i) => canonicalName(i.ingredient_name));

  if (tags.includes("contains_chicken") && !prefs.chicken_allowed) return false;
  if (tags.includes("contains_eggs") && !prefs.eggs_allowed) return false;
  if (prefs.vegetarian && tags.some((t) => t === "contains_beef" || t === "contains_pork")) {
    return false;
  }

  for (const allergy of prefs.allergies) {
    const canonicalAllergy = canonicalName(allergy);
    if (!canonicalAllergy) continue;
    if (ingredientNames.some((name) => name.includes(canonicalAllergy))) return false;
  }

  // A disliked ingredient only disqualifies when the recipe depends on it.
  for (const dislike of prefs.dislikes) {
    const canonicalDislike = canonicalName(dislike);
    if (!canonicalDislike) continue;
    const required = recipe.ingredients.some(
      (i) => !i.optional && canonicalName(i.ingredient_name) === canonicalDislike,
    );
    if (required) return false;
  }

  return true;
}

function nutritionFit(recipe: Recipe, context: HouseholdContext): number {
  const totals = context.household.members.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calorie_target,
      protein: acc.protein + m.protein_target,
      remainingCalories: acc.remainingCalories + Math.max(0, m.calories_remaining),
      remainingProtein: acc.remainingProtein + Math.max(0, m.protein_remaining),
    }),
    { calories: 0, protein: 0, remainingCalories: 0, remainingProtein: 0 },
  );
  if (totals.calories === 0 || recipe.calories_per_serving === 0) return 0.5;

  const targetDensity = totals.protein / totals.calories;
  const recipeDensity = recipe.protein_per_serving / recipe.calories_per_serving;
  // Exceeding the household's protein density is a good thing, not an overshoot.
  const proteinFit = targetDensity === 0 ? 0.5 : clamp01(recipeDensity / targetDensity);

  // A recipe that would blow through what is left of the day scores lower.
  const perHead = recipe.calories_per_serving;
  const budgetPerHead =
    context.household.members.length > 0
      ? totals.remainingCalories / context.household.members.length
      : perHead;
  const calorieFit = budgetPerHead <= 0 ? 0.2 : clamp01(budgetPerHead / Math.max(perHead, 1));

  return clamp01(0.7 * proteinFit + 0.3 * Math.min(1, calorieFit));
}

function preferenceFit(recipe: Recipe, context: HouseholdContext): number {
  const prefs = context.preferences;
  let score = prefs.preferred_cuisines.includes(recipe.cuisine) ? 1 : 0.45;

  const optionalDislikes = recipe.ingredients.filter(
    (i) => i.optional && prefs.dislikes.some((d) => canonicalName(d) === canonicalName(i.ingredient_name)),
  ).length;
  score -= optionalDislikes * 0.15;

  if (prefs.spice_preference === "mild" && recipe.dietary_tags.includes("spicy")) score -= 0.2;
  return clamp01(score);
}

function expiryPriority(availability: RecipeAvailability, context: HouseholdContext): number {
  // With nothing about to expire the factor is flat across every candidate, so
  // zero is the honest value — a neutral 0.5 would outrank recipes that really
  // do rescue something.
  if (context.use_soon.length === 0) return 0;
  const urgentNames = new Set(context.use_soon.map((u) => canonicalName(u.name)));
  const used = availability.have.filter(
    (entry) => entry.matched && urgentNames.has(canonicalName(entry.matched.normalized_name)),
  );
  if (used.length === 0) return 0;

  const urgency = used.reduce((acc, entry) => {
    const days = entry.days_to_expiry ?? 4;
    return acc + (days <= 1 ? 1 : days <= 2 ? 0.85 : 0.6);
  }, 0);
  return clamp01(urgency / 2);
}

function timeFit(recipe: Recipe, context: HouseholdContext): number {
  const max = context.preferences.max_cooking_time_minutes;
  if (max <= 0) return 0.5;
  if (recipe.total_time_minutes <= max) return 1;
  const overshoot = recipe.total_time_minutes - max;
  return clamp01(1 - overshoot / max);
}

function varietyFit(recipe: Recipe, context: HouseholdContext): number {
  const tolerance = context.preferences.repeat_tolerance;
  const recent = context.recent_meals;
  const sameRecipe = recent.find((m) => m.recipe_id === recipe.id);
  if (sameRecipe) {
    // Very recent repeats are heavily penalised unless tolerance is high.
    const recencyPenalty = sameRecipe.days_ago <= 2 ? 1 : sameRecipe.days_ago <= 7 ? 0.6 : 0.25;
    return clamp01(1 - recencyPenalty * (1 - tolerance));
  }
  const sameCuisineRecently = recent.filter(
    (m) => m.cuisine === recipe.cuisine && m.days_ago <= 3,
  ).length;
  return clamp01(1 - sameCuisineRecently * 0.25 * (1 - tolerance));
}

function feedbackFit(recipe: Recipe, context: HouseholdContext): number {
  const forRecipe = context.feedback.filter((f) => f.recipe_id === recipe.id);
  if (forRecipe.length > 0) {
    if (forRecipe.some((f) => f.rating === "never")) return 0;
    const loves = forRecipe.filter((f) => f.rating === "love").length;
    return loves > 0 ? 1 : 0.6;
  }
  const forCuisine = context.feedback.filter((f) => f.cuisine === recipe.cuisine);
  if (forCuisine.length === 0) return 0.5;
  const score =
    forCuisine.reduce((acc, f) => acc + (f.rating === "love" ? 1 : f.rating === "fine" ? 0.6 : 0), 0) /
    forCuisine.length;
  return clamp01(score);
}

function pluralJoin(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A single, specific sentence explaining the top reason this recipe surfaced.
 * Chosen from the factors that actually scored well, so the copy cannot drift
 * from the ranking.
 */
export function buildReason(
  recipe: Recipe,
  availability: RecipeAvailability,
  factors: RankingFactors,
  context: HouseholdContext,
): string {
  if (availability.uses_soon.length > 0 && factors.expiry_priority > 0.4) {
    return `Uses ${pluralJoin(availability.uses_soon.slice(0, 2).map((n) => n.toLowerCase()))} that should be eaten soon.`;
  }
  if (availability.missing.length === 0) {
    return "You already have everything this needs.";
  }
  if (factors.nutrition_fit > 0.8 && recipe.protein_per_serving >= 25) {
    const lead = context.household.members[0]?.name;
    return lead
      ? `${recipe.protein_per_serving} g protein a serving — good for ${lead}'s protein target.`
      : `${recipe.protein_per_serving} g protein a serving.`;
  }
  if (factors.time_fit === 1 && recipe.total_time_minutes <= 20) {
    return `On the table in about ${recipe.total_time_minutes} minutes.`;
  }
  if (factors.preference_fit >= 1) {
    return `${recipe.cuisine} night, and it fits what's in the kitchen.`;
  }
  if (availability.missing.length === 1) {
    return `Only ${availability.missing[0].ingredient.ingredient_name.toLowerCase()} is missing.`;
  }
  return `Fits your cooking time and most of what's in the kitchen.`;
}

export function scoreRecipe(
  recipe: Recipe,
  inventory: InventoryItem[],
  context: HouseholdContext,
  today?: string,
): ScoredRecipe {
  const availability = assessRecipe(recipe, inventory, today);
  // Low-confidence stock reduces how available a recipe really is: if we are
  // only guessing that the paneer is there, the match is worth less.
  const matched = availability.have.filter((entry) => entry.matched);
  const meanConfidence =
    matched.length === 0
      ? 1
      : matched.reduce((sum, entry) => sum + currentConfidence(entry.matched!, today), 0) /
        matched.length;
  // Halve the penalty: uncertainty discounts a match, it does not erase it.
  const confidenceWeight = 0.5 + 0.5 * meanConfidence;

  const factors: RankingFactors = {
    nutrition_fit: nutritionFit(recipe, context),
    inventory_fit: clamp01(availability.ratio * confidenceWeight),
    preference_fit: preferenceFit(recipe, context),
    expiry_priority: expiryPriority(availability, context),
    time_fit: timeFit(recipe, context),
    variety: varietyFit(recipe, context),
    feedback: feedbackFit(recipe, context),
  };

  const score = (Object.keys(WEIGHTS) as (keyof RankingFactors)[]).reduce(
    (acc, key) => acc + WEIGHTS[key] * factors[key],
    0,
  );

  return {
    recipe,
    score,
    factors,
    availability,
    reason: buildReason(recipe, availability, factors, context),
  };
}

/** Recipes needing this much of their ingredient weight before they are worth suggesting. */
export const MIN_AVAILABILITY = 0.55;

export function rankRecipes(
  candidates: Recipe[],
  inventory: InventoryItem[],
  context: HouseholdContext,
  today?: string,
): ScoredRecipe[] {
  const eligible = candidates.filter((recipe) => isEligible(recipe, context));
  const scored = eligible
    .map((recipe) => scoreRecipe(recipe, inventory, context, today))
    .sort((a, b) => b.score - a.score);

  const cookable = scored.filter((s) => s.availability.ratio >= MIN_AVAILABILITY);
  // Fall back to the best of a thin kitchen rather than returning nothing.
  return cookable.length >= 3 ? cookable : scored;
}
