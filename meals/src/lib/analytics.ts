/**
 * Analytics hooks. No provider is wired up yet — events go to the console in
 * development and nowhere in production until `NEXT_PUBLIC_ANALYTICS_ENABLED`
 * is set and a sink is added below. Turning analytics off is a one-line change.
 */

export type AnalyticsEvent =
  | "receipt_scan_started"
  | "receipt_scan_completed"
  | "receipt_scan_failed"
  | "receipt_item_corrected"
  | "receipt_confirmed"
  | "meal_recommendation_requested"
  | "meal_recommendation_selected"
  | "recommendation_seen"
  | "recipe_viewed"
  | "recipe_video_opened"
  | "external_source_opened"
  | "meal_logged"
  | "meal_log_undone"
  | "meal_disliked"
  | "recommendation_regenerated"
  | "meal_feedback_submitted"
  | "plan_generated"
  | "plan_day_replaced"
  | "inventory_item_added"
  | "inventory_item_updated"
  // The vocabulary the server normalises on (see meals/behavior.ts). New
  // surfaces emit these; the older names above still work and still count.
  | "recommendation_shown"
  | "recommendation_dismissed"
  | "recipe_opened"
  | "video_opened"
  | "planned"
  | "cooked";

/**
 * Events that are also persisted as household preference signals. Analytics can
 * be switched off independently; these are product data, not telemetry, so they
 * are written regardless of NEXT_PUBLIC_ANALYTICS_ENABLED.
 */
const PERSISTED: ReadonlySet<AnalyticsEvent> = new Set<AnalyticsEvent>([
  "recommendation_seen",
  "meal_recommendation_selected",
  "recipe_viewed",
  "recipe_video_opened",
  "external_source_opened",
  "meal_logged",
  "recommendation_regenerated",
  "meal_disliked",
  "recommendation_shown",
  "recommendation_dismissed",
  "recipe_opened",
  "video_opened",
  "planned",
  "cooked",
]);

/** Signal names use the product vocabulary, which differs for one event. */
const SIGNAL_NAME: Partial<Record<AnalyticsEvent, string>> = {
  meal_recommendation_selected: "recommendation_selected",
};

export type AnalyticsProps = Record<string, string | number | boolean | null>;

type Sink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

let sink: Sink | null = null;

export function setAnalyticsSink(next: Sink | null): void {
  sink = next;
}

function enabled(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true";
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  persistSignal(event, props);

  if (!enabled()) return;
  if (sink) {
    sink(event, props);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info(`[analytics] ${event}`, props);
  }
}

/**
 * Fire-and-forget write to /api/signals. Never awaited and never surfaced —
 * losing a signal must not interrupt what the user is doing.
 */
function persistSignal(event: AnalyticsEvent, props: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  if (!PERSISTED.has(event)) return;

  const { recipe_id, cuisine, member_id, ...detail } = props;
  void fetch("/api/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event: SIGNAL_NAME[event] ?? event,
      recipe_id: typeof recipe_id === "string" ? recipe_id : null,
      cuisine: typeof cuisine === "string" ? cuisine : null,
      member_id: typeof member_id === "string" ? member_id : null,
      detail,
    }),
  }).catch(() => {});
}
