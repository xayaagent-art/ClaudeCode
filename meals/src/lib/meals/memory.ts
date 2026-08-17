import type { Recipe } from "@/lib/types";

/**
 * Recipe memory.
 *
 * A dish the household actually cooked is worth far more than one a model
 * invented ten seconds ago: it has a real video, real feedback, and proof
 * somebody was willing to make it. Promoting those into the stored catalog is
 * what stops the app paying for the same idea twice, and what turns discovery
 * into a library that grows instead of a slot machine.
 *
 * This module holds identity and promotion rules only. Persistence is the
 * database adapter's job.
 */

/** Words that describe our serving framing rather than the dish itself. */
const FRAMING = new Set(["bowl", "bowls", "plate", "plates", "wrap", "wraps", "recipe", "easy", "quick", "simple"]);

/**
 * Stable identity for a dish.
 *
 * Two independent discoveries of "Palak Paneer" must collapse to one row, or
 * the library fills with duplicates and each one pays for its own video search.
 * Cuisine is part of the key because a "chickpea salad" is genuinely a
 * different dish in Greek and Indian hands.
 */
export function canonicalRecipeKey(title: string, cuisine: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FRAMING.has(word))
    .sort();

  const dish = [...new Set(words)].join("-");
  const region = cuisine.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${region}:${dish}` || "unknown";
}

/** True for a recipe the household has cooked at least once. */
export function isProven(recipe: Recipe): boolean {
  return recipe.times_cooked > 0;
}

/**
 * Already part of the household's library, as opposed to an idea from tonight.
 *
 * This is the line the exploration slot is drawn on, and it is deliberately
 * wider than `isProven`. A brand-new household has cooked nothing, so splitting
 * on cook history alone would make every dish "exploratory" and the mix
 * collapse back to a plain top-three — which is the static-catalog behaviour
 * this milestone exists to remove.
 */
export function isEstablished(recipe: Recipe): boolean {
  return recipe.times_cooked > 0 || recipe.source_type === "catalog";
}

/**
 * Is this discovery worth keeping?
 *
 * Only once it has a watchable source. An idea with no video is not a recipe
 * anyone can follow, and storing it would pollute the library with entries that
 * cost a search every time they resurface.
 */
export function worthRemembering(recipe: Recipe): boolean {
  if (recipe.source_type === "catalog") return false;
  return Boolean(recipe.video_url && recipe.thumbnail_url);
}

/**
 * Merge a rediscovery into what is already known.
 *
 * The stored copy wins on anything earned — cook count, feedback history, an
 * already-resolved video — while fresh text and a better source can update.
 * Losing a times_cooked to a regeneration would erase the household's history.
 */
export function mergeIntoMemory(stored: Recipe, incoming: Recipe): Recipe {
  return {
    ...incoming,
    id: stored.id,
    canonical_key: stored.canonical_key ?? incoming.canonical_key,
    times_cooked: stored.times_cooked,
    last_cooked_at: stored.last_cooked_at,
    created_at: stored.created_at,
    // Keep a working source rather than replacing it with a missing one.
    video_url: incoming.video_url ?? stored.video_url,
    video_platform: incoming.video_platform ?? stored.video_platform,
    thumbnail_url: incoming.thumbnail_url ?? stored.thumbnail_url,
    attribution: incoming.attribution ?? stored.attribution,
    source_name: incoming.source_name ?? stored.source_name,
    source_url: incoming.source_url ?? stored.source_url,
    source_quality: incoming.source_quality ?? stored.source_quality,
    discovered_at: incoming.discovered_at ?? stored.discovered_at,
    instructions: incoming.instructions.length > 0 ? incoming.instructions : stored.instructions,
  };
}

/**
 * Collapse candidates that are the same dish as something already known, and
 * drop duplicates within the batch. Returns what genuinely deserves ranking.
 */
export function dedupeAgainstMemory(
  candidates: Recipe[],
  known: Recipe[],
): { fresh: Recipe[]; alreadyKnown: Recipe[] } {
  const byKey = new Map<string, Recipe>();
  for (const recipe of known) {
    const key = recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine);
    byKey.set(key, recipe);
  }

  const fresh: Recipe[] = [];
  const alreadyKnown: Recipe[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.canonical_key ?? canonicalRecipeKey(candidate.title, candidate.cuisine);
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = byKey.get(key);
    // The stored copy already has a video and history — prefer it outright.
    if (existing) alreadyKnown.push(existing);
    else fresh.push(candidate);
  }

  return { fresh, alreadyKnown };
}

/**
 * Words describing how a dish is cooked rather than what is in it.
 * Two dishes sharing ingredients but not preparation are genuinely different.
 */
const PREP_STYLES = [
  "curry", "soup", "stew", "salad", "taco", "wrap", "burrito", "skillet", "bake",
  "roast", "grill", "stir fry", "stirfry", "fried", "omelette", "frittata", "pasta",
  "risotto", "pilaf", "biryani", "sandwich", "toast", "pizza", "dal", "chili",
  "casserole", "gratin", "kebab", "burger", "noodle", "ramen", "shakshuka",
];

/** Ingredients too common to distinguish one dish from another. */
const UBIQUITOUS = new Set([
  "salt", "pepper", "oil", "olive oil", "water", "garlic", "onion", "yellow onion",
  "butter", "sugar", "flour", "cumin", "coriander", "turmeric", "chili", "chilli",
]);

export interface DishSignature {
  /** The two or three ingredients that actually define the dish. */
  core: string[];
  /** How it is cooked, when the title says. */
  prep: string | null;
  cuisine: string;
}

/**
 * What a dish actually *is*, for near-duplicate detection.
 *
 * Title keys are not enough: "Palak Paneer Bowl" and "Paneer Spinach Bowl" sort
 * to different keys but are the same dinner, and offering both as "variety" is
 * exactly the complaint. Comparing core ingredients plus preparation catches
 * the rename; comparing preparation stops it over-firing on genuinely different
 * dishes that happen to share a protein.
 */
export function dishSignature(recipe: Recipe): DishSignature {
  const core = [
    ...new Set(
      recipe.ingredients
        .filter((ingredient) => !ingredient.optional)
        .map((ingredient) => ingredient.normalized_name)
        .filter((name) => name.length > 1 && !UBIQUITOUS.has(name)),
    ),
  ].sort();

  const haystack = `${recipe.title} ${recipe.description}`.toLowerCase();
  const prep = PREP_STYLES.find((style) => haystack.includes(style)) ?? null;

  return { core, prep, cuisine: recipe.cuisine.toLowerCase() };
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((value) => setB.has(value)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * Are these effectively the same dinner?
 *
 * Same canonical identity is obviously a duplicate. Beyond that it takes a
 * heavy ingredient overlap *and* the same preparation — spinach-and-paneer
 * curry versus spinach-and-paneer salad are two different evenings.
 */
export function isNearDuplicate(a: Recipe, b: Recipe): boolean {
  const keyA = a.canonical_key ?? canonicalRecipeKey(a.title, a.cuisine);
  const keyB = b.canonical_key ?? canonicalRecipeKey(b.title, b.cuisine);
  if (keyA === keyB) return true;

  const sigA = dishSignature(a);
  const sigB = dishSignature(b);
  const overlap = jaccard(sigA.core, sigB.core);

  // Nearly the same ingredient list, cooked the same way.
  if (overlap >= 0.6 && sigA.prep === sigB.prep) return true;
  // Or an overwhelming ingredient match regardless of how it is described.
  return overlap >= 0.8;
}

/** Drop anything that is effectively a repeat of something already chosen. */
export function withoutNearDuplicates<T extends { recipe: Recipe }>(
  entries: T[],
  against: Recipe[] = [],
): T[] {
  const kept: Recipe[] = [...against];
  const out: T[] = [];
  for (const entry of entries) {
    if (kept.some((existing) => isNearDuplicate(existing, entry.recipe))) continue;
    kept.push(entry.recipe);
    out.push(entry);
  }
  return out;
}
