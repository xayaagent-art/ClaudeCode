import { canonicalName } from "@/lib/kitchen/match";
import { daysBetween, todayISO } from "@/lib/date";
import type { InventoryItem, StorageLocation } from "@/lib/types";

/**
 * Freshness and expiration intelligence.
 *
 * Everything here is an *estimate*. The app never claims a product expires at a
 * particular hour; it says "likely good for about two more days" and is
 * deliberately conservative — food safety errs toward eating something sooner,
 * never later.
 *
 * Rules are keyed on broad food categories rather than individual products, so
 * an unrecognised item still gets a sensible window.
 */

export type FoodCategory =
  | "leafy_greens"
  | "berries"
  | "soft_produce"
  | "hard_produce"
  | "herbs"
  | "dairy"
  | "fresh_meat"
  | "prepared_chilled"
  | "bakery"
  | "frozen"
  | "canned"
  | "pantry_staple"
  | "spice"
  | "beverage"
  | "unknown";

/** Typical days from purchase to "probably past it", by category. */
const SHELF_LIFE: Record<FoodCategory, number> = {
  leafy_greens: 5,
  berries: 5,
  herbs: 5,
  soft_produce: 7,
  hard_produce: 21,
  dairy: 14,
  fresh_meat: 3,
  prepared_chilled: 5,
  bakery: 7,
  frozen: 120,
  canned: 540,
  pantry_staple: 365,
  spice: 720,
  beverage: 21,
  unknown: 10,
};

/** Canonical product names mapped to their food category. */
const CATEGORY_BY_PRODUCT: Record<string, FoodCategory> = {
  spinach: "leafy_greens",
  lettuce: "leafy_greens",
  kale: "leafy_greens",
  arugula: "leafy_greens",
  blueberry: "berries",
  strawberry: "berries",
  raspberry: "berries",
  cilantro: "herbs",
  parsley: "herbs",
  basil: "herbs",
  dill: "herbs",
  cucumber: "soft_produce",
  tomato: "soft_produce",
  pear: "soft_produce",
  pineapple: "soft_produce",
  "yellow squash": "soft_produce",
  tangerine: "hard_produce",
  onion: "hard_produce",
  garlic: "hard_produce",
  "butternut squash": "hard_produce",
  "spaghetti squash": "hard_produce",
  potato: "hard_produce",
  yogurt: "dairy",
  paneer: "dairy",
  feta: "dairy",
  cheddar: "dairy",
  provolone: "dairy",
  "colby jack": "dairy",
  mozzarella: "dairy",
  egg: "dairy",
  milk: "dairy",
  "oat milk": "dairy",
  chicken: "fresh_meat",
  burrito: "frozen",
  "ice cream": "frozen",
  "mac and cheese": "frozen",
  "english muffin": "bakery",
  tortilla: "bakery",
  bread: "bakery",
  chickpea: "canned",
  "black bean": "canned",
  "kidney bean": "canned",
  marinara: "canned",
  rice: "pantry_staple",
  lentil: "pantry_staple",
  "olive oil": "pantry_staple",
  olive: "pantry_staple",
  cumin: "spice",
  "garam masala": "spice",
  "tea concentrate": "beverage",
};

/** Fallback when the product itself is unknown: use where it is stored. */
const CATEGORY_BY_STORAGE: Record<StorageLocation, FoodCategory> = {
  Produce: "soft_produce",
  Fridge: "dairy",
  Freezer: "frozen",
  Pantry: "pantry_staple",
};

const RECEIPT_CATEGORY_HINTS: Record<string, FoodCategory> = {
  produce: "soft_produce",
  dairy: "dairy",
  frozen: "frozen",
  meat: "fresh_meat",
  bakery: "bakery",
  beverages: "beverage",
  spices: "spice",
  pantry: "pantry_staple",
};

export function foodCategoryFor(
  normalizedName: string,
  storage: StorageLocation,
  receiptCategory?: string,
): FoodCategory {
  const direct = CATEGORY_BY_PRODUCT[canonicalName(normalizedName)];
  if (direct) return direct;

  const hint = receiptCategory ? RECEIPT_CATEGORY_HINTS[receiptCategory.toLowerCase()] : undefined;
  if (hint) return hint;

  return CATEGORY_BY_STORAGE[storage] ?? "unknown";
}

/** Estimated shelf life in days for a product. */
export function shelfLifeDays(
  normalizedName: string,
  storage: StorageLocation,
  receiptCategory?: string,
): number {
  return SHELF_LIFE[foodCategoryFor(normalizedName, storage, receiptCategory)];
}

export type FreshnessState = "fresh" | "use_soon" | "likely_past_best";

export interface Freshness {
  category: FoodCategory;
  state: FreshnessState;
  /** Estimated days of good quality left. Null when the item does not perish. */
  days_left: number | null;
  /** How far through its expected life the item is, 0–1+. */
  age_ratio: number;
  /** Plain-language estimate. Never an exact timestamp. */
  label: string;
}

/** Items with a shelf life this long are treated as non-perishable for UX. */
const NON_PERISHABLE_DAYS = 90;

/**
 * Assess freshness from what we actually know: purchase date, category and any
 * explicit expiry we were given.
 */
export function assessFreshness(item: InventoryItem, today = todayISO()): Freshness {
  const category = foodCategoryFor(item.normalized_name, item.storage_location, item.category);
  const life = SHELF_LIFE[category];

  // An explicit expiry beats any heuristic.
  const explicit = item.estimated_expiry ? daysBetween(today, item.estimated_expiry.slice(0, 10)) : null;
  const age = item.purchase_date ? daysBetween(item.purchase_date.slice(0, 10), today) : 0;
  const daysLeft = explicit ?? life - age;

  if (life >= NON_PERISHABLE_DAYS && explicit === null) {
    return {
      category,
      state: "fresh",
      days_left: null,
      age_ratio: 0,
      label: "Keeps well",
    };
  }

  const ageRatio = life > 0 ? Math.max(0, (life - daysLeft) / life) : 0;

  if (daysLeft < 0) {
    return {
      category,
      state: "likely_past_best",
      days_left: daysLeft,
      age_ratio: ageRatio,
      label: "Probably past its best",
    };
  }
  if (daysLeft <= USE_SOON_WINDOW) {
    return {
      category,
      state: "use_soon",
      days_left: daysLeft,
      age_ratio: ageRatio,
      label:
        daysLeft === 0
          ? "Use today"
          : `Likely good for about ${daysLeft} more day${daysLeft === 1 ? "" : "s"}`,
    };
  }
  return {
    category,
    state: "fresh",
    days_left: daysLeft,
    age_ratio: ageRatio,
    label: `Likely good for about ${daysLeft} more days`,
  };
}

/** How many days ahead counts as "use soon". */
export const USE_SOON_WINDOW = 3;

/**
 * Deterministic 0–1 urgency score used by the recommender and the Kitchen
 * ordering. Higher means "cook this sooner".
 */
export function useSoonScore(item: InventoryItem, today = todayISO()): number {
  if (item.status === "out") return 0;

  const freshness = assessFreshness(item, today);
  if (freshness.days_left === null) return 0;

  // Past-best items score high but are never boosted above a same-day item;
  // the point is to use them or bin them, not to build meals around them.
  if (freshness.state === "likely_past_best") return 0.85;

  const daysLeft = freshness.days_left;
  if (daysLeft > USE_SOON_WINDOW * 2) return 0;

  const urgency = 1 - daysLeft / (USE_SOON_WINDOW * 2);

  // A nearly-empty package matters less: there is less to waste.
  const quantityWeight = item.status === "low" ? 0.75 : 1;
  return Math.round(Math.min(1, urgency * quantityWeight) * 1000) / 1000;
}
