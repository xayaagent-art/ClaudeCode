import { canonicalName } from "@/lib/kitchen/match";
import type { InventoryEvent, InventoryItem } from "@/lib/types";

/**
 * Household food statistics, derived from the event log.
 *
 * Nothing is stored that can be recalculated. These are rolling heuristics, not
 * a model: how fast this household actually gets through a product, how often
 * they rebuy it, and how often it goes off unused. They exist so inference can
 * adapt — if Greek yogurt is always gone in four days here, stop pretending it
 * lasts two weeks.
 */

export interface ProductSignal {
  /** Canonical product key. */
  product: string;
  /** Times this product has been added from a receipt. */
  purchases: number;
  /** Mean days from purchase to reaching Out, when observed. */
  avg_days_to_out: number | null;
  /** Mean days between repurchases, when observed more than once. */
  repurchase_interval_days: number | null;
  /** Meals this product has been used in. */
  meal_uses: number;
  /** Times it was marked out while still considered fresh — i.e. eaten fast. */
  fast_consumption_count: number;
  /** Times it was likely thrown away past its best. */
  waste_count: number;
  /** 0–1: how much this behaves like a long-lived staple. */
  staple_likelihood: number;
}

interface Timeline {
  added: string[];
  outAt: string[];
  mealUses: number;
  expired: number;
}

function daysBetweenISO(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/**
 * Build per-product statistics from inventory items and their events.
 * Pure and cheap enough to run on every Kitchen render.
 */
export function buildProductSignals(
  items: InventoryItem[],
  events: InventoryEvent[],
): Map<string, ProductSignal> {
  const itemProduct = new Map<string, string>();
  for (const item of items) {
    itemProduct.set(item.id, canonicalName(item.normalized_name));
  }

  const timelines = new Map<string, Timeline>();
  const timelineFor = (product: string): Timeline => {
    let timeline = timelines.get(product);
    if (!timeline) {
      timeline = { added: [], outAt: [], mealUses: 0, expired: 0 };
      timelines.set(product, timeline);
    }
    return timeline;
  };

  const ordered = events
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const event of ordered) {
    const product = itemProduct.get(event.inventory_item_id);
    if (!product) continue;
    const timeline = timelineFor(product);

    switch (event.event_type) {
      case "receipt_added":
      case "restocked":
        timeline.added.push(event.created_at);
        break;
      case "meal_consumed":
        timeline.mealUses += 1;
        break;
      case "expired":
        timeline.expired += 1;
        break;
      default:
        break;
    }
    if (event.to_status === "out" && event.from_status !== "out") {
      timeline.outAt.push(event.created_at);
    }
  }

  const signals = new Map<string, ProductSignal>();

  for (const [product, timeline] of timelines) {
    // Pair each "out" with the most recent preceding purchase.
    const lifetimes: number[] = [];
    for (const outAt of timeline.outAt) {
      const purchase = timeline.added.filter((added) => added <= outAt).pop();
      if (purchase) lifetimes.push(daysBetweenISO(purchase, outAt));
    }

    const intervals: number[] = [];
    for (let i = 1; i < timeline.added.length; i += 1) {
      intervals.push(daysBetweenISO(timeline.added[i - 1], timeline.added[i]));
    }

    const avgLife = mean(lifetimes);
    // A staple is bought rarely, lasts a long time, and rarely hits zero.
    const stapleLikelihood = (() => {
      let score = 0.5;
      if (avgLife !== null) score += avgLife >= 21 ? 0.3 : avgLife <= 7 ? -0.3 : 0;
      if (timeline.outAt.length === 0 && timeline.mealUses >= 3) score += 0.2;
      if (timeline.mealUses >= 5 && timeline.outAt.length <= 1) score += 0.1;
      return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
    })();

    signals.set(product, {
      product,
      purchases: timeline.added.length,
      avg_days_to_out: avgLife,
      repurchase_interval_days: mean(intervals),
      meal_uses: timeline.mealUses,
      fast_consumption_count: lifetimes.filter((days) => days <= 4).length,
      waste_count: timeline.expired,
      staple_likelihood: stapleLikelihood,
    });
  }

  return signals;
}

/**
 * Adjust an estimated shelf life using what this household has actually done.
 *
 * Only applies once there is real evidence — two or more observed lifetimes —
 * and never stretches an estimate beyond the category default, because being
 * optimistic about freshness is the unsafe direction.
 */
export function adjustShelfLife(
  baseDays: number,
  signal: ProductSignal | undefined,
): { days: number; reason: string | null } {
  if (!signal || signal.avg_days_to_out === null || signal.purchases < 2) {
    return { days: baseDays, reason: null };
  }

  if (signal.avg_days_to_out < baseDays * 0.6) {
    const adjusted = Math.max(1, Math.round(signal.avg_days_to_out));
    return {
      days: adjusted,
      reason: `This household usually finishes it in about ${adjusted} days`,
    };
  }

  return { days: baseDays, reason: null };
}
