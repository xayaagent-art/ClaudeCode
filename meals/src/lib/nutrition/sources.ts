import { canonicalName } from "@/lib/kitchen/match";
import type { ConfidenceBand, NutritionSource } from "@/lib/types";

export interface NutritionMatch {
  food_id: string | null;
  description: string;
  calories_per_100g: number;
  protein_per_100g: number;
  /**
   * Carbohydrate and fat, per 100 g, when the source carries them.
   *
   * Null rather than zero when the source does not: a macro breakdown that
   * silently reports 0 g of fat for an unmatched ingredient is worse than one
   * that admits it does not know, because the zero survives every later sum
   * and nothing downstream can tell it apart from a genuine measurement.
   */
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  serving_size: string | null;
  source: NutritionSource;
  confidence: ConfidenceBand;
}

/**
 * Built-in generic reference values, per 100 g as purchased.
 *
 * These are a floor, not a substitute for a real database match: anything
 * resolved here is labelled "generic estimate" in the UI. USDA FoodData Central
 * is tried first whenever FDC_API_KEY is configured.
 */
const GENERIC_TABLE: Record<
  string,
  { kcal: number; protein: number; carbs: number; fat: number; serving?: string }
> = {
  spinach: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, serving: "3 oz" },
  paneer: { kcal: 296, protein: 18.3, carbs: 6.1, fat: 22.1, serving: "3.5 oz" },
  yogurt: { kcal: 97, protein: 9, carbs: 3.9, fat: 5.0, serving: "3/4 cup" },
  onion: { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
  garlic: { kcal: 149, protein: 6.4, carbs: 33.1, fat: 0.5 },
  rice: { kcal: 356, protein: 7.5, carbs: 80.0, fat: 0.7, serving: "1/4 cup dry" },
  chickpea: { kcal: 139, protein: 7.4, carbs: 22.5, fat: 2.6, serving: "1/2 cup" },
  egg: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, serving: "1 large" },
  feta: { kcal: 264, protein: 14.2, carbs: 4.1, fat: 21.3, serving: "1 oz" },
  cucumber: { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
  tomato: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  "olive oil": { kcal: 884, protein: 0, carbs: 0.0, fat: 100.0 },
  olive: { kcal: 145, protein: 1, carbs: 3.8, fat: 15.3 },
  cumin: { kcal: 375, protein: 17.8, carbs: 44.2, fat: 22.3 },
  "garam masala": { kcal: 379, protein: 14, carbs: 45.0, fat: 15.0 },
  "black bean": { kcal: 132, protein: 8.9, carbs: 23.7, fat: 0.5, serving: "1/2 cup" },
  "kidney bean": { kcal: 127, protein: 8.7, carbs: 22.8, fat: 0.5, serving: "1/2 cup" },
  lentil: { kcal: 116, protein: 9, carbs: 20.1, fat: 0.4, serving: "1/2 cup" },
  tortilla: { kcal: 218, protein: 5.7, carbs: 36.3, fat: 5.4, serving: "1 tortilla" },
  marinara: { kcal: 61, protein: 1.6, carbs: 8.6, fat: 2.1, serving: "1/2 cup" },
  cheddar: { kcal: 403, protein: 24.9, carbs: 1.3, fat: 33.1, serving: "1 oz" },
  provolone: { kcal: 351, protein: 25.6, carbs: 2.1, fat: 26.6, serving: "1 oz" },
  "colby jack": { kcal: 394, protein: 23.8, carbs: 2.6, fat: 32.0, serving: "1 oz" },
  mozzarella: { kcal: 300, protein: 22.2, carbs: 2.2, fat: 22.4, serving: "1 oz" },
  chicken: { kcal: 165, protein: 31, carbs: 0.0, fat: 3.6, serving: "4 oz" },
  "oat milk": { kcal: 48, protein: 1.3, carbs: 7.5, fat: 1.5, serving: "1 cup" },
  "ice cream": { kcal: 207, protein: 3.5, carbs: 23.6, fat: 11.0, serving: "1/2 cup" },
  blueberry: { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3, serving: "1 cup" },
  pear: { kcal: 57, protein: 0.4, carbs: 15.2, fat: 0.1, serving: "1 pear" },
  tangerine: { kcal: 53, protein: 0.8, carbs: 13.3, fat: 0.3, serving: "1 tangerine" },
  pineapple: { kcal: 50, protein: 0.5, carbs: 13.1, fat: 0.1, serving: "1 cup" },
  "butternut squash": { kcal: 45, protein: 1, carbs: 11.7, fat: 0.1 },
  "spaghetti squash": { kcal: 31, protein: 0.6, carbs: 6.9, fat: 0.6 },
  "yellow squash": { kcal: 16, protein: 1.2, carbs: 3.4, fat: 0.2 },
  "english muffin": { kcal: 227, protein: 8.9, carbs: 44.5, fat: 1.7, serving: "1 muffin" },
  soup: { kcal: 62, protein: 2.3, carbs: 8.0, fat: 1.8, serving: "1 cup" },
  "mac and cheese": { kcal: 180, protein: 7, carbs: 22.0, fat: 7.0, serving: "1 cup" },
  burrito: { kcal: 206, protein: 8.5, carbs: 27.0, fat: 6.7, serving: "1 burrito" },
  "tea concentrate": { kcal: 2, protein: 0, carbs: 0.5, fat: 0.0, serving: "1 cup" },
  cilantro: { kcal: 23, protein: 2.1, carbs: 3.7, fat: 0.5 },
};

export function builtinGenericMatch(name: string): NutritionMatch | null {
  const canonical = canonicalName(name);
  const entry = GENERIC_TABLE[canonical];
  if (!entry) return null;
  return {
    food_id: `builtin:${canonical}`,
    description: `${canonical} (generic)`,
    calories_per_100g: entry.kcal,
    protein_per_100g: entry.protein,
    carbs_per_100g: entry.carbs,
    fat_per_100g: entry.fat,
    serving_size: entry.serving ?? null,
    source: "builtin_generic",
    confidence: "medium",
  };
}

interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrientNumber?: string; nutrientName?: string; value?: number }[];
}

function nutrientValue(food: FdcFood, numbers: string[], names: string[]): number | null {
  for (const nutrient of food.foodNutrients ?? []) {
    if (nutrient.value === undefined) continue;
    if (nutrient.nutrientNumber && numbers.includes(nutrient.nutrientNumber)) return nutrient.value;
    if (nutrient.nutrientName && names.some((n) => nutrient.nutrientName?.startsWith(n))) {
      return nutrient.value;
    }
  }
  return null;
}

/**
 * USDA FoodData Central lookup. Branded results are preferred because receipt
 * lines are branded products; generic (Foundation/SR Legacy) is the fallback.
 */
export async function usdaMatch(name: string, signal?: AbortSignal): Promise<NutritionMatch | null> {
  const apiKey = process.env.FDC_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", name);
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("dataType", "Branded,Foundation,SR Legacy");

  const response = await fetch(url, { signal });
  if (!response.ok) return null;

  const body = (await response.json()) as { foods?: FdcFood[] };
  const foods = body.foods ?? [];
  if (foods.length === 0) return null;

  const branded = foods.find((f) => f.dataType === "Branded");
  const food = branded ?? foods[0];

  const kcal = nutrientValue(food, ["208", "1008"], ["Energy"]);
  const protein = nutrientValue(food, ["203", "1003"], ["Protein"]);
  if (kcal === null || protein === null) return null;

  // Carbohydrate and fat are optional: a branded record can carry energy and
  // protein without them, and that is a match worth keeping for everything
  // that only needs those two.
  const carbs = nutrientValue(food, ["205", "1005"], ["Carbohydrate"]);
  const fat = nutrientValue(food, ["204", "1004"], ["Total lipid", "Total Fat"]);

  const isBranded = food.dataType === "Branded";
  return {
    food_id: `fdc:${food.fdcId}`,
    description: food.description,
    calories_per_100g: kcal,
    protein_per_100g: protein,
    carbs_per_100g: carbs,
    fat_per_100g: fat,
    serving_size:
      food.householdServingFullText ??
      (food.servingSize ? `${food.servingSize} ${food.servingSizeUnit ?? ""}`.trim() : null),
    source: isBranded ? "usda_branded" : "usda_generic",
    // A branded hit on a search string is a good match, not a certain one.
    confidence: isBranded ? "high" : "medium",
  };
}

export const UNMATCHED: NutritionMatch = {
  food_id: null,
  description: "No nutrition match",
  calories_per_100g: 0,
  protein_per_100g: 0,
  carbs_per_100g: null,
  fat_per_100g: null,
  serving_size: null,
  source: "unmatched",
  confidence: "low",
};

/** Full hierarchy: USDA branded → USDA generic → built-in generic → unmatched. */
export async function resolveNutrition(name: string): Promise<NutritionMatch> {
  try {
    const usda = await usdaMatch(name);
    if (usda) return usda;
  } catch {
    // Network or quota problem — fall through to the offline table.
  }
  return builtinGenericMatch(name) ?? UNMATCHED;
}

export function nutritionSourceLabel(source: NutritionSource | null): string {
  switch (source) {
    case "usda_branded":
      return "USDA branded match";
    case "usda_generic":
      return "USDA generic match";
    case "builtin_generic":
      return "Generic estimate";
    case "ai_generic":
      return "AI generic estimate";
    case "known_product":
      return "Known product";
    case "store_product":
      return "Store product data";
    case "unmatched":
      return "No nutrition match";
    default:
      return "Nutrition pending";
  }
}
