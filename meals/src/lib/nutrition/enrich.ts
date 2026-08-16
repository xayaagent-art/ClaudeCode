import "server-only";
import { getDb } from "@/lib/db";
import { resolveNutrition } from "@/lib/nutrition/sources";

/**
 * Stage 2 of receipt import. Runs after inventory already exists, so a slow
 * nutrition lookup can never hold up getting food into the kitchen.
 */
export async function enrichInventory(options: {
  receiptId?: string;
  itemIds?: string[];
  limit?: number;
}): Promise<{ enriched: number; unmatched: number }> {
  const db = getDb();
  const inventory = await db.listInventory();

  const targets = inventory
    .filter((item) => {
      if (item.nutrition_source) return false; // already resolved
      if (options.itemIds) return options.itemIds.includes(item.id);
      if (options.receiptId) return item.receipt_id === options.receiptId;
      return true;
    })
    .slice(0, options.limit ?? 60);

  let enriched = 0;
  let unmatched = 0;

  for (const item of targets) {
    const match = await resolveNutrition(item.normalized_name);
    await db.updateInventoryItem(item.id, {
      nutrition_food_id: match.food_id,
      nutrition_source: match.source,
      nutrition_confidence: match.confidence,
      calories_per_100g: match.source === "unmatched" ? null : match.calories_per_100g,
      protein_per_100g: match.source === "unmatched" ? null : match.protein_per_100g,
      serving_size: match.serving_size,
    });
    if (match.source === "unmatched") unmatched += 1;
    else enriched += 1;
  }

  return { enriched, unmatched };
}
