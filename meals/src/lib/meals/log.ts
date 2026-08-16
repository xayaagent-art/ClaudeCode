import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { planDeductions } from "@/lib/kitchen/deduct";
import { portionsFor } from "@/lib/nutrition/engine";
import type { MealLog, MealType } from "@/lib/types";

export interface LogMealInput {
  recipe_id: string;
  meal_type?: MealType;
  /** Optional per-member overrides; defaults to the recommended portions. */
  servings_by_member?: Record<string, number>;
  consumed_at?: string;
}

export interface LogMealResult {
  batch_id: string;
  logs: MealLog[];
  inventory_changes: { name: string; from: string; to: string; changed: boolean }[];
}

/** "Ate this": one action writes history, nutrition and the kitchen. */
export async function logMeal(input: LogMealInput): Promise<LogMealResult> {
  const db = getDb();
  const mealType = input.meal_type ?? "dinner";
  const recipe = await db.getRecipe(input.recipe_id);
  if (!recipe) throw new Error(`Unknown recipe ${input.recipe_id}`);

  const members = await db.listMembers();
  const defaults = portionsFor(recipe, members, mealType);
  const batchId = randomUUID();
  const consumedAt = input.consumed_at ?? new Date().toISOString();

  const logs = defaults.map((portion) => {
    const override = input.servings_by_member?.[portion.member_id];
    const servings = override ?? portion.servings;
    return {
      member_id: portion.member_id,
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      meal_type: mealType,
      servings,
      calories: Math.round(recipe.calories_per_serving * servings),
      protein: Math.round(recipe.protein_per_serving * servings),
      consumed_at: consumedAt,
      batch_id: batchId,
    };
  });

  const written = await db.logMeals(logs);

  const [inventory, events] = await Promise.all([db.listInventory(), db.listInventoryEvents(200)]);
  const totalServings = logs.reduce((acc, l) => acc + l.servings, 0);
  const decisions = planDeductions(
    recipe.ingredients,
    inventory,
    events,
    Math.max(1, totalServings / Math.max(recipe.servings, 1)),
  );

  const changes: LogMealResult["inventory_changes"] = [];
  for (const decision of decisions) {
    if (decision.stepped) {
      await db.updateInventoryItem(decision.item.id, { status: decision.to_status });
    }
    await db.addInventoryEvent({
      inventory_item_id: decision.item.id,
      event_type: "meal_consumed",
      from_status: decision.from_status,
      to_status: decision.to_status,
      detail: `${recipe.title}: ${decision.detail}`,
    });
    changes.push({
      name: decision.item.normalized_name,
      from: decision.from_status,
      to: decision.to_status,
      changed: decision.stepped,
    });
  }

  return { batch_id: batchId, logs: written, inventory_changes: changes };
}

/**
 * Undo. Nutrition and history are removed outright; inventory is stepped back
 * only where this meal actually moved it, using the event log as the record.
 */
export async function undoMeal(batchId: string): Promise<{ removed: number }> {
  const db = getDb();
  const removed = await db.deleteMealBatch(batchId);
  if (removed.length === 0) return { removed: 0 };

  const title = removed[0].recipe_title;
  const events = await db.listInventoryEvents(200);
  const consumedAt = removed[0].consumed_at;

  const toRevert = events.filter(
    (event) =>
      event.event_type === "meal_consumed" &&
      event.detail?.startsWith(`${title}:`) &&
      event.from_status !== event.to_status &&
      Math.abs(Date.parse(event.created_at) - Date.parse(consumedAt)) < 60 * 60 * 1000,
  );

  for (const event of toRevert) {
    if (!event.from_status) continue;
    await db.updateInventoryItem(event.inventory_item_id, { status: event.from_status });
    await db.addInventoryEvent({
      inventory_item_id: event.inventory_item_id,
      event_type: "undo_meal",
      from_status: event.to_status,
      to_status: event.from_status,
      detail: `Undo of ${title}`,
    });
  }

  return { removed: removed.length };
}
