import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { generateMealCandidates } from "@/lib/meals/candidates";
import {
  canonicalRecipeKey,
  dedupeAgainstMemory,
  isEstablished,
  withoutNearDuplicates,
} from "@/lib/meals/memory";
import { materialize } from "@/lib/meals/registry";
import { behaviorAdjustment, summarizeBehavior } from "@/lib/meals/behavior";
import { dishAxes, selectDiverse } from "@/lib/meals/taxonomy";
import { youtubeProvider } from "@/lib/video/youtube";
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

/**
 * Counts by axis for the dishes just shown, so the model can be told where the
 * recent set is thin rather than only what it may not repeat.
 */
function distributionOf(recipes: Recipe[]): Record<string, Record<string, number>> {
  const distribution: Record<string, Record<string, number>> = {
    cuisine: {}, format: {}, protein: {}, flavor: {},
  };
  for (const recipe of recipes) {
    for (const [axis, value] of Object.entries(dishAxes(recipe))) {
      distribution[axis] = distribution[axis] ?? {};
      distribution[axis][value] = (distribution[axis][value] ?? 0) + 1;
    }
  }
  return distribution;
}

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

  // What the household has done, and what it has already committed to this
  // week. Both steer generation and ranking; neither costs a provider call.
  const [signals, currentPlan] = await Promise.all([
    db.listSignals(300),
    db.getCurrentPlan(today),
  ]);
  const behavior = summarizeBehavior(signals, known, currentPlan);
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
  const titleFor = (key: string) =>
    known.find(
      (recipe) =>
        (recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine)) === key,
    )?.title;
  const titlesWhere = (
    predicate: (history: { dismissed: number; opened: number; cooked: number }) => boolean,
  ) =>
    [...behavior.byDish.entries()]
      .filter(([, history]) => predicate(history))
      .map(([key]) => titleFor(key))
      .filter((title): title is string => Boolean(title))
      .slice(0, 12);

  const generated = await generateMealCandidates(context, {
    exclude: [...context.recent_meals.map((meal) => meal.title), ...shownTitles],
    planned: (currentPlan?.entries ?? [])
      .map((entry) => entry.recipe_title)
      .filter((title): title is string => Boolean(title)),
    dismissed: titlesWhere((history) => history.dismissed > 0),
    opened: titlesWhere((history) => history.opened > 0 && history.cooked === 0),
    cooked: titlesWhere((history) => history.cooked > 0),
    distribution: distributionOf(known.filter((recipe) => shownRecently.has(recipe.id))),
  });

  const { fresh } = dedupeAgainstMemory(generated.recipes, known);

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
  let scored = rankRecipes(pool, inventory, context, today).map((entry) => {
    // Behaviour is a bounded delta on top of the deterministic fit score, never
    // a filter: a dismissal moves a dish down the list, it does not remove an
    // option the kitchen genuinely supports.
    const behaviour = behaviorAdjustment(entry.recipe, behavior, { casualAlternative: true });
    return {
      ...entry,
      score:
        Math.round(
          (entry.score - noveltyPenalty(entry.recipe, shownRecently, pressure) + behaviour.delta) *
            1000,
        ) / 1000,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const discoveryUsed = fresh.length > 0;

  // There used to be a second generator here — an older OpenAI discovery call
  // that ran when the first one came up short. It had its own model name, its
  // own prompt, took nutrition numbers straight from the model, and wrote
  // recipes without the read-back that makes an id safe to link to. Two paths
  // producing recipes with different guarantees is how a dish reached the
  // screen that its own detail page could not find. Generation is one path now.

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

  // Spread first, then mix. Order matters: widening the pool *before*
  // mixProvenAndNew would hand it eight established slots and one exploratory
  // one, quietly collapsing discovery back to the catalog. So the axes build a
  // varied shortlist out of the full ranking, and the proven/new mix then picks
  // the final set from a shortlist that is already spread across cuisine,
  // format, protein and flavour.
  const shortlist = selectDiverse(scored, Math.max(count * 3, count));
  const picked = mixProvenAndNew(shortlist, count);

  // Identity before display: every recipe about to be linked to is persisted
  // first, so the detail page can open it and the next refresh knows it was
  // offered. This is the fix for both the dead links and the repetition.
  const durableById = await materialize(picked.map((entry) => entry.recipe));

  // Video lookup used to happen here, in front of the reply: resolve a source
  // for each pick, then — one at a time, awaiting each — swap in a buffer
  // candidate for anything that came back without a video. That put several
  // serial YouTube round trips between the household and a suggestion it could
  // already have read, to decide a line of metadata on a card.
  //
  // Meal ideas no longer wait for it. A dish the library has seen before still
  // shows its video, because materialize returns the stored row with whatever
  // source was cached on it, and a dish nobody has resolved yet gets one when
  // it is opened — the recipe page resolves on view and caches the result.
  // Nothing is lost but the wait.
  const sourceById = new Map<string, Recipe>();
  // Whether videos are available at all is a question about configuration, not
  // a search, so it still gets answered here — for free, and without putting a
  // network call in front of the reply.
  const sourceIssue = youtubeProvider.unavailableReason();

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
