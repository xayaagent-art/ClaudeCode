import "server-only";
import { getDb } from "@/lib/db";
import { assessRecipe } from "@/lib/kitchen/match";
import { portionsFor, type Portion } from "@/lib/nutrition/engine";
import type { MealType, Recipe } from "@/lib/types";

export interface RecipeDetail {
  recipe: Recipe;
  /** Why this dish was suggested, carried over from the recommendation. */
  reason: string | null;
  portions: Portion[];
  availability: {
    ratio: number;
    blocked: boolean;
    uses_soon: string[];
    have: { name: string; status: string; days_to_expiry: number | null; use_soon: boolean }[];
    missing: { name: string; optional: boolean }[];
  };
}

export async function getRecipeDetail(
  recipeId: string,
  mealType: MealType = "dinner",
): Promise<RecipeDetail | null> {
  const db = getDb();
  const recipe = await db.getRecipe(recipeId);
  if (!recipe) return null;

  // Reads only. Opening a recipe must never trigger external discovery — the
  // source was resolved when the recommendation was produced and cached on the
  // recipe. Re-resolving is an explicit action (POST /api/recipes/[id]/source).
  const [inventory, members, recommendations] = await Promise.all([
    db.listInventory(),
    db.listMembers(),
    db.listRecommendations(12),
  ]);
  const availability = assessRecipe(recipe, inventory);
  const reason =
    recommendations.find((rec) => rec.recipe_id === recipe.id)?.recommendation_reason ?? null;

  return {
    recipe,
    reason: reason && reason.length > 0 ? reason : null,
    portions: portionsFor(recipe, members, mealType),
    availability: {
      ratio: Math.round(availability.ratio * 100) / 100,
      blocked: availability.blocked,
      uses_soon: availability.uses_soon,
      have: availability.have
        .filter((entry) => entry.matched)
        .map((entry) => ({
          name: entry.matched!.normalized_name,
          status: entry.matched!.status,
          days_to_expiry: entry.days_to_expiry,
          use_soon: availability.uses_soon.includes(entry.matched!.normalized_name),
        })),
      missing: availability.missing.map((entry) => ({
        name: entry.ingredient.ingredient_name,
        optional: entry.ingredient.optional,
      })),
    },
  };
}
