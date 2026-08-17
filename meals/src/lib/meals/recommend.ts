import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { generateMealCandidates } from "@/lib/meals/candidates";
import { discoverRecipes } from "@/lib/meals/discover";
import { resolveSourcesFor } from "@/lib/meals/discovery-service";
import { dedupeAgainstMemory, isEstablished, worthRemembering } from "@/lib/meals/memory";
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
function noveltyPenalty(recipe: Recipe, shownRecently: Map<string, number>, regenerating: boolean): number {
  const position = shownRecently.get(recipe.id);
  if (position === undefined) return 0;
  // Most recent gets the full penalty, decaying with age.
  const recency = 1 - position / RECENTLY_SHOWN_DEPTH;
  return (regenerating ? 0.45 : 0.15) * Math.max(recency, 0.25);
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

  const established = scored.filter((entry) => isEstablished(entry.recipe));
  const exploratory = scored.filter((entry) => !isEstablished(entry.recipe));

  // One side empty means there is no mix to strike.
  if (established.length === 0 || exploratory.length === 0) return diversify(scored, count);

  // Two dishes the household can rely on, one it has never had. The new one
  // still had to out-rank every other new idea to get here.
  const establishedSlots = Math.max(1, count - 1);
  const chosen = [
    ...diversify(established, establishedSlots),
    ...diversify(exploratory, count - establishedSlots),
  ];

  // Backfill from the overall ranking if either side ran short.
  for (const entry of scored) {
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
  const mealType = options.mealType ?? "dinner";
  const count = options.count ?? 3;
  const today = options.today ?? todayISO();
  const exclude = new Set(options.excludeRecipeIds ?? []);
  const regenerating = options.regenerate ?? exclude.size > 0;

  const db = getDb();
  const { context, inventory, members } = await buildHouseholdContext(mealType, today);
  const known = (await db.listRecipes()).filter((r) => !exclude.has(r.id));

  // What the household has already been offered lately, most recent first.
  const shownRecently = new Map<string, number>();
  for (const [index, rec] of (await db.listRecommendations(RECENTLY_SHOWN_DEPTH)).entries()) {
    if (!shownRecently.has(rec.recipe_id)) shownRecently.set(rec.recipe_id, index);
  }

  // The model proposes; memory and the ranker decide. Generation failing is not
  // fatal — the household's own library still answers the question.
  const generated = await generateMealCandidates(context, {
    exclude: [
      ...context.recent_meals.map((meal) => meal.title),
      ...known.filter((r) => shownRecently.has(r.id)).map((r) => r.title),
    ],
  });

  const { fresh } = dedupeAgainstMemory(generated.recipes, known);
  const searchQueries = generated.searchQueries;

  const pool = [...known, ...fresh.filter((r) => !exclude.has(r.id))];
  let scored = rankRecipes(pool, inventory, context, today).map((entry) => ({
    ...entry,
    score:
      Math.round(
        (entry.score - noveltyPenalty(entry.recipe, shownRecently, regenerating)) * 1000,
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

  const picked = mixProvenAndNew(scored, count);

  // Rank first, then look up videos — and only for what is about to be shown,
  // plus a small buffer in case one of them has no watchable source. Searching
  // all sixteen candidates would cost 1,600 of a 10,000-unit daily quota to
  // display three. Anything already resolved is served from cache for free.
  const buffer = scored
    .filter((entry) => !picked.includes(entry))
    .slice(0, SOURCE_BUFFER);

  const { recipes: withSources, outcomes } = await resolveSourcesFor(
    picked.map((entry) => entry.recipe),
    context,
    { queries: searchQueries },
  );

  // Substitute from the buffer for anything that came back without a video.
  const displayable = [...withSources];
  for (const [index, recipe] of withSources.entries()) {
    if (recipe.video_url || buffer.length === 0) continue;
    const replacement = buffer.shift()!;
    const resolved = await resolveSourcesFor([replacement.recipe], context, {
      queries: searchQueries,
    });
    if (resolved.recipes[0]?.video_url) {
      displayable[index] = resolved.recipes[0];
      picked[index] = replacement;
    }
  }

  // Anything discovered that now has a real, watchable source becomes part of
  // the household's library, so the next time it comes up it costs nothing.
  for (const recipe of displayable) {
    if (worthRemembering(recipe)) await db.upsertRecipe(recipe);
  }

  const sourceById = new Map(displayable.map((recipe) => [recipe.id, recipe]));
  const sourceIssue = outcomes.find(
    (outcome) => outcome.outcome === "provider_unavailable",
  )?.reason;

  const recommendations: Recommendation[] = picked.map((entry) => ({
    recipe: sourceById.get(entry.recipe.id) ?? entry.recipe,
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
    source_note: sourceIssue ?? null,
  };
}
