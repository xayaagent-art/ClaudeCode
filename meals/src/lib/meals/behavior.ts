import type { PreferenceEvent, PreferenceSignal, Recipe, WeeklyPlan } from "@/lib/types";
import { canonicalRecipeKey } from "@/lib/meals/memory";

/**
 * What the household has done, turned into ranking pressure.
 *
 * Signals were being written and never read — "capture the history first, model
 * later". This is later. Everything here is a pure function of persisted rows,
 * so the same history always produces the same adjustment and a surprising
 * suggestion can be explained by pointing at the events behind it.
 *
 * Identity is by canonical key, not id: a dish dismissed as a generated
 * candidate and re-proposed tomorrow under a fresh id is the same dinner, and
 * matching on id alone would forget every dismissal the moment it mattered.
 */

/**
 * The vocabulary Milestone 4 will read. The older names are still accepted
 * because they are already in the table — mapping them here means the history
 * already collected keeps counting rather than being stranded behind a rename.
 */
export type BehaviorEvent =
  | "recommendation_shown"
  | "recommendation_dismissed"
  | "recipe_opened"
  | "video_opened"
  | "video_started"
  | "video_completed"
  | "planned"
  | "cooked";

const LEGACY: Record<string, BehaviorEvent> = {
  recommendation_seen: "recommendation_shown",
  recommendation_selected: "recipe_opened",
  recipe_viewed: "recipe_opened",
  recipe_video_opened: "video_opened",
  external_source_opened: "video_opened",
  meal_logged: "cooked",
  meal_disliked: "recommendation_dismissed",
};

/** Normalise any stored event name into the current vocabulary. */
export function normalizeEvent(event: PreferenceEvent | BehaviorEvent | string): BehaviorEvent | null {
  if (event in LEGACY) return LEGACY[event];
  const known: BehaviorEvent[] = [
    "recommendation_shown", "recommendation_dismissed", "recipe_opened",
    "video_opened", "video_started", "video_completed", "planned", "cooked",
  ];
  return known.includes(event as BehaviorEvent) ? (event as BehaviorEvent) : null;
}

export interface DishHistory {
  dismissed: number;
  opened: number;
  cooked: number;
  planned: number;
  /** Most recent cook, ISO, when there is one. */
  lastCookedAt: string | null;
}

export interface BehaviorMemory {
  /** Keyed by canonical dish key. */
  byDish: Map<string, DishHistory>;
  /** Canonical keys of dishes on the current weekly plan. */
  plannedKeys: Set<string>;
  /** Cuisines the household opened or cooked, most engaged first. */
  favouredCuisines: string[];
}

function emptyHistory(): DishHistory {
  return { dismissed: 0, opened: 0, cooked: 0, planned: 0, lastCookedAt: null };
}

function keyOf(recipe: Recipe): string {
  return recipe.canonical_key ?? canonicalRecipeKey(recipe.title, recipe.cuisine);
}

/**
 * Fold the signal log into per-dish history.
 *
 * Signals carry a recipe id, so they are joined to dishes through the recipes
 * the household actually has. A signal whose recipe has since been replaced by
 * a merged duplicate still lands on the right dish, because both resolve to the
 * same canonical key.
 */
export function summarizeBehavior(
  signals: PreferenceSignal[],
  recipes: Recipe[],
  plan: WeeklyPlan | null = null,
): BehaviorMemory {
  const keyById = new Map(recipes.map((recipe) => [recipe.id, keyOf(recipe)]));
  const byDish = new Map<string, DishHistory>();
  const cuisineEngagement = new Map<string, number>();

  for (const signal of signals) {
    const event = normalizeEvent(signal.event);
    if (!event) continue;

    if (signal.cuisine && (event === "recipe_opened" || event === "cooked")) {
      const weight = event === "cooked" ? 2 : 1;
      const cuisine = signal.cuisine.toLowerCase();
      cuisineEngagement.set(cuisine, (cuisineEngagement.get(cuisine) ?? 0) + weight);
    }

    if (!signal.recipe_id) continue;
    const key = keyById.get(signal.recipe_id);
    if (!key) continue;

    const history = byDish.get(key) ?? emptyHistory();
    switch (event) {
      case "recommendation_dismissed":
        history.dismissed += 1;
        break;
      case "recipe_opened":
      case "video_opened":
      case "video_started":
        history.opened += 1;
        break;
      case "video_completed":
        history.opened += 2;
        break;
      case "planned":
        history.planned += 1;
        break;
      case "cooked":
        history.cooked += 1;
        if (!history.lastCookedAt || signal.created_at > history.lastCookedAt) {
          history.lastCookedAt = signal.created_at;
        }
        break;
      default:
        break;
    }
    byDish.set(key, history);
  }

  // The recipe rows carry their own cook history, which predates the signal log
  // and survives it. Whichever knows about a more recent cook wins.
  for (const recipe of recipes) {
    if (recipe.times_cooked <= 0 && !recipe.last_cooked_at) continue;
    const key = keyOf(recipe);
    const history = byDish.get(key) ?? emptyHistory();
    history.cooked = Math.max(history.cooked, recipe.times_cooked);
    if (recipe.last_cooked_at && (!history.lastCookedAt || recipe.last_cooked_at > history.lastCookedAt)) {
      history.lastCookedAt = recipe.last_cooked_at;
    }
    byDish.set(key, history);
  }

  const plannedKeys = new Set<string>();
  for (const entry of plan?.entries ?? []) {
    if (entry.kind !== "recipe" || !entry.recipe_id) continue;
    const key = keyById.get(entry.recipe_id);
    if (key) plannedKeys.add(key);
  }

  return {
    byDish,
    plannedKeys,
    favouredCuisines: [...cuisineEngagement.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cuisine]) => cuisine),
  };
}

/** Days since a dish was last cooked, or null if never. */
function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const age = now - Date.parse(iso);
  return Number.isFinite(age) ? age / 86_400_000 : null;
}

/**
 * A dish cooked in the last few days should not be tonight's headline. The
 * suppression fades rather than switching off, so a favourite returns on its
 * own schedule instead of being banned and then reappearing abruptly.
 */
const REPEAT_WINDOW_DAYS = 10;

export interface BehaviorAdjustment {
  delta: number;
  reasons: string[];
}

/**
 * Ranking pressure for one dish, from what the household has done with it.
 *
 * Returns a delta in the same units as the ranker's 0-1 score, deliberately
 * bounded: behaviour tilts the order, it never decides it. A dish that fits the
 * kitchen far better than anything else can still win despite a dismissal, and
 * a much-loved dish cannot outrank one the household can actually cook tonight.
 */
export function behaviorAdjustment(
  recipe: Recipe,
  memory: BehaviorMemory,
  options: { now?: number; casualAlternative?: boolean } = {},
): BehaviorAdjustment {
  const now = options.now ?? Date.now();
  const key = keyOf(recipe);
  const history = memory.byDish.get(key);
  const reasons: string[] = [];
  let delta = 0;

  if (history) {
    // Repeated dismissals are the clearest negative signal there is.
    if (history.dismissed > 0) {
      const penalty = Math.min(0.12 * history.dismissed, 0.3);
      delta -= penalty;
      reasons.push(`Dismissed ${history.dismissed}×`);
    }

    // Opening it is mild interest — enough to break a tie, not to promote a
    // dish the kitchen cannot support.
    if (history.opened > 0) {
      const boost = Math.min(0.03 * history.opened, 0.08);
      delta += boost;
      reasons.push(`Opened ${history.opened}×`);
    }

    if (history.cooked > 0) {
      // Long-term preference: a dish that has been cooked is a proven one.
      delta += Math.min(0.04 * history.cooked, 0.1);
      reasons.push(`Cooked ${history.cooked}×`);

      // Short-term suppression, which is stronger than the long-term boost so
      // that "we loved it" never means "again tomorrow".
      const days = daysSince(history.lastCookedAt, now);
      if (days !== null && days < REPEAT_WINDOW_DAYS) {
        const freshness = 1 - days / REPEAT_WINDOW_DAYS;
        delta -= 0.35 * freshness;
        reasons.push(`Cooked ${Math.round(days)}d ago`);
      }
    }
  }

  // Already on the week's plan: it is not a discovery, it is a commitment.
  // Suppressed as a casual alternative, untouched everywhere else.
  if (options.casualAlternative && memory.plannedKeys.has(key)) {
    delta -= 0.25;
    reasons.push("Already on this week's plan");
  }

  return { delta: Math.round(delta * 1000) / 1000, reasons };
}
