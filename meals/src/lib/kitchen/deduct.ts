import type { InventoryEvent, InventoryItem, InventoryStatus, RecipeIngredient } from "@/lib/types";
import { canonicalName, findInventoryMatch } from "@/lib/kitchen/match";

/**
 * Approximate inventory deduction.
 *
 * The app does not pretend to know grams remaining. It tracks four states and
 * steps down only when a meal plausibly used a meaningful share of a package.
 * How many uses it takes to step down depends on how much the recipe calls for
 * and how bulky the product is, and every decision is written to the event log.
 */

const STATUS_ORDER: InventoryStatus[] = ["full", "some", "low", "out"];

export function stepDown(status: InventoryStatus): InventoryStatus {
  const index = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[Math.min(index + 1, STATUS_ORDER.length - 1)];
}

/** Products bought in bulk that survive many meals. */
const BULK_CANONICALS = new Set([
  "rice", "olive oil", "cumin", "garam masala", "garlic", "lentil", "onion",
  "flour", "sugar", "tea concentrate",
]);

/** Units that signal a token amount rather than a real dent in the package. */
const MINOR_UNITS = new Set(["tsp", "teaspoon", "tbsp", "tablespoon", "pinch", "clove", "cloves", "sprig"]);

/**
 * How many times this ingredient must be cooked before the item's status drops
 * one level. 1 means a single meal uses it up meaningfully.
 */
export function usesPerStep(ingredient: RecipeIngredient, item: InventoryItem): number {
  const canonical = canonicalName(item.normalized_name);
  const unit = (ingredient.unit ?? "").toLowerCase();

  if (MINOR_UNITS.has(unit)) return 6;
  if (BULK_CANONICALS.has(canonical)) return 4;
  if (item.category === "Spices") return 8;

  const quantity = ingredient.quantity ?? 1;
  if (unit === "cup" || unit === "cups") return quantity >= 1 ? 1 : 3;
  if (unit === "oz") return quantity >= 6 ? 1 : 3;
  if (unit === "can" || unit === "cans") return 1;

  return quantity >= 2 ? 1 : 2;
}

/** Uses recorded against an item since the last time its status actually moved. */
export function usesSinceLastStep(events: InventoryEvent[], itemId: string): number {
  let count = 0;
  for (const event of events) {
    if (event.inventory_item_id !== itemId) continue;
    if (event.from_status !== event.to_status) break; // events are newest-first
    if (event.event_type === "meal_consumed") count += 1;
  }
  return count;
}

export interface DeductionDecision {
  item: InventoryItem;
  ingredient: RecipeIngredient;
  from_status: InventoryStatus;
  to_status: InventoryStatus;
  stepped: boolean;
  detail: string;
}

/**
 * Work out what a cooked meal does to the kitchen. Pure: returns decisions for
 * the caller to persist, so the same logic is testable without a database.
 */
export function planDeductions(
  ingredients: RecipeIngredient[],
  inventory: InventoryItem[],
  events: InventoryEvent[],
  servingsMultiplier = 1,
): DeductionDecision[] {
  const decisions: DeductionDecision[] = [];
  const claimed = new Set<string>();

  for (const ingredient of ingredients) {
    const item = findInventoryMatch(ingredient.ingredient_name, inventory);
    if (!item || claimed.has(item.id)) continue;
    claimed.add(item.id);

    // A low-confidence item is probably not what the recipe meant. Leave it alone.
    if (item.confidence < 0.6) {
      decisions.push({
        item,
        ingredient,
        from_status: item.status,
        to_status: item.status,
        stepped: false,
        detail: "Match confidence too low to deduct",
      });
      continue;
    }

    const threshold = Math.max(1, Math.round(usesPerStep(ingredient, item) / Math.max(servingsMultiplier, 1)));
    const priorUses = usesSinceLastStep(events, item.id);
    const stepped = priorUses + 1 >= threshold;
    const to = stepped ? stepDown(item.status) : item.status;

    decisions.push({
      item,
      ingredient,
      from_status: item.status,
      to_status: to,
      stepped,
      detail: stepped
        ? `Used in a meal (${priorUses + 1}/${threshold} uses since last change)`
        : `Used in a meal (${priorUses + 1}/${threshold} uses, not enough to change status)`,
    });
  }

  return decisions;
}
