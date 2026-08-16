/**
 * Analytics hooks. No provider is wired up yet — events go to the console in
 * development and nowhere in production until `NEXT_PUBLIC_ANALYTICS_ENABLED`
 * is set and a sink is added below. Turning analytics off is a one-line change.
 */

export type AnalyticsEvent =
  | "receipt_scan_started"
  | "receipt_scan_completed"
  | "receipt_item_corrected"
  | "receipt_confirmed"
  | "meal_recommendation_requested"
  | "meal_recommendation_selected"
  | "recipe_viewed"
  | "meal_logged"
  | "meal_log_undone"
  | "recommendation_regenerated"
  | "meal_feedback_submitted"
  | "plan_generated"
  | "inventory_item_added"
  | "inventory_item_updated";

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
