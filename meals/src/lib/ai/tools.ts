import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { buildHouseholdContext } from "@/lib/household/context";
import { discoverRecipes } from "@/lib/meals/discover";
import { logMeal } from "@/lib/meals/log";
import { resolveNutrition } from "@/lib/nutrition/sources";
import { assessRecipe } from "@/lib/kitchen/match";
import type { InventoryStatus, Recipe } from "@/lib/types";

/**
 * The internal tool surface.
 *
 * These are the only operations the orchestration layer — and any model-driven
 * call path — is allowed to perform. Each one is narrow, validated, and scoped
 * to the single household. No caller gets arbitrary table access.
 */

const inventoryUpdateSchema = z.object({
  inventory_item_id: z.string().min(1),
  status: z.enum(["full", "some", "low", "out"]).optional(),
  normalized_name: z.string().min(1).optional(),
  storage_location: z.enum(["Fridge", "Pantry", "Freezer", "Produce"]).optional(),
  quantity: z.number().positive().max(99).optional(),
});

const logMealSchema = z.object({
  recipe_id: z.string().min(1),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  servings_by_member: z.record(z.string(), z.number().positive().max(6)).optional(),
});

export const tools = {
  async get_household_profile() {
    const db = getDb();
    const [household, members] = await Promise.all([db.getHousehold(), db.listMembers()]);
    return { household, members };
  },

  async get_inventory() {
    return getDb().listInventory();
  },

  async get_recent_meals(limit = 20) {
    const logs = await getDb().listMealLogs();
    return logs.slice(0, limit);
  },

  async get_meal_feedback() {
    return getDb().listFeedback();
  },

  /** Search the built-in library plus anything previously saved. */
  async search_recipes(query: string, limit = 10): Promise<Recipe[]> {
    const recipes = await getDb().listRecipes();
    const needle = query.trim().toLowerCase();
    if (!needle) return recipes.slice(0, limit);
    return recipes
      .filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(needle) ||
          recipe.cuisine.toLowerCase().includes(needle) ||
          recipe.ingredients.some((i) => i.ingredient_name.toLowerCase().includes(needle)),
      )
      .slice(0, limit);
  },

  /** Model-driven discovery, web search included. Returns normalized recipes. */
  async search_web_for_recipes(count = 2) {
    const { context } = await buildHouseholdContext("dinner", todayISO());
    return discoverRecipes(context, count, []);
  },

  async search_nutrition_database(productName: string) {
    return resolveNutrition(productName);
  },

  async save_recipe(recipe: Recipe) {
    return getDb().upsertRecipe(recipe);
  },

  async update_inventory(input: z.infer<typeof inventoryUpdateSchema>) {
    const parsed = inventoryUpdateSchema.parse(input);
    const db = getDb();
    const before = await db.getInventoryItem(parsed.inventory_item_id);
    if (!before) throw new Error("Unknown inventory item");

    const { inventory_item_id: id, ...patch } = parsed;
    const updated = await db.updateInventoryItem(id, patch);

    if (patch.status && patch.status !== before.status) {
      const eventType =
        patch.status === "out" ? "marked_out" : patch.status === "low" ? "marked_low" : "manual_adjustment";
      await db.addInventoryEvent({
        inventory_item_id: id,
        event_type: eventType,
        from_status: before.status,
        to_status: patch.status as InventoryStatus,
        detail: "Edited in Kitchen",
      });
    }
    return updated;
  },

  async log_meal(input: z.infer<typeof logMealSchema>) {
    return logMeal(logMealSchema.parse(input));
  },

  /** What a given recipe would need from the current kitchen. */
  async check_recipe_availability(recipeId: string) {
    const db = getDb();
    const [recipe, inventory] = await Promise.all([db.getRecipe(recipeId), db.listInventory()]);
    if (!recipe) throw new Error("Unknown recipe");
    return assessRecipe(recipe, inventory);
  },
} as const;

export type ToolName = keyof typeof tools;
