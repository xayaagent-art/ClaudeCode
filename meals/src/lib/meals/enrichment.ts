import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { hasUsableSource, resolveRecipeSource } from "@/lib/meals/discovery-service";
import type { Recipe } from "@/lib/types";

/**
 * Presentation enrichment — the part that happens after the answer.
 *
 * Meal generation must never wait on YouTube, so a recommendation arrives with
 * whatever imagery the dish already had, which for a brand-new dish is none.
 * This is how that gap closes: a caller hands over the ids currently on screen
 * and gets back the ones that changed. Nothing here is on the critical path,
 * and nothing here regenerates a recipe — it only attaches a source.
 *
 * Already-resolved recipes are never searched again (see `hasUsableSource`),
 * so polling this is cheap and idempotent: the second call for the same screen
 * does no external work at all.
 */

/** What a surface needs to draw a recipe before, during and after enrichment. */
export type ImageState = "resolved" | "pending" | "unavailable";

export interface RecipePresentation {
  recipe_id: string;
  title: string;
  cuisine: string;
  image_state: ImageState;
  /** Best available image, or null when there is nothing to show yet. */
  image_url: string | null;
  video_url: string | null;
  source_name: string | null;
  /** True when this recipe can be cooked from the app with no video at all. */
  has_instructions: boolean;
}

/**
 * The image contract, decided in one place.
 *
 * "Pending" is the honest answer for a dish nobody has looked up yet, and it is
 * distinct from "unavailable" — a dish we searched for and found nothing for.
 * A surface can hold a stable placeholder for the first and stop waiting on the
 * second, which is the difference between a card that settles and one that
 * flickers forever.
 */
export function presentationFor(recipe: Recipe): RecipePresentation {
  const image = recipe.thumbnail_url ?? recipe.image_url;
  const searched = Boolean(recipe.discovered_at);

  return {
    recipe_id: recipe.id,
    title: recipe.title,
    cuisine: recipe.cuisine,
    image_state: image ? "resolved" : searched ? "unavailable" : "pending",
    image_url: image,
    video_url: recipe.video_url,
    source_name: recipe.source_name,
    has_instructions: recipe.instructions.length > 0,
  };
}

/** Recipes still awaiting a first look-up, in the order they were asked about. */
export function pendingEnrichment(recipes: Recipe[]): Recipe[] {
  return recipes.filter((recipe) => !hasUsableSource(recipe) && !recipe.discovered_at);
}

export interface EnrichmentResult {
  presentations: RecipePresentation[];
  /** How many actually went to the provider this call. */
  searched: number;
}

/**
 * Attach sources to whichever of these recipes still needs one.
 *
 * Sequential on purpose: a burst of recommendations must not spike a quota
 * measured in about a hundred searches a day. `limit` bounds one call so a
 * screenful of new dishes cannot spend the budget in a single request; the
 * caller polls again for the rest.
 */
export async function enrichRecipes(
  recipeIds: string[],
  options: { limit?: number; today?: string } = {},
): Promise<EnrichmentResult> {
  const db = getDb();
  const limit = options.limit ?? 3;

  const recipes: Recipe[] = [];
  for (const id of recipeIds.slice(0, 24)) {
    const recipe = await db.getRecipe(id);
    if (recipe) recipes.push(recipe);
  }

  const queue = pendingEnrichment(recipes).slice(0, limit);
  if (queue.length === 0) {
    return { presentations: recipes.map(presentationFor), searched: 0 };
  }

  // Context is only needed once, and only when there is real work to do —
  // building it costs several reads that a fully-enriched screen should not pay.
  const { context } = await buildHouseholdContext("dinner", options.today ?? todayISO());
  const enriched = new Map<string, Recipe>();
  for (const recipe of queue) {
    const outcome = await resolveRecipeSource(recipe, context);
    enriched.set(recipe.id, outcome.recipe);
  }

  return {
    presentations: recipes.map((recipe) => {
      const after = enriched.get(recipe.id);
      const presentation = presentationFor(after ?? recipe);
      // A recipe we just tried and came back empty-handed for is settled, not
      // pending. Without this, a deployment with no video provider configured
      // leaves every card waiting for an answer that is never coming —
      // `discovered_at` is only stamped when the provider actually replied, so
      // "we asked and got nothing" has to be said here.
      if (after && presentation.image_state === "pending") {
        return { ...presentation, image_state: "unavailable" as const };
      }
      return presentation;
    }),
    searched: queue.length,
  };
}
