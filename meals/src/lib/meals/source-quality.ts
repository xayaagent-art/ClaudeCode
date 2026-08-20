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

/**
 * Signals that a title is not a cook-along recipe.
 *
 * Patterns rather than substrings, because the ambiguous ones need context.
 * "Restaurant" is the clearest case: "Restaurant Style Palak Paneer" is how a
 * large share of genuine Indian cook-alongs are titled, and penalising it was
 * pushing the best result for this household's most-cooked cuisine below the
 * quality bar. Only restaurant content that is about *visiting* one is
 * off-format. The word is also in TITLE_NOISE below, which is the tell: it
 * cannot simultaneously be meaningless filler and evidence of a vlog.
 */
const OFF_FORMAT: RegExp[] = [
  // "#shorts" is a format tag, not a verdict. A 50-second demonstration of the
  // actual dish is often the most useful thing on the platform, so length and
  // instructional intent are judged on their own below rather than by the tag.
  /\basmr\b/,
  /\bmukbang\b/,
  /\btaste test\b/,
  /\breaction\b/,
  /\breview\b/,
  /\bvs\b/,
  /\bchallenge\b/,
  /\bcompilation\b/,
  /\btop \d+\b/,
  /\brestaurant\b(?!\s*-?\s*style)/,
  /\bstreet food\b/,
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

/**
 * How well a runtime suits someone cooking from it.
 *
 * 2-10 minutes is the shape of a real cook-along and scores full marks.
 * 10-15 is fine. Past 15 the video is a lesson, a vlog or a compilation, and
 * is pushed down hard enough that any credible shorter alternative wins — but
 * not to zero, because a 20-minute video is still better than no video when it
 * is the only thing that teaches the dish.
 *
 * Shorts are scored on their own terms rather than excluded. Under 60 seconds
 * cannot carry a full method, so it lands mid-table: good enough to win when
 * it is genuinely about the dish and nothing longer is, never good enough to
 * beat a real cook-along on shortness alone.
 */
export function durationFit(seconds: number | null): number {
  if (seconds === null) return 0.5;
  if (seconds < 45) return 0.25;
  if (seconds < 120) return 0.6;
  if (seconds <= 600) return 1;
  if (seconds <= 900) return 0.8;
  if (seconds <= 1200) return 0.35;
  return 0.15;
}

/**
 * Credibility from reach, 0-1, with a floor under what counts as evidence.
 *
 * A few hundred views is not a recommendation — it is an absence of one. The
 * curve is flat and low until about 5k, climbs through the range where a
 * cooking video has actually been watched, and flattens again past a million
 * because beyond that bigger is just bigger.
 */
export function reachScore(views: number | null): number {
  if (views === null || views <= 0) return 0.3;
  if (views < 1_000) return 0.05;
  if (views < 5_000) return 0.15;
  if (views < 50_000) return 0.5;
  if (views < 100_000) return 0.7;
  if (views < 1_000_000) return 0.85;
  return 1;
}

/** Below this, a video needs everything else to be excellent to be used. */
export const LOW_VIEW_FLOOR = 5_000;

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

  const offFormat = OFF_FORMAT.some((pattern) => pattern.test(title));
  if (offFormat) reasons.push("Penalised: looks like non-recipe content");

  // Popularity is a weak credibility proxy, capped so a viral clip cannot
  // outrank a well-matched video from a smaller channel.
  const views = candidate.view_count ?? 0;
  const reach = reachScore(candidate.view_count);
  if (views > 0) reasons.push(`${views.toLocaleString()} views`);
  if (views > 0 && views < LOW_VIEW_FLOOR) reasons.push("Penalised: very few views");

  // Engagement relative to reach separates a video people actually watched and
  // used from one an algorithm happened to push. Log-scaled and capped, because
  // the difference between 1% and 2% like rate is not worth a ranking place.
  const engagement = engagementScore(candidate);
  if (engagement > 0.6) reasons.push("Strong engagement for its size");

  // A cooking channel that has posted for years is a better bet than a larger
  // general channel with one recipe on it. Deliberately weighted *below*
  // relevance and instructional format: a big creator never buys its way past
  // a video that is actually about the dish.
  const culinary = candidate.channel_is_culinary === true;
  const authority = channelAuthority(candidate);
  if (culinary) reasons.push(`${candidate.channel} is a cooking channel`);
  if (authority > 0.65) reasons.push("Established creator");

  const hasThumb = Boolean(candidate.thumbnail_url);
  if (!hasThumb) reasons.push("No thumbnail available");

  // Order of the weights is the priority order in the spec: relevance first,
  // then instructional intent, then duration, then who made it, then reach.
  // Popularity is last on purpose — it must never buy a place ahead of a video
  // that is actually about the dish.
  const score = clamp01(
    0.30 * relevance +
      (teaches ? 0.14 : 0) +
      0.16 * duration +
      (culinary ? 0.09 : 0) +
      0.08 * authority +
      0.10 * reach +
      0.04 * engagement +
      (cuisineHit ? 0.05 : 0) +
      (hasThumb ? 0.04 : 0) -
      (offFormat ? 0.25 : 0),
  );

  return {
    score: Math.round(score * 1000) / 1000,
    reasons,
    checked_at: new Date().toISOString(),
    disqualified: false,
  };
}

/**
 * Engagement relative to audience size, 0-1.
 *
 * Absolute like counts just re-measure reach. The ratio is what says people
 * finished the video and came back to say so.
 */
export function engagementScore(candidate: VideoCandidate): number {
  const views = candidate.view_count ?? 0;
  const likes = candidate.like_count ?? 0;
  const comments = candidate.comment_count ?? 0;
  if (views <= 0 || (likes === 0 && comments === 0)) return 0.4;

  // A 3% like rate is excellent on YouTube; treat that as the ceiling.
  const likeRate = clamp01(likes / views / 0.03);
  const commentRate = clamp01(comments / views / 0.002);
  return Math.round((0.7 * likeRate + 0.3 * commentRate) * 100) / 100;
}

/**
 * How established the creator is, 0-1.
 *
 * Subscribers are log-scaled so the gap between 10k and 100k matters more than
 * the gap between 5M and 10M — past a point, bigger is not better for a recipe,
 * it is just bigger. A channel with a real back catalogue gets a small nudge.
 */
export function channelAuthority(candidate: VideoCandidate): number {
  const subscribers = candidate.channel_subscribers ?? null;
  if (subscribers === null) return 0.45;

  // 1k → ~0.3, 100k → ~0.71, 1M+ → capped.
  const scale = subscribers > 0 ? clamp01(Math.log10(subscribers) / 7) : 0;
  const catalogue = (candidate.channel_video_count ?? 0) >= 50 ? 0.1 : 0;
  return Math.round(clamp01(scale + catalogue) * 100) / 100;
}

/** Lowest score worth attaching to a recipe. Below this we show no video at all. */
export const MIN_SOURCE_QUALITY = 0.45;

export interface SelectedVideo {
  candidate: VideoCandidate;
  quality: QualityAssessment;
}

/** Videos this long are a last resort, however good they otherwise look. */
const LONG_VIDEO_SECONDS = 900;

/** A candidate we would rather not use if anything credible exists instead. */
function isCompromised(entry: SelectedVideo): boolean {
  const { view_count, duration_seconds } = entry.candidate;
  const tooFewViews = view_count !== null && view_count > 0 && view_count < LOW_VIEW_FLOOR;
  const tooLong = duration_seconds !== null && duration_seconds > LONG_VIDEO_SECONDS;
  return tooFewViews || tooLong;
}

/**
 * Pick the best candidate, or null when none clears the bar.
 *
 * Score alone would let a barely-watched clip or a 25-minute lesson win on the
 * strength of a perfect title match. So the field is split: anything credible
 * is preferred outright, and the compromised ones are used only when nothing
 * credible cleared the bar — which is the difference between "prefer" and
 * "reject", and the reason a dish with only one video still gets it.
 */
export function selectBestVideo(
  candidates: VideoCandidate[],
  recipe: Recipe,
  context: HouseholdContext,
): SelectedVideo | null {
  const assessed = candidates
    .map((candidate) => ({ candidate, quality: assessVideo(candidate, recipe, context) }))
    .filter((entry) => !entry.quality.disqualified && entry.quality.score >= MIN_SOURCE_QUALITY)
    .sort((a, b) => b.quality.score - a.quality.score);

  const credible = assessed.filter((entry) => !isCompromised(entry));
  return credible[0] ?? assessed[0] ?? null;
}

/** The search string used to find a cook-along for this dish. */
export function buildVideoQuery(recipe: Recipe): string {
  const base = recipe.title.trim();
  const cuisine = recipe.cuisine && !base.toLowerCase().includes(recipe.cuisine.toLowerCase())
    ? ` ${recipe.cuisine}`
    : "";
  return `${base}${cuisine} recipe`;
}

/**
 * Several ways of asking for the same dish.
 *
 * One phrasing gets one slice of YouTube, and our phrasing is often not the
 * one cooks use: "Chicken Saag" and "Indian chicken spinach curry" surface
 * substantially different videos, and the good one is not reliably under our
 * wording. Variants are deduplicated and ordered most-specific first, so the
 * first search is still the most likely to answer and later ones only widen.
 *
 * Kept small deliberately: each variant is a 100-unit search against a
 * 10,000-unit daily quota.
 */
export function buildVideoQueries(recipe: Recipe, modelQuery?: string): string[] {
  const title = recipe.title.trim();
  const cuisine = recipe.cuisine.trim();
  const core = titleTokens(title);

  const variants = [
    modelQuery?.trim(),
    buildVideoQuery(recipe),
    // The dish reordered around its own defining words, which is how a cook
    // would type it: "saag chicken recipe" for "Chicken Saag".
    core.length >= 2 ? `${[...core].reverse().join(" ")} recipe` : null,
    // A description rather than a name, for dishes whose name we invented.
    cuisine && core.length > 0 ? `${cuisine} ${core.join(" ")} recipe` : null,
    `how to make ${title}`,
  ];

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const variant of variants) {
    const cleaned = variant?.replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    queries.push(variant!.replace(/\s+/g, " ").trim());
  }
  return queries.slice(0, 3);
}
