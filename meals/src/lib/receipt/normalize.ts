import type { ConfidenceBand, StorageLocation } from "@/lib/types";
import type { ParsedReceipt, ParsedReceiptItem } from "@/lib/receipt/schema";
import { canonicalName } from "@/lib/kitchen/match";

/**
 * Deterministic post-processing applied to every parse, model-produced or not.
 * It is a safety net, not a second parser: it may only *demote* a line's
 * classification (food → non-food/pet) and never promote one, so a model
 * mistake can leave an item out of meal planning but never sneak sanitizer in.
 */

/** Charges and register lines that are not products. */
const NON_ITEM_PATTERNS = [
  /^bag fee/i,
  /^bag charge/i,
  /^subtotal/i,
  /^total/i,
  /^tax\b/i,
  /^change/i,
  /^cash\b/i,
  /^credit\b/i,
  /^debit\b/i,
  /^balance/i,
  /^tender/i,
  /^items?\s+sold/i,
];

const NON_FOOD_KEYWORDS = [
  "sanitizer", "detergent", "dish soap", "hand soap", "shampoo", "conditioner",
  "toothpaste", "toothbrush", "deodorant", "lotion", "sunscreen", "paper towel",
  "toilet paper", "napkin", "trash bag", "foil", "parchment", "sponge", "cleaner",
  "bleach", "candle", "flower", "bouquet", "razor", "wipes", "battery",
];

const PET_KEYWORDS = ["dog food", "cat food", "dog treat", "cat treat", "pet food", "kibble", "catnip"];

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

/** Lines the user should look at before anything enters the kitchen. */
export function needsReview(item: ParsedReceiptItem): boolean {
  if (item.classification === "uncertain") return true;
  if (item.uncertain_reason) return true;
  return confidenceBand(item.confidence) !== "high";
}

const STORAGE_BY_CATEGORY: Record<string, StorageLocation> = {
  produce: "Produce",
  dairy: "Fridge",
  frozen: "Freezer",
  meat: "Fridge",
  bakery: "Pantry",
  pantry: "Pantry",
  beverages: "Pantry",
  snacks: "Pantry",
  household: "Pantry",
  pet: "Pantry",
};

/** Shelf-life estimates in days. Coarse on purpose — these drive "use soon", not a promise. */
const SHELF_LIFE_DAYS: Record<StorageLocation, number> = {
  Produce: 7,
  Fridge: 10,
  Freezer: 120,
  Pantry: 180,
};

const SHELF_LIFE_BY_NAME: Record<string, number> = {
  spinach: 5,
  cilantro: 5,
  blueberry: 7,
  tangerine: 12,
  pear: 7,
  cucumber: 8,
  tomato: 7,
  yogurt: 14,
  "oat milk": 10,
  pineapple: 5,
  "yellow squash": 8,
  "spaghetti squash": 25,
  "butternut squash": 25,
  onion: 30,
  egg: 21,
  paneer: 14,
  feta: 21,
  cheddar: 30,
  provolone: 21,
  "colby jack": 30,
  marinara: 365,
  rice: 365,
  chickpea: 365,
  "black bean": 365,
};

export function estimateShelfLifeDays(name: string, storage: StorageLocation): number {
  const canonical = canonicalName(name);
  const byName = SHELF_LIFE_BY_NAME[canonical];
  if (byName !== undefined) return storage === "Freezer" ? Math.max(byName, 90) : byName;
  return SHELF_LIFE_DAYS[storage];
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length <= 2 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function looksLikeNonItem(raw: string): boolean {
  return NON_ITEM_PATTERNS.some((pattern) => pattern.test(raw.trim()));
}

function keywordClassification(item: ParsedReceiptItem): ParsedReceiptItem["classification"] | null {
  const haystack = `${item.raw_name} ${item.normalized_name}`.toLowerCase();
  if (PET_KEYWORDS.some((k) => haystack.includes(k))) return "pet_food";
  if (NON_FOOD_KEYWORDS.some((k) => haystack.includes(k))) return "non_food";
  return null;
}

export function normalizeItem(item: ParsedReceiptItem): ParsedReceiptItem {
  const demoted = keywordClassification(item);
  const classification =
    demoted && item.classification === "human_food" ? demoted : item.classification;

  const categoryKey = item.category.toLowerCase();
  const storage =
    item.storage_location ?? STORAGE_BY_CATEGORY[categoryKey] ?? ("Pantry" as StorageLocation);

  return {
    ...item,
    // raw_name is never touched: it is the audit trail back to the paper.
    raw_name: item.raw_name,
    normalized_name: titleCase(item.normalized_name),
    quantity: item.quantity > 0 ? item.quantity : 1,
    storage_location: storage,
    classification,
    confidence: Math.min(1, Math.max(0, Math.round(item.confidence * 100) / 100)),
    uncertain_reason:
      demoted && item.classification === "human_food"
        ? "Reclassified as not for human consumption."
        : item.uncertain_reason,
  };
}

export function postProcess(parsed: ParsedReceipt): ParsedReceipt {
  const items = parsed.items
    .filter((item) => !looksLikeNonItem(item.raw_name))
    .map(normalizeItem);
  return { ...parsed, items };
}

export interface ReviewBuckets {
  ready: ParsedReceiptItem[];
  review: ParsedReceiptItem[];
  excluded: ParsedReceiptItem[];
}

/**
 * Split a parse for the review screen. Only human food is a candidate for the
 * kitchen; non-food and pet food stay attached to the receipt for history.
 */
export function bucketItems(items: ParsedReceiptItem[]): ReviewBuckets {
  const ready: ParsedReceiptItem[] = [];
  const review: ParsedReceiptItem[] = [];
  const excluded: ParsedReceiptItem[] = [];

  for (const item of items) {
    if (item.classification === "non_food" || item.classification === "pet_food") {
      excluded.push(item);
    } else if (needsReview(item)) {
      review.push(item);
    } else {
      ready.push(item);
    }
  }
  return { ready, review, excluded };
}

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
  /** Null for an empty parse — a mean of zero would read as "no confidence". */
  mean: number | null;
}

/**
 * How confident the parse was, in aggregate.
 *
 * Item counts alone can't tell a clean receipt from a marginal one: thirty
 * items at 0.62 and thirty at 0.98 both look like "30 items found". Banding
 * plus the mean makes a degrading model or a run of bad photos visible in
 * telemetry before the household starts noticing wrong food in the kitchen.
 */
export function confidenceDistribution(
  items: Pick<ParsedReceiptItem, "confidence">[],
): ConfidenceDistribution {
  const distribution: ConfidenceDistribution = { high: 0, medium: 0, low: 0, mean: null };
  if (items.length === 0) return distribution;

  let sum = 0;
  for (const item of items) {
    sum += item.confidence;
    distribution[confidenceBand(item.confidence)] += 1;
  }
  distribution.mean = Math.round((sum / items.length) * 1000) / 1000;
  return distribution;
}

/**
 * Merge repeated purchases of the same product into one inventory line.
 * Two "YELLOW SQUASH EA" lines are one squash entry with quantity 2 — but the
 * receipt itself keeps both rows so the paper still reconciles.
 *
 * The merge key requires the display names to be identical as well as
 * canonically equal. Canonical equality alone is too loose for this: a tomato
 * feta soup and a creamy tomato basil soup share a canonical name but are two
 * different things in the fridge, and silently collapsing them loses food.
 */
export function mergeForInventory<T extends { normalized_name: string; quantity: number }>(
  items: T[],
): (T & { quantity: number })[] {
  const byKey = new Map<string, T & { quantity: number }>();
  for (const item of items) {
    const key = `${canonicalName(item.normalized_name)}|${item.normalized_name.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += item.quantity;
    else byKey.set(key, { ...item });
  }
  return [...byKey.values()];
}
