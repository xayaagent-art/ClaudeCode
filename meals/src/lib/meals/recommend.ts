import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { generateMealCandidates } from "@/lib/meals/candidates";
import { discoverRecipes } from "@/lib/meals/discover";
import { resolveSourcesFor } from "@/lib/meals/discovery-service";
import {
  canonicalRecipeKey,
  dedupeAgainstMemory,
  isEstablished,
  withoutNearDuplicates,
} from "@/lib/meals/memory";
import { materialize } from "@/lib/meals/registry";
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
  /** Plain-language note when videos could not be looked up, e.g. no API key. */
  source_note: string | null;
  /**
   * Set when meal generation was attempted and failed. The library still
   * answered, but these are not the intelligent suggestions — saying so is the
   * difference between graceful degradation and quietly pretending.
   */
  generation_failed: boolean;
  generation_note: string | null;
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

/** Extra ranked candidates kept aside in case a top pick has no usable video. */
const SOURCE_BUFFER = 3;

/** How many recent recommendation rows count as "recently shown". */
const RECENTLY_SHOWN_DEPTH = 12;

/**
 * Penalty applied to a dish the household was shown recently.
 *
 * Subtracted from the ranking score rather than filtered, so a genuinely
 * excellent match can still surface — it just has to earn it against fresher
 * competition. Nothing here is random: the same kitchen and the same history
 * always produce the same order, which is what makes a regeneration
 * reproducible and a bad pick explainable.
 */
function noveltyPenalty(
  recipe: Recipe,
  shownRecently: Map<string, number>,
  pressure: number,
): number {
  const position = shownRecently.get(recipe.id);
  if (position === undefined) return 0;
  // Most recent gets the full penalty, decaying with age.
  const recency = 1 - position / RECENTLY_SHOWN_DEPTH;
  return pressure * Math.max(recency, 0.25);
}

/**
 * How hard to push away from what was just shown.
 *
 * Asking once is a browse; asking three times in a row means "not these".
 * Pressure climbs with each consecutive regeneration so the set keeps moving,
 * and is capped so relevance never collapses into novelty for its own sake —
 * a dish that fits the kitchen far better than anything else can still win on
 * the fourth press.
 */
function explorationPressure(regenerating: boolean, rounds: number): number {
  if (!regenerating) return 0.15;
  return Math.min(0.45 + 0.2 * Math.max(rounds - 1, 0), 0.95);
}

/**
 * How many consecutive regenerations have just happened.
 *
 * Read from the recommendation history rather than held in the client, so the
 * pressure survives a reload and a second phone.
 */
function regenerationRounds(shown: { created_at: string }[]): number {
  if (shown.length === 0) return 0;
  const newest = Date.parse(shown[0].created_at);
  if (!Number.isFinite(newest)) return 0;
  // Anything asked for within the last ten minutes is the same sitting.
  const window = 10 * 60 * 1000;
  return shown.filter((entry) => newest - Date.parse(entry.created_at) < window).length / 3;
}

/**
 * Pick the display set as a deliberate mix rather than a straight top-N.
 *
 * Straight top-N converges: the same kitchen produces the same three dishes
 * every evening, and the app stops feeling like it is thinking. Reserving a
 * slot for something the household has never cooked keeps discovery alive
 * without letting an unproven idea outrank a dish that actually works.
 */
function mixProvenAndNew(scored: ScoredRecipe[], count: number): ScoredRecipe[] {
  if (scored.length <= count) return scored;

  // Never offer two versions of the same dinner in one set.
  const distinct = withoutNearDuplicates(scored);
  if (distinct.length <= count) return distinct.length > 0 ? distinct : scored.slice(0, count);

  const established = distinct.filter((entry) => isEstablished(entry.recipe));
  const exploratory = distinct.filter((entry) => !isEstablished(entry.recipe));

  // One side empty means there is no mix to strike.
  if (established.length === 0 || exploratory.length === 0) return diversify(distinct, count);

  // Two dishes the household can rely on, one it has never had. The new one
  // still had to out-rank every other new idea to get here.
  const establishedSlots = Math.max(1, count - 1);
  const chosen = [
    ...diversify(established, establishedSlots),
    ...diversify(exploratory, count - establishedSlots),
  ];

  // Backfill from the overall ranking if either side ran short.
  for (const entry of distinct) {
    if (chosen.length >= count) break;
    if (!chosen.includes(entry)) chosen.push(entry);
  }
  return chosen.slice(0, count).sort((a, b) => b.score - a.score);
}

export async function recommendMeals(options: {
  mealType?: MealType;
  count?: number;
  excludeRecipeIds?: string[];
  today?: string;
  /** Set when the user asked for a different set, not just the first one. */
  regenerate?: boolean;
}): Promise<RecommendResult> {
  const routeStartedAt = Date.now();
  const mealType = options.mealType ?? "dinner";
  const count = options.count ?? 3;
  const today = options.today ?? todayISO();
  const exclude = new Set(options.excludeRecipeIds ?? []);
  const regenerating = options.regenerate ?? exclude.size > 0;

  const db = getDb();
  const { context, inventory, members } = await buildHouseholdContext(mealType, today);
  const known = (await db.listRecipes()).filter((r) => !exclude.has(r.id));

  // What the household has already been offered lately, most recent first.
  const recentRows = await db.listRecommendations(RECENTLY_SHOWN_DEPTH);
  const shownRecently = new Map<string, number>();
  const shownTitles: string[] = [];
  for (const [index, rec] of recentRows.entries()) {
    if (!shownRecently.has(rec.recipe_id)) shownRecently.set(rec.recipe_id, index);
  }
  const pressure = explorationPressure(regenerating, regenerationRounds(recentRows));

  // The model proposes; memory and the ranker decide. Generation failing is not
  // fatal — the household's own library still answers the question.
  // Everything recently shown is named to the model, not just the stored ones:
  // a generated dish is now persisted the moment it is displayed, so its title
  // is available here and it stops being re-proposed under a new name.
  for (const recipe of known) {
    if (shownRecently.has(recipe.id)) shownTitles.push(recipe.title);
  }
  const generated = await generateMealCandidates(context, {
    exclude: [...context.recent_meals.map((meal) => meal.title), ...shownTitles],
  });

  const { fresh } = dedupeAgainstMemory(generated.recipes, known);
  const searchQueries = generated.searchQueries;

  // Exclusion has to be by dish identity, not by id. A generated candidate that
  // turns out to be a dish already excluded carries a different id right up
  // until it is materialised, at which point it collapses back onto the very
  // recipe the user just asked not to see again.
  const excludedKeys = new Set(
    (await db.listRecipes())
      .filter((recipe) => exclude.has(recipe.id))
      .map((recipe) => recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine)),
  );
  const notExcluded = (recipe: Recipe) =>
    !exclude.has(recipe.id) &&
    !excludedKeys.has(recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine));

  const pool = [...known, ...fresh.filter(notExcluded)];
  let scored = rankRecipes(pool, inventory, context, today).map((entry) => ({
    ...entry,
    score:
      Math.round(
        (entry.score - noveltyPenalty(entry.recipe, shownRecently, pressure)) * 1000,
      ) / 1000,
  }));
  scored.sort((a, b) => b.score - a.score);

  let discoveryUsed = fresh.length > 0;

  // Legacy OpenAI discovery, kept as a last resort for a kitchen that neither
  // memory nor Gemini could cover. Only runs when an OpenAI key is configured.
  const strongEnough = scored.filter((s) => s.availability.ratio >= MIN_AVAILABILITY);
  if (strongEnough.length < count && fresh.length === 0) {
    const extra = await discoverRecipes(
      context,
      count - strongEnough.length,
      scored.slice(0, 5).map((s) => s.recipe.title),
    );
    if (extra.length > 0) {
      discoveryUsed = true;
      for (const recipe of extra) await db.upsertRecipe(recipe);
      scored = rankRecipes([...pool, ...extra], inventory, context, today);
    }
  }

  // A rename is not novelty. On an explicit regeneration, anything that is
  // effectively the same dinner as one just shown is removed outright rather
  // than merely penalised — "Palak Paneer Bowl" then "Paneer Spinach Bowl" is
  // the exact complaint this exists to answer.
  if (regenerating) {
    const justShown = known.filter((recipe) => shownRecently.has(recipe.id));
    if (justShown.length > 0) {
      const survivors = withoutNearDuplicates(scored, justShown);
      // Only apply it while enough genuinely different options remain.
      if (survivors.length >= count) scored = survivors;
    }
  }

  const picked = mixProvenAndNew(scored, count);

  // Rank first, then look up videos — and only for what is about to be shown,
  // plus a small buffer in case one of them has no watchable source. Searching
  // all sixteen candidates would cost 1,600 of a 10,000-unit daily quota to
  // display three. Anything already resolved is served from cache for free.
  const buffer = scored
    .filter((entry) => !picked.includes(entry))
    .slice(0, SOURCE_BUFFER);

  // Identity before display: every recipe about to be linked to is persisted
  // first, so the detail page can open it and the next refresh knows it was
  // offered. This is the fix for both the dead links and the repetition.
  const durableById = await materialize(picked.map((entry) => entry.recipe));
  const displayFor = picked
    .map((entry) => durableById.get(entry.recipe.id))
    .filter((recipe): recipe is Recipe => Boolean(recipe));

  const { recipes: withSources, outcomes } = await resolveSourcesFor(
    displayFor,
    context,
    { queries: searchQueries },
  );

  // Substitute from the buffer for anything that came back without a video.
  // A substitute is materialised too — it is about to be linked to.
  const displayable = [...withSources];
  for (const [index, recipe] of withSources.entries()) {
    if (recipe.video_url || buffer.length === 0) continue;
    const replacement = buffer.shift()!;
    const durableReplacement = (await materialize([replacement.recipe])).get(
      replacement.recipe.id,
    );
    if (!durableReplacement) continue;

    const resolved = await resolveSourcesFor([durableReplacement], context, {
      queries: searchQueries,
    });
    if (resolved.recipes[0]?.video_url) {
      displayable[index] = resolved.recipes[0];
      picked[index] = { ...replacement, recipe: durableReplacement };
    }
  }

  const sourceById = new Map(displayable.map((recipe) => [recipe.id, recipe]));
  const sourceIssue = outcomes.find(
    (outcome) => outcome.outcome === "provider_unavailable",
  )?.reason;

  const recommendations: Recommendation[] = picked
    .filter((entry) => durableById.has(entry.recipe.id) || sourceById.has(entry.recipe.id))
    .map((entry) => ({
    recipe:
      sourceById.get(durableById.get(entry.recipe.id)?.id ?? entry.recipe.id) ??
      durableById.get(entry.recipe.id) ??
      entry.recipe,
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

  const generationFailed = generated.outcome === "failed";
  // eslint-disable-next-line no-console
  console.info(
    "[recommend]",
    JSON.stringify({
      ms: Date.now() - routeStartedAt,
      generation: generated.outcome,
      model: generated.model,
      candidates: generated.recipes.length,
      pool: pool.length,
      picked: picked.length,
      materialized: durableById.size,
      returned: recommendations.length,
      regenerating,
    }),
  );

  return {
    recommendations,
    weak_match: recommendations.every((r) => r.availability < MIN_AVAILABILITY),
    discovery_used: discoveryUsed,
    source_note: sourceIssue ?? null,
    generation_failed: generationFailed,
    generation_note: generationFailed
      ? "We couldn't reach the meal planner just now, so these come from your saved recipes."
      : null,
  };
}
