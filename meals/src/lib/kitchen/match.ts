import type { InventoryItem, Recipe, RecipeIngredient } from "@/lib/types";
import { daysToExpiry } from "@/lib/date";

/**
 * Ingredient ⇄ inventory matching.
 *
 * Deliberately conservative: a wrong match is worse than a miss, because a
 * wrong match makes the app claim you have something you do not. Matching is
 * canonical-name equality first, then strict token containment — never fuzzy
 * edit distance, which happily confuses "spaghetti squash" with "yellow squash".
 */

const STOPWORDS = new Set([
  "organic", "fresh", "raw", "whole", "large", "small", "medium", "free", "range",
  "natural", "tj", "tjs", "trader", "joes", "joe", "the", "of", "and", "with",
  "sliced", "chopped", "ground", "pack", "bag", "box", "ct", "oz", "lb", "cup", "cups",
]);

/** Ingredients everyone has; never reported as missing. */
const ASSUMED_STAPLES = new Set([
  "salt", "pepper", "black pepper", "water", "oil", "cooking oil", "lemon", "lime",
  "butter", "sugar", "flour", "oregano", "chilli", "chili powder", "dill", "mustard", "stock",
]);

/**
 * Canonical groups. The key is the canonical name; every listed variant maps to
 * it. Items not listed fall back to their own stemmed token string.
 */
const ALIAS_GROUPS: Record<string, string[]> = {
  onion: ["onion", "yellow onion", "red onion", "white onion", "sweet onion", "spanish onion"],
  tomato: ["tomato", "cherry tomato", "grape tomato", "roma tomato", "vine tomato"],
  spinach: ["spinach", "baby spinach", "leaf spinach"],
  yogurt: ["yogurt", "greek yogurt", "plain yogurt", "vanilla yogurt", "whole milk yogurt"],
  rice: ["rice", "basmati rice", "jasmine rice", "brown rice", "white rice"],
  tortilla: ["tortilla", "corn tortilla", "flour tortilla"],
  marinara: [
    "marinara", "tomato basil marinara", "pasta sauce", "tomato sauce",
    "creamy tomato basil", "creamy tomato basil sauce", "crushed tomato",
  ],
  cucumber: ["cucumber", "persian cucumber", "english cucumber", "mini cucumber"],
  chickpea: ["chickpea", "garbanzo", "garbanzo bean"],
  "black bean": ["black bean"],
  "kidney bean": ["kidney bean", "red kidney bean", "rajma"],
  lentil: ["lentil", "red lentil", "green lentil", "brown lentil"],
  feta: ["feta", "feta cheese", "crumbled feta"],
  paneer: ["paneer", "paneer cheese", "indian cheese"],
  "colby jack": ["colby jack", "colby jack cheese", "colby"],
  provolone: ["provolone", "provolone cheese"],
  cheddar: ["cheddar", "cheddar cheese", "english cheddar", "sharp cheddar"],
  mozzarella: ["mozzarella", "mozzarella cheese"],
  chicken: ["chicken", "chicken breast", "chicken thigh", "chicken tender", "chicken sausage"],
  egg: ["egg", "eggs"],
  "olive oil": ["olive oil", "extra virgin olive oil", "evoo"],
  olive: ["olive", "kalamata olive", "green olive", "pitted olive"],
  "butternut squash": ["butternut squash"],
  "spaghetti squash": ["spaghetti squash"],
  "yellow squash": ["yellow squash", "summer squash"],
  cilantro: ["cilantro", "coriander leaf", "fresh coriander"],
  garlic: ["garlic", "garlic clove", "minced garlic"],
  cumin: ["cumin", "cumin seed", "ground cumin"],
  "garam masala": ["garam masala"],
  "english muffin": ["english muffin", "muffin"],
  pineapple: ["pineapple"],
  blueberry: ["blueberry", "blueberries"],
  pear: ["pear"],
  tangerine: ["tangerine", "clementine", "mandarin"],
  "oat milk": ["oat milk", "oat beverage", "oatmilk"],
  "ice cream": ["ice cream", "vanilla ice cream"],
  "tea concentrate": ["tea concentrate", "black tea concentrate"],
  "mac and cheese": ["mac and cheese", "mac cheese", "macaroni and cheese"],
};

/**
 * Leading words that describe a product rather than name it. Only these may be
 * stripped when looking for a canonical match, so "Organic Red Onions" reduces
 * to onion while "English Cheddar with Caramelized Onion" does not.
 */
const QUALIFIERS = new Set([
  "red", "yellow", "white", "green", "sweet", "black", "brown", "plain", "pitted",
  "crumbled", "shredded", "grated", "diced", "cut", "mini", "jumbo", "extra",
  "english", "greek", "persian", "italian", "bosc", "kalamata", "roma", "cherry",
  "grape", "vanilla", "unsweetened", "lowfat", "nonfat", "reduced", "lite", "light",
  "boneless", "skinless", "canned", "frozen", "dried", "ripe", "seedless",
]);

const VARIANT_TO_CANONICAL = new Map<string, string>();
for (const [canonical, variants] of Object.entries(ALIAS_GROUPS)) {
  for (const variant of variants) VARIANT_TO_CANONICAL.set(stem(variant), canonical);
  VARIANT_TO_CANONICAL.set(stem(canonical), canonical);
}

function singularize(token: string): string {
  if (token.length > 3 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("ses")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/**
 * In product names everything after "with" is an inclusion, not the product:
 * "English Cheddar with Caramelized Onion" is a cheddar, not an onion.
 */
function headPhrase(name: string): string {
  return name.split(/\s+with\s+/i)[0];
}

export function tokenize(name: string): string[] {
  return headPhrase(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
    .filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function stem(name: string): string {
  return tokenize(name).join(" ");
}

/** Reduce a display name to the key used for matching. */
export function canonicalName(name: string): string {
  const stemmed = stem(name);
  if (!stemmed) return name.toLowerCase().trim();
  const direct = VARIANT_TO_CANONICAL.get(stemmed);
  if (direct) return direct;

  // Strip leading qualifiers one at a time: "organic red onion" → "red onion" →
  // "onion". Stops at the first word that is not a qualifier, so a product's own
  // name is never discarded in search of a match.
  const parts = stemmed.split(" ");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!QUALIFIERS.has(parts[i])) break;
    const tail = parts.slice(i + 1).join(" ");
    const found = VARIANT_TO_CANONICAL.get(tail);
    if (found) return found;
  }
  return stemmed;
}

export function isStaple(name: string): boolean {
  return ASSUMED_STAPLES.has(stem(name)) || ASSUMED_STAPLES.has(name.toLowerCase().trim());
}

export function isAvailable(item: InventoryItem): boolean {
  return item.status !== "out";
}

/** Find the inventory item that satisfies an ingredient, or null. */
export function findInventoryMatch(
  ingredientName: string,
  inventory: InventoryItem[],
): InventoryItem | null {
  const wanted = canonicalName(ingredientName);
  const available = inventory.filter(isAvailable);

  const exact = available.find((item) => canonicalName(item.normalized_name) === wanted);
  if (exact) return exact;

  // Token containment as a backstop, but only when both names share a head noun.
  // Without that check "Butternut Squash" would happily match a box of
  // "Butternut Squash Mac & Cheese".
  const wantedList = tokenize(ingredientName);
  const wantedTokens = new Set(wantedList);
  if (wantedTokens.size === 0) return null;
  const wantedHead = wantedList[wantedList.length - 1];

  const contained = available.find((item) => {
    const itemList = tokenize(item.normalized_name);
    if (itemList.length === 0) return false;
    if (itemList[itemList.length - 1] !== wantedHead) return false;

    const itemTokens = new Set(itemList);
    const wantedInItem = [...wantedTokens].every((t) => itemTokens.has(t));
    const itemInWanted = [...itemTokens].every((t) => wantedTokens.has(t));
    return wantedInItem || itemInWanted;
  });
  return contained ?? null;
}

export interface IngredientAvailability {
  ingredient: RecipeIngredient;
  matched: InventoryItem | null;
  staple: boolean;
  /** Days until the matched item expires, when known. */
  days_to_expiry: number | null;
}

export interface RecipeAvailability {
  /** 0–1. Optional ingredients count half as much as required ones. */
  ratio: number;
  have: IngredientAvailability[];
  missing: IngredientAvailability[];
  /** Names of matched items expiring within the use-soon window. */
  uses_soon: string[];
  /** True when a required ingredient is missing entirely. */
  blocked: boolean;
}

export const USE_SOON_DAYS = 4;

export function assessRecipe(
  recipe: Recipe,
  inventory: InventoryItem[],
  today?: string,
): RecipeAvailability {
  const have: IngredientAvailability[] = [];
  const missing: IngredientAvailability[] = [];
  const usesSoon: string[] = [];
  let weightTotal = 0;
  let weightHave = 0;

  for (const ingredient of recipe.ingredients) {
    const staple = isStaple(ingredient.ingredient_name);
    const matched = staple ? null : findInventoryMatch(ingredient.ingredient_name, inventory);
    const expiry = matched ? daysToExpiry(matched.estimated_expiry, today) : null;
    const entry: IngredientAvailability = {
      ingredient,
      matched,
      staple,
      days_to_expiry: expiry,
    };

    if (staple) {
      have.push(entry);
      continue;
    }

    const weight = ingredient.optional ? 0.5 : 1;
    weightTotal += weight;

    if (matched) {
      weightHave += weight;
      have.push(entry);
      if (expiry !== null && expiry <= USE_SOON_DAYS) usesSoon.push(matched.normalized_name);
    } else {
      missing.push(entry);
    }
  }

  return {
    ratio: weightTotal === 0 ? 1 : weightHave / weightTotal,
    have,
    missing,
    uses_soon: usesSoon,
    blocked: missing.some((m) => !m.ingredient.optional),
  };
}

/** Items worth surfacing on Today under "Use soon". */
export function useSoonItems(inventory: InventoryItem[], today?: string): InventoryItem[] {
  return inventory
    .filter(isAvailable)
    .map((item) => ({ item, days: daysToExpiry(item.estimated_expiry, today) }))
    .filter((x): x is { item: InventoryItem; days: number } => x.days !== null && x.days <= USE_SOON_DAYS)
    .sort((a, b) => a.days - b.days)
    .map((x) => x.item);
}
