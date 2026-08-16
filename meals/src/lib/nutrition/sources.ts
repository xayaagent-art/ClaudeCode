import { canonicalName } from "@/lib/kitchen/match";
import type { ConfidenceBand, NutritionSource } from "@/lib/types";

export interface NutritionMatch {
  food_id: string | null;
  description: string;
  calories_per_100g: number;
  protein_per_100g: number;
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
const GENERIC_TABLE: Record<string, { kcal: number; protein: number; serving?: string }> = {
  spinach: { kcal: 23, protein: 2.9, serving: "3 oz" },
  paneer: { kcal: 296, protein: 18.3, serving: "3.5 oz" },
  yogurt: { kcal: 97, protein: 9, serving: "3/4 cup" },
  onion: { kcal: 40, protein: 1.1 },
  garlic: { kcal: 149, protein: 6.4 },
  rice: { kcal: 356, protein: 7.5, serving: "1/4 cup dry" },
  chickpea: { kcal: 139, protein: 7.4, serving: "1/2 cup" },
  egg: { kcal: 143, protein: 12.6, serving: "1 large" },
  feta: { kcal: 264, protein: 14.2, serving: "1 oz" },
  cucumber: { kcal: 15, protein: 0.7 },
  tomato: { kcal: 18, protein: 0.9 },
  "olive oil": { kcal: 884, protein: 0 },
  olive: { kcal: 145, protein: 1 },
  cumin: { kcal: 375, protein: 17.8 },
  "garam masala": { kcal: 379, protein: 14 },
  "black bean": { kcal: 132, protein: 8.9, serving: "1/2 cup" },
  "kidney bean": { kcal: 127, protein: 8.7, serving: "1/2 cup" },
  lentil: { kcal: 116, protein: 9, serving: "1/2 cup" },
  tortilla: { kcal: 218, protein: 5.7, serving: "1 tortilla" },
  marinara: { kcal: 61, protein: 1.6, serving: "1/2 cup" },
  cheddar: { kcal: 403, protein: 24.9, serving: "1 oz" },
  provolone: { kcal: 351, protein: 25.6, serving: "1 oz" },
  "colby jack": { kcal: 394, protein: 23.8, serving: "1 oz" },
  mozzarella: { kcal: 300, protein: 22.2, serving: "1 oz" },
  chicken: { kcal: 165, protein: 31, serving: "4 oz" },
  "oat milk": { kcal: 48, protein: 1.3, serving: "1 cup" },
  "ice cream": { kcal: 207, protein: 3.5, serving: "1/2 cup" },
  blueberry: { kcal: 57, protein: 0.7, serving: "1 cup" },
  pear: { kcal: 57, protein: 0.4, serving: "1 pear" },
  tangerine: { kcal: 53, protein: 0.8, serving: "1 tangerine" },
  pineapple: { kcal: 50, protein: 0.5, serving: "1 cup" },
  "butternut squash": { kcal: 45, protein: 1 },
  "spaghetti squash": { kcal: 31, protein: 0.6 },
  "yellow squash": { kcal: 16, protein: 1.2 },
  "english muffin": { kcal: 227, protein: 8.9, serving: "1 muffin" },
  soup: { kcal: 62, protein: 2.3, serving: "1 cup" },
  "mac and cheese": { kcal: 180, protein: 7, serving: "1 cup" },
  burrito: { kcal: 206, protein: 8.5, serving: "1 burrito" },
  "tea concentrate": { kcal: 2, protein: 0, serving: "1 cup" },
  cilantro: { kcal: 23, protein: 2.1 },
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

  const isBranded = food.dataType === "Branded";
  return {
    food_id: `fdc:${food.fdcId}`,
    description: food.description,
    calories_per_100g: kcal,
    protein_per_100g: protein,
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
