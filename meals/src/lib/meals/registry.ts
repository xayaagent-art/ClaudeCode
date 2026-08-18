import "server-only";
import { getDb } from "@/lib/db";
import { canonicalRecipeKey, mergeIntoMemory } from "@/lib/meals/memory";
import type { Recipe } from "@/lib/types";

/**
 * The one place a recipe becomes real.
 *
 * A generated dish used to be persisted only once a video had been found for
 * it. That produced the worst possible failure: the recommendation, the plan
 * and Today all linked to a recipe id that existed nowhere, so tapping it
 * answered "We couldn't find that" — and because it was never stored, the next
 * refresh could not tell it had already been offered, so it came straight back.
 * One missing write caused both the dead links and the repetition.
 *
 * So: anything about to be surfaced is materialised first. Identity before
 * display, always. Storing a dish costs one row and buys a working link, a
 * cache entry, and a memory of having shown it.
 */

/**
 * Persist recipes that are about to be shown.
 *
 * Returns a lookup keyed by the id the caller passed in, because a candidate
 * that turns out to be a dish already known keeps the *stored* id, not the
 * generated one. Returning a bare list made that rename invisible: the caller
 * looked up its own id, found nothing, and quietly dropped the recommendation.
 *
 * Existing rows are merged rather than overwritten, so cook counts, feedback
 * and an already-resolved video survive a regeneration proposing the same dish.
 */
export async function materialize(recipes: Recipe[]): Promise<Map<string, Recipe>> {
  const resolved = new Map<string, Recipe>();
  if (recipes.length === 0) return resolved;

  const db = getDb();
  const stored = await db.listRecipes();
  const byKey = new Map(
    stored.map((recipe) => [
      recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine),
      recipe,
    ]),
  );

  for (const recipe of recipes) {
    const key = recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine);
    const existing = byKey.get(key);

    // The built-in catalog is already addressable; it needs no write.
    if (existing && existing.source_type === "catalog") {
      // Already addressable, and the catalog entry is the better record — but
      // still confirmed through the same lookup rather than assumed.
      const readBack = await db.getRecipe(existing.id);
      if (readBack) resolved.set(recipe.id, readBack);
      continue;
    }

    const durable: Recipe = existing
      ? mergeIntoMemory(existing, { ...recipe, canonical_key: key })
      : { ...recipe, canonical_key: key };

    try {
      await db.upsertRecipe(durable);

      // The invariant: a write returning without throwing is not proof the row
      // is readable. RLS, a partial write, or a column mismatch can all leave
      // upsert looking successful while the detail page finds nothing. The only
      // evidence that counts is reading it back through the same lookup
      // /recipes/[id] uses. Anything that fails this is never linked to.
      const readBack = await db.getRecipe(durable.id);
      if (!readBack) {
        // eslint-disable-next-line no-console
        console.error(
          "[registry] wrote but could not read back",
          JSON.stringify({ id: durable.id, key }),
        );
        continue;
      }
      resolved.set(recipe.id, readBack);
    } catch (error) {
      // A failed write must not blank the recommendation — but the caller has
      // to know this one is not addressable, so it is dropped from the set
      // rather than shown as a link that would 404.
      // eslint-disable-next-line no-console
      console.error(
        "[registry] could not persist recipe",
        JSON.stringify({ key, error: (error as Error).message }),
      );
    }
  }

  return resolved;
}

/**
 * Resolve a recipe id from the single source of truth.
 *
 * Stored rows win; the built-in catalog is the fallback. Every surface — Today,
 * Plan, recommendations, recipe detail — goes through the same lookup, so a
 * recipe that opens from one screen opens from all of them.
 */
export async function resolveRecipe(recipeId: string): Promise<Recipe | null> {
  return getDb().getRecipe(recipeId);
}
