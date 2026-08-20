import "server-only";
import { getDb } from "@/lib/db";
import { buildVideoQueries, selectBestVideo } from "@/lib/meals/source-quality";
import type { HouseholdContext, Recipe } from "@/lib/types";
import type { VideoCandidate, VideoProvider } from "@/lib/video/provider";
import { youtubeProvider } from "@/lib/video/youtube";

/**
 * RecipeDiscoveryService — resolving a real, watchable source for a recipe.
 *
 * Discovery priority (see README):
 *   A. the normalized catalog / already-saved recipes   ← free, no network
 *   B. sources this household has already cooked from   ← free, no network
 *   C. a trusted external video source                  ← costs API quota
 *   D. adaptation of an existing recipe                 ← handled by discover.ts
 *   E. generation                                       ← handled by discover.ts
 *
 * A resolved source is written back onto the recipe, so external search happens
 * once per dish and never again on a recipe view. That is what keeps the
 * YouTube quota (100 searches/day) workable.
 */

/** Re-check a source only after this long; a good video does not go stale quickly. */
const SOURCE_TTL_DAYS = 60;

export interface ResolveOptions {
  /** Bypass the cache — used by "find a different video". */
  force?: boolean;
  provider?: VideoProvider;
  /**
   * Search terms supplied by the candidate generator, keyed by recipe id. The
   * model naming its own dish beats deriving a query from our serving framing:
   * "Palak Paneer Bowls" is our words, "palak paneer recipe" is what a cook
   * would actually type.
   */
  queries?: Map<string, string>;
}

export interface ResolveOutcome {
  recipe: Recipe;
  /** How the source was obtained, for logging and tests. */
  outcome: "cached" | "resolved" | "no_match" | "provider_unavailable";
  reason: string | null;
}

function isFresh(recipe: Recipe): boolean {
  if (!recipe.discovered_at) return false;
  const age = Date.now() - Date.parse(recipe.discovered_at);
  return Number.isFinite(age) && age < SOURCE_TTL_DAYS * 86_400_000;
}

/** A recipe already carrying a usable video needs no external call. */
export function hasUsableSource(recipe: Recipe): boolean {
  return Boolean(recipe.video_url && recipe.thumbnail_url) && isFresh(recipe);
}

/**
 * Attach a real cooking video to one recipe, persisting the result.
 * Never throws: a discovery failure degrades to no video, never to a fake one.
 */
export async function resolveRecipeSource(
  recipe: Recipe,
  context: HouseholdContext,
  options: ResolveOptions = {},
): Promise<ResolveOutcome> {
  // A + B: anything already normalized and saved is reused as-is.
  if (!options.force && hasUsableSource(recipe)) {
    return { recipe, outcome: "cached", reason: null };
  }

  const provider = options.provider ?? youtubeProvider;
  if (!provider.enabled()) {
    return {
      recipe,
      outcome: "provider_unavailable",
      reason: provider.unavailableReason(),
    };
  }

  // C: external discovery, then cached forever.
  //
  // Several phrasings rather than one: our name for a dish is often not the
  // name cooks use, and the good video sits under theirs. Variants run in
  // sequence and stop as soon as the pool contains something credible, so the
  // common case still costs one search and only a hard dish pays for more.
  const queries = buildVideoQueries(recipe, options.queries?.get(recipe.id));
  const candidates: VideoCandidate[] = [];
  const seen = new Set<string>();
  let searchError: string | null = null;

  for (const query of queries) {
    try {
      for (const candidate of await provider.search(query, { limit: 6 })) {
        if (seen.has(candidate.video_id)) continue;
        seen.add(candidate.video_id);
        candidates.push(candidate);
      }
    } catch (error) {
      searchError = `${provider.name} search failed: ${(error as Error).message}`;
      break;
    }
    // Stop as soon as this pool already answers the question well.
    if (selectBestVideo(candidates, recipe, context)) break;
  }

  if (candidates.length === 0 && searchError) {
    return { recipe, outcome: "provider_unavailable", reason: searchError };
  }

  const best = selectBestVideo(candidates, recipe, context);
  if (!best) {
    // Record the attempt so we do not re-search this dish on every view.
    const stamped: Recipe = { ...recipe, discovered_at: new Date().toISOString() };
    await getDb().upsertRecipe(stamped);
    return {
      recipe: stamped,
      outcome: "no_match",
      reason: `No ${provider.name} result cleared the quality bar for "${recipe.title}"`,
    };
  }

  const enriched: Recipe = {
    ...recipe,
    video_url: best.candidate.url,
    video_platform: best.candidate.platform,
    video_duration_seconds: best.candidate.duration_seconds,
    video_view_count: best.candidate.view_count,
    thumbnail_url: best.candidate.thumbnail_url ?? recipe.thumbnail_url,
    source_name: best.candidate.channel || provider.name,
    attribution: best.candidate.channel
      ? `Video by ${best.candidate.channel} on ${provider.name}`
      : provider.name,
    // Only claim an external source_url when we do not already have one from
    // recipe discovery; the video is a companion, not necessarily the origin.
    source_url: recipe.source_url ?? best.candidate.url,
    source_quality: {
      score: best.quality.score,
      reasons: best.quality.reasons,
      checked_at: best.quality.checked_at,
    },
    discovered_at: new Date().toISOString(),
  };

  await getDb().upsertRecipe(enriched);
  return { recipe: enriched, outcome: "resolved", reason: null };
}

/**
 * Resolve sources for a set of recipes, in sequence so a burst of
 * recommendations cannot spike the quota. Failures are per-recipe.
 */
export async function resolveSourcesFor(
  recipes: Recipe[],
  context: HouseholdContext,
  options: ResolveOptions = {},
): Promise<{ recipes: Recipe[]; outcomes: ResolveOutcome[] }> {
  const resolved: Recipe[] = [];
  const outcomes: ResolveOutcome[] = [];

  for (const recipe of recipes) {
    const outcome = await resolveRecipeSource(recipe, context, options);
    resolved.push(outcome.recipe);
    outcomes.push(outcome);
  }

  return { recipes: resolved, outcomes };
}
