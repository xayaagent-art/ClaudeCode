import { assessFreshness, useSoonScore } from "@/lib/kitchen/freshness";
import { todayISO } from "@/lib/date";
import type {
  InventoryEvent,
  InventoryItem,
  InventoryStatus,
  InventoryStatusSource,
} from "@/lib/types";

/**
 * Inventory state, derived and explainable.
 *
 * The household should not be maintaining a spreadsheet. The system keeps a
 * *probabilistic* view: a status plus a confidence in that status, both of which
 * can be traced back through the event log to the observation that produced
 * them. Nothing here mutates silently — every transition is an event.
 */

/** How much we trust each kind of observation the moment it happens. */
const SOURCE_CONFIDENCE: Record<InventoryStatusSource, number> = {
  user: 1, // someone looked in the fridge
  receipt: 0.95, // we watched it come into the house
  seed: 0.8,
  inferred: 0.7, // we guessed from a recipe
};

/**
 * Confidence decays with time: a status we inferred three weeks ago says very
 * little about today. Halves roughly every two weeks, floored so we never claim
 * to know nothing at all.
 */
const HALF_LIFE_DAYS = 14;
const CONFIDENCE_FLOOR = 0.25;

export function decayConfidence(
  base: number,
  daysSinceObservation: number,
): number {
  if (daysSinceObservation <= 0) return base;
  const decayed = base * Math.pow(0.5, daysSinceObservation / HALF_LIFE_DAYS);
  return Math.round(Math.max(CONFIDENCE_FLOOR, decayed) * 1000) / 1000;
}

export type ConfidenceBandName = "high" | "medium" | "low";

export function confidenceBandOf(confidence: number): ConfidenceBandName {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}

/** Availability as the recommender understands it. */
export type AvailabilityState =
  | "available_high_confidence"
  | "available_uncertain"
  | "low"
  | "out";

export interface InventoryInsight {
  item: InventoryItem;
  status: InventoryStatus;
  /** Time-decayed confidence in `status`. */
  confidence: number;
  band: ConfidenceBandName;
  availability: AvailabilityState;
  use_soon: boolean;
  use_soon_score: number;
  freshness_label: string;
  likely_past_best: boolean;
  /** Days since a human last confirmed this item, null if never. */
  days_since_confirmed: number | null;
  /** One line explaining how we arrived at this state. */
  explanation: string;
}

function daysSince(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const now = Date.parse(`${today}T23:59:59Z`);
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * Current confidence in an item's status, accounting for how it was observed
 * and how long ago.
 */
export function currentConfidence(item: InventoryItem, today = todayISO()): number {
  const base = item.status_confidence || SOURCE_CONFIDENCE[item.status_source] || 0.7;
  const observedAt = item.last_confirmed_at ?? item.updated_at ?? item.created_at;
  const age = daysSince(observedAt, today) ?? 0;
  return decayConfidence(base, age);
}

/**
 * Turn a stored row plus its history into everything the rest of the app needs.
 * Pure, so it is testable and identical on server and client.
 */
export function inspect(
  item: InventoryItem,
  events: InventoryEvent[] = [],
  today = todayISO(),
): InventoryInsight {
  const confidence = currentConfidence(item, today);
  const band = confidenceBandOf(confidence);
  const freshness = assessFreshness(item, today);
  const score = useSoonScore(item, today);

  const availability: AvailabilityState =
    item.status === "out"
      ? "out"
      : item.status === "low"
        ? "low"
        : band === "high"
          ? "available_high_confidence"
          : "available_uncertain";

  const mine = events.filter((event) => event.inventory_item_id === item.id);
  const lastChange = mine.find((event) => event.from_status !== event.to_status);
  const consumedCount = mine.filter((event) => event.event_type === "meal_consumed").length;

  const parts: string[] = [];
  if (item.purchase_date) {
    const age = daysSince(`${item.purchase_date}T00:00:00Z`, today);
    if (age !== null) parts.push(age === 0 ? "Bought today" : `Bought ${age} days ago`);
  }
  if (consumedCount > 0) {
    parts.push(`used in ${consumedCount} meal${consumedCount === 1 ? "" : "s"}`);
  }
  if (lastChange?.detail) parts.push(lastChange.detail.toLowerCase());
  if (freshness.days_left !== null) parts.push(freshness.label.toLowerCase());

  return {
    item,
    status: item.status,
    confidence,
    band,
    availability,
    use_soon: freshness.state === "use_soon" || freshness.state === "likely_past_best",
    use_soon_score: score,
    freshness_label: freshness.label,
    likely_past_best: freshness.state === "likely_past_best",
    days_since_confirmed: daysSince(item.last_confirmed_at, today),
    explanation: parts.length > 0 ? parts.join(" · ") : "No history yet",
  };
}

export function inspectAll(
  items: InventoryItem[],
  events: InventoryEvent[] = [],
  today = todayISO(),
): InventoryInsight[] {
  return items.map((item) => inspect(item, events, today));
}

/** Confidence to record when an observation of a given kind is made. */
export function confidenceForSource(source: InventoryStatusSource): number {
  return SOURCE_CONFIDENCE[source];
}

/**
 * Replay an item's events to check the stored status is explainable.
 * Used by tests and debugging, not on the hot path.
 */
export function replayStatus(
  events: InventoryEvent[],
  itemId: string,
): { status: InventoryStatus | null; steps: string[] } {
  const mine = events
    .filter((event) => event.inventory_item_id === itemId)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let status: InventoryStatus | null = null;
  const steps: string[] = [];

  for (const event of mine) {
    if (event.to_status && event.to_status !== status) {
      steps.push(`${event.created_at.slice(0, 10)} ${event.event_type}: ${status ?? "—"} → ${event.to_status}`);
      status = event.to_status;
    }
  }
  return { status, steps };
}
