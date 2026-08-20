import "server-only";
import { getDb } from "@/lib/db";
import type { MealRecommendation, Recipe } from "@/lib/types";

/**
 * The recommendation set the household is currently looking at.
 *
 * Recommendations were only ever a response body: the screen that asked for
 * them held them in component state, so going to a recipe and pressing back
 * threw them away and asked the model again. The rows were being written the
 * whole time — nothing read them back. This does, which is what makes the set
 * survive navigation, a reload and a second device, and what lets Today and
 * Find Meals agree about what "current" means.
 */

export interface CurrentRecommendation {
  recipe: Recipe;
  reason: string;
  availability: number;
  missing: { name: string; optional: boolean }[];
  uses_soon: string[];
}

export interface CurrentRecommendationSet {
  recommendations: CurrentRecommendation[];
  /** When this set was produced, so the UI can say how fresh it is. */
  generated_at: string | null;
}

/**
 * The rows of the newest set.
 *
 * Membership is read off `batch_id`, which is stamped once per write. It was
 * briefly inferred from how close the timestamps were, and there is no
 * threshold that works: pressing "show me three others" twice in quick
 * succession merged two sets into six cards on a screen that offers three,
 * and widening the window to fix that joined separate sittings instead.
 *
 * Rows written before the column existed carry the batch the migration
 * assigned them; anything still without one falls back to its timestamp, so a
 * half-migrated table degrades to the old behaviour rather than to nothing.
 */
export function groupIntoLatestSet(rows: MealRecommendation[]): MealRecommendation[] {
  if (rows.length === 0) return [];
  // listRecommendations returns newest first.
  const newest = rows[0];
  if (newest.batch_id) return rows.filter((row) => row.batch_id === newest.batch_id);
  return rows.filter((row) => !row.batch_id && row.created_at === newest.created_at);
}

/**
 * Reads the current set and resolves every row to a real recipe.
 *
 * A row whose recipe no longer resolves is dropped rather than rendered: it
 * would be a card that 404s when tapped, which is the failure this whole
 * identity-before-display path exists to prevent.
 */
export async function getCurrentRecommendations(): Promise<CurrentRecommendationSet> {
  const db = getDb();
  const rows = groupIntoLatestSet(await db.listRecommendations(12));
  if (rows.length === 0) return { recommendations: [], generated_at: null };

  const resolved = await Promise.all(rows.map((row) => db.getRecipe(row.recipe_id)));

  const recommendations: CurrentRecommendation[] = [];
  for (const [index, recipe] of resolved.entries()) {
    if (!recipe) continue;
    const row = rows[index];
    recommendations.push({
      recipe,
      reason: row.recommendation_reason,
      availability: row.availability,
      // Stored as names only; the card needs the shape, not the optionality,
      // and inventing `optional: false` here would be a claim we cannot make.
      missing: row.missing.map((name) => ({ name, optional: false })),
      uses_soon: [],
    });
  }

  return {
    recommendations,
    generated_at: recommendations.length > 0 ? rows[0].created_at : null,
  };
}
