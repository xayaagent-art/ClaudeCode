import { addDays, todayISO } from "@/lib/date";
import type { HouseholdContext, InventoryItem, InventoryStatus, StorageLocation } from "@/lib/types";

export const TODAY = "2026-08-15";

export function inventoryItem(
  name: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id: `inv-${name.toLowerCase().replace(/\s+/g, "-")}`,
    household_id: "household",
    normalized_name: name,
    raw_name: null,
    category: "Other",
    storage_location: "Pantry" as StorageLocation,
    quantity: 1,
    package_size: null,
    status: "full" as InventoryStatus,
    purchase_date: TODAY,
    estimated_expiry: addDays(TODAY, 30),
    nutrition_food_id: null,
    nutrition_source: null,
    nutrition_confidence: null,
    calories_per_100g: null,
    protein_per_100g: null,
    serving_size: null,
    confidence: 1,
    receipt_item_id: null,
    receipt_id: null,
    created_at: `${TODAY}T00:00:00.000Z`,
    updated_at: `${TODAY}T00:00:00.000Z`,
    ...overrides,
  };
}

export function householdContext(overrides: Partial<HouseholdContext> = {}): HouseholdContext {
  return {
    meal_type: "dinner",
    date: TODAY,
    household: {
      id: "household",
      name: "Test Household",
      members: [
        {
          id: "yash",
          name: "Yash",
          calorie_target: 2100,
          protein_target: 150,
          calories_remaining: 2100,
          protein_remaining: 150,
        },
        {
          id: "survi",
          name: "Survi",
          calorie_target: 1650,
          protein_target: 100,
          calories_remaining: 1650,
          protein_remaining: 100,
        },
      ],
    },
    preferences: {
      preferred_cuisines: ["Indian", "Mediterranean", "Greek", "Mexican"],
      max_cooking_time_minutes: 30,
      vegetarian: true,
      eggs_allowed: true,
      chicken_allowed: false,
      allergies: [],
      dislikes: [],
      spice_preference: "medium",
      repeat_tolerance: 0.3,
    },
    inventory: [],
    recent_meals: [],
    use_soon: [],
    feedback: [],
    ...overrides,
  };
}

/** The kitchen a full Trader Joe's run plus staples would leave behind. */
export function stockedKitchen(): InventoryItem[] {
  return [
    inventoryItem("Baby Spinach", { estimated_expiry: addDays(TODAY, 2), storage_location: "Fridge" }),
    inventoryItem("Paneer", { storage_location: "Fridge", estimated_expiry: addDays(TODAY, 9) }),
    inventoryItem("Greek Yogurt", { storage_location: "Fridge", estimated_expiry: addDays(TODAY, 12) }),
    inventoryItem("Yellow Onions"),
    inventoryItem("Garlic"),
    inventoryItem("Basmati Rice"),
    inventoryItem("Chickpeas"),
    inventoryItem("Eggs", { storage_location: "Fridge" }),
    inventoryItem("Feta Cheese", { storage_location: "Fridge" }),
    inventoryItem("Persian Cucumbers", { storage_location: "Fridge" }),
    inventoryItem("Cherry Tomatoes", { storage_location: "Fridge" }),
    inventoryItem("Olive Oil"),
    inventoryItem("Cumin", { category: "Spices" }),
    inventoryItem("Garam Masala", { category: "Spices" }),
    inventoryItem("Black Beans"),
    inventoryItem("Corn Tortillas"),
    inventoryItem("Tomato Basil Marinara"),
    inventoryItem("Chicken Breast", { storage_location: "Fridge" }),
  ];
}

export const today = todayISO;
