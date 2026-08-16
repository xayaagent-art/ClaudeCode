import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { discoverRecipes } from "@/lib/meals/discover";
import { MIN_AVAILABILITY, rankRecipes, type ScoredRecipe } from "@/lib/meals/rank";
import { portionsFor, type Portion } from "@/lib/nutrition/engine";
import type { MealRecommendation, MealType, Recipe } from "@/lib/types";

export interface Recommendation {
  recipe: Recipe;
  score: number;
  reason: string;
  availability: number;
  missing: { name: string; optional: boolean }[];
  have: { name: string; use_soon: boolean }[];
  uses_soon: string[];
  portions: Portion[];
  factors: MealRecommendation["ranking_factors"];
}

export interface RecommendResult {
  recommendations: Recommendation[];
  /** Set when the kitchen is too thin to suggest anything genuinely cookable. */
  weak_match: boolean;
  discovery_used: boolean;
}

/** No more than two of the same cuisine in one set of three. */
function diversify(scored: ScoredRecipe[], count: number): ScoredRecipe[] {
  const picked: ScoredRecipe[] = [];
  const cuisineCount = new Map<string, number>();

  for (const candidate of scored) {
    if (picked.length >= count) break;
    const used = cuisineCount.get(candidate.recipe.cuisine) ?? 0;
    if (used >= 2) continue;
    picked.push(candidate);
    cuisineCount.set(candidate.recipe.cuisine, used + 1);
  }
  // Backfill if the cuisine cap left us short.
  for (const candidate of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

export async function recommendMeals(options: {
  mealType?: MealType;
  count?: number;
  excludeRecipeIds?: string[];
  today?: string;
}): Promise<RecommendResult> {
  const mealType = options.mealType ?? "dinner";
  const count = options.count ?? 3;
  const today = options.today ?? todayISO();
  const exclude = new Set(options.excludeRecipeIds ?? []);

  const db = getDb();
  const { context, inventory, members } = await buildHouseholdContext(mealType, today);
  const catalog = (await db.listRecipes()).filter((r) => !exclude.has(r.id));

  let scored = rankRecipes(catalog, inventory, context, today);
  let discoveryUsed = false;

  // Only reach for discovery when the library genuinely cannot cover the kitchen.
  const strongEnough = scored.filter((s) => s.availability.ratio >= MIN_AVAILABILITY);
  if (strongEnough.length < count) {
    const extra = await discoverRecipes(
      context,
      count - strongEnough.length,
      scored.slice(0, 5).map((s) => s.recipe.title),
    );
    if (extra.length > 0) {
      discoveryUsed = true;
      for (const recipe of extra) await db.upsertRecipe(recipe);
      scored = rankRecipes([...catalog, ...extra], inventory, context, today);
    }
  }

  const picked = diversify(scored, count);

  const recommendations: Recommendation[] = picked.map((entry) => ({
    recipe: entry.recipe,
    score: Math.round(entry.score * 1000) / 1000,
    reason: entry.reason,
    availability: Math.round(entry.availability.ratio * 100) / 100,
    missing: entry.availability.missing.map((m) => ({
      name: m.ingredient.ingredient_name,
      optional: m.ingredient.optional,
    })),
    have: entry.availability.have
      .filter((h) => h.matched)
      .map((h) => ({
        name: h.matched!.normalized_name,
        use_soon: entry.availability.uses_soon.includes(h.matched!.normalized_name),
      })),
    uses_soon: entry.availability.uses_soon,
    portions: portionsFor(entry.recipe, members, mealType),
    factors: entry.factors,
  }));

  if (recommendations.length > 0) {
    await db.saveRecommendations(
      recommendations.map((rec) => ({
        recipe_id: rec.recipe.id,
        meal_type: mealType,
        recommendation_reason: rec.reason,
        ranking_score: rec.score,
        ranking_factors: rec.factors,
        availability: rec.availability,
        missing: rec.missing.map((m) => m.name),
      })),
    );
  }

  return {
    recommendations,
    weak_match: recommendations.every((r) => r.availability < MIN_AVAILABILITY),
    discovery_used: discoveryUsed,
  };
}
