import { canonicalName } from "@/lib/kitchen/match";
import type { HouseholdContext, Recipe, SourceQuality } from "@/lib/types";
import type { VideoCandidate } from "@/lib/video/provider";

/**
 * Source quality heuristic.
 *
 * Deliberately simple and fully deterministic: no model decides which video the
 * household gets. The score is internal — it selects between candidates and is
 * stored so a bad pick can be explained later — and is never shown to the user
 * as a numeric "AI quality score".
 */

/** Words in a title that signal the video is not a cook-along recipe. */
const OFF_FORMAT = [
  "shorts", "asmr", "mukbang", "taste test", "reaction", "review", "vs ",
  "challenge", "compilation", "top 10", "restaurant", "street food",
];

/** Signals the creator is teaching a recipe rather than vlogging. */
const RECIPE_SIGNALS = ["recipe", "how to make", "how to cook", "at home", "easy", "step by step", "homemade"];

/** Titles that promise a dietary form the household does not eat. */
const CONFLICTS: { token: string; blocks: (context: HouseholdContext) => boolean }[] = [
  { token: "chicken", blocks: (c) => !c.preferences.chicken_allowed },
  { token: "beef", blocks: (c) => c.preferences.vegetarian },
  { token: "pork", blocks: (c) => c.preferences.vegetarian },
  { token: "bacon", blocks: (c) => c.preferences.vegetarian },
  { token: "mutton", blocks: (c) => c.preferences.vegetarian },
  { token: "lamb", blocks: (c) => c.preferences.vegetarian },
  { token: "prawn", blocks: (c) => c.preferences.vegetarian },
  { token: "shrimp", blocks: (c) => c.preferences.vegetarian },
  { token: "fish", blocks: (c) => c.preferences.vegetarian },
  { token: "egg", blocks: (c) => !c.preferences.eggs_allowed },
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Filler words in video titles that carry no signal about the dish. */
const TITLE_NOISE = new Set([
  "recipe", "recipes", "easy", "quick", "best", "simple", "how", "to", "make", "cook",
  "cooking", "the", "a", "an", "and", "with", "for", "in", "at", "home", "homemade",
  "style", "restaurant", "perfect", "authentic", "my", "your", "you", "this", "that",
  "minute", "minutes", "min", "step", "by", "video", "food", "dish", "of", "on",
]);

/**
 * Tokenizer for free-text video titles.
 *
 * Deliberately NOT the inventory tokenizer: that one truncates a name at "with"
 * because "English Cheddar with Caramelized Onion" is a cheddar. Applied to a
 * video title it would hide "…with Chicken" entirely, which is exactly the
 * thing the dietary check has to catch.
 */
export function titleTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token,
    )
    .filter((token) => token.length > 1 && !TITLE_NOISE.has(token));
}

/** Share of the dish's own words that appear in the candidate's title. */
export function dishRelevance(recipeTitle: string, candidateTitle: string): number {
  const wanted = titleTokens(recipeTitle);
  if (wanted.length === 0) return 0;
  const found = new Set(titleTokens(candidateTitle));
  const hits = wanted.filter((token) => found.has(token)).length;
  return hits / wanted.length;
}

/** A recipe you can follow runs a few minutes; 30-second clips and 40-minute vlogs do not. */
export function durationFit(seconds: number | null): number {
  if (seconds === null) return 0.5;
  if (seconds < 90) return 0.1;
  if (seconds <= 180) return 0.7;
  if (seconds <= 900) return 1;
  if (seconds <= 1500) return 0.7;
  return 0.35;
}

export interface QualityAssessment extends SourceQuality {
  /** True when the candidate must not be used at all. */
  disqualified: boolean;
}

/**
 * Score one video candidate for one recipe and household.
 * Returns the reasons alongside the score so selection is auditable.
 */
export function assessVideo(
  candidate: VideoCandidate,
  recipe: Recipe,
  context: HouseholdContext,
): QualityAssessment {
  const reasons: string[] = [];
  const title = candidate.title.toLowerCase();

  // Dietary conflicts are disqualifying, exactly like recipe eligibility.
  for (const conflict of CONFLICTS) {
    if (!conflict.blocks(context)) continue;
    const mentionsIt = titleTokens(candidate.title).includes(conflict.token);
    const recipeHasIt = recipe.ingredients.some(
      (i) => canonicalName(i.ingredient_name) === canonicalName(conflict.token),
    );
    if (mentionsIt && !recipeHasIt) {
      return {
        score: 0,
        reasons: [`Disqualified: title mentions ${conflict.token}, which this household does not eat`],
        checked_at: new Date().toISOString(),
        disqualified: true,
      };
    }
  }

  const relevance = dishRelevance(recipe.title, candidate.title);
  if (relevance < 0.34) {
    return {
      score: 0,
      reasons: [`Disqualified: title "${candidate.title}" does not match the dish`],
      checked_at: new Date().toISOString(),
      disqualified: true,
    };
  }
  reasons.push(`Title matches ${Math.round(relevance * 100)}% of the dish name`);

  const duration = durationFit(candidate.duration_seconds);
  reasons.push(
    candidate.duration_seconds === null
      ? "Duration unknown"
      : `Runs ${Math.round(candidate.duration_seconds / 60)} min`,
  );

  const cuisineHit = titleTokens(`${candidate.title} ${candidate.description.slice(0, 200)}`)
    .includes(recipe.cuisine.toLowerCase());
  if (cuisineHit) reasons.push(`Mentions ${recipe.cuisine}`);

  const teaches = RECIPE_SIGNALS.some((signal) => title.includes(signal));
  if (teaches) reasons.push("Framed as a recipe rather than a vlog");

  const offFormat = OFF_FORMAT.some((signal) => title.includes(signal));
  if (offFormat) reasons.push("Penalised: looks like non-recipe content");

  // Popularity is a weak credibility proxy, capped so a viral clip cannot
  // outrank a well-matched video from a smaller channel.
  const views = candidate.view_count ?? 0;
  const reach = views > 0 ? clamp01(Math.log10(views) / 6) : 0.3;
  if (views > 0) reasons.push(`${views.toLocaleString()} views`);

  const hasThumb = Boolean(candidate.thumbnail_url);
  if (!hasThumb) reasons.push("No thumbnail available");

  const score = clamp01(
    0.4 * relevance +
      0.2 * duration +
      0.12 * reach +
      (cuisineHit ? 0.1 : 0) +
      (teaches ? 0.1 : 0) +
      (hasThumb ? 0.08 : 0) -
      (offFormat ? 0.25 : 0),
  );

  return {
    score: Math.round(score * 1000) / 1000,
    reasons,
    checked_at: new Date().toISOString(),
    disqualified: false,
  };
}

/** Lowest score worth attaching to a recipe. Below this we show no video at all. */
export const MIN_SOURCE_QUALITY = 0.45;

export interface SelectedVideo {
  candidate: VideoCandidate;
  quality: QualityAssessment;
}

/** Pick the best candidate, or null when none clears the bar. */
export function selectBestVideo(
  candidates: VideoCandidate[],
  recipe: Recipe,
  context: HouseholdContext,
): SelectedVideo | null {
  const assessed = candidates
    .map((candidate) => ({ candidate, quality: assessVideo(candidate, recipe, context) }))
    .filter((entry) => !entry.quality.disqualified && entry.quality.score >= MIN_SOURCE_QUALITY)
    .sort((a, b) => b.quality.score - a.quality.score);
  return assessed[0] ?? null;
}

/** The search string used to find a cook-along for this dish. */
export function buildVideoQuery(recipe: Recipe): string {
  const base = recipe.title.trim();
  const cuisine = recipe.cuisine && !base.toLowerCase().includes(recipe.cuisine.toLowerCase())
    ? ` ${recipe.cuisine}`
    : "";
  return `${base}${cuisine} recipe`;
}
