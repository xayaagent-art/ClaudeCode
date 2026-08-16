import type { Household, InventoryItem, Member } from "@/lib/types";

export const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
export const YASH_ID = "22222222-2222-4222-8222-222222222221";
export const SURVI_ID = "22222222-2222-4222-8222-222222222222";

export const seedHousehold: Household = {
  id: HOUSEHOLD_ID,
  name: "Mehta Household",
  created_at: "2026-08-01T00:00:00.000Z",
};

/**
 * Starting profiles. These are defaults to edit in Settings, not fixed truths —
 * Yash and Survi deliberately do not share targets or cooking-time tolerance.
 */
export const seedMembers: Member[] = [
  {
    id: YASH_ID,
    household_id: HOUSEHOLD_ID,
    name: "Yash",
    avatar: null,
    created_at: "2026-08-01T00:00:00.000Z",
    profile: {
      member_id: YASH_ID,
      calorie_target: 2100,
      protein_target: 150,
      dietary_preferences: ["vegetarian", "eggs", "occasional_chicken"],
      allergies: [],
      dislikes: ["beets"],
      preferred_cuisines: ["Indian", "Mediterranean", "Greek", "Mexican"],
      max_cooking_time: 30,
      spice_preference: "medium",
      repeat_tolerance: 0.3,
    },
  },
  {
    id: SURVI_ID,
    household_id: HOUSEHOLD_ID,
    name: "Survi",
    avatar: null,
    created_at: "2026-08-01T00:00:00.000Z",
    profile: {
      member_id: SURVI_ID,
      calorie_target: 1650,
      protein_target: 100,
      dietary_preferences: ["vegetarian", "eggs"],
      allergies: [],
      dislikes: ["olives"],
      preferred_cuisines: ["Indian", "Mediterranean", "Greek"],
      max_cooking_time: 35,
      spice_preference: "mild",
      repeat_tolerance: 0.4,
    },
  },
];

interface SeedInventorySpec {
  normalized_name: string;
  category: string;
  storage_location: InventoryItem["storage_location"];
  status: InventoryItem["status"];
  /** Days from "today" — kept relative so dev data never goes stale. */
  expires_in_days: number | null;
  package_size?: string;
}

export const seedInventorySpecs: SeedInventorySpec[] = [
  { normalized_name: "Baby Spinach", category: "Produce", storage_location: "Fridge", status: "some", expires_in_days: 2, package_size: "16 oz" },
  { normalized_name: "Paneer", category: "Dairy", storage_location: "Fridge", status: "full", expires_in_days: 9, package_size: "14 oz" },
  { normalized_name: "Greek Yogurt", category: "Dairy", storage_location: "Fridge", status: "some", expires_in_days: 3, package_size: "32 oz" },
  { normalized_name: "Yellow Onions", category: "Produce", storage_location: "Pantry", status: "full", expires_in_days: 21, package_size: "3 lb" },
  { normalized_name: "Garlic", category: "Produce", storage_location: "Pantry", status: "full", expires_in_days: 30 },
  { normalized_name: "Basmati Rice", category: "Pantry", storage_location: "Pantry", status: "full", expires_in_days: null, package_size: "2 lb" },
  { normalized_name: "Chickpeas", category: "Pantry", storage_location: "Pantry", status: "full", expires_in_days: null, package_size: "15 oz can" },
  { normalized_name: "Eggs", category: "Dairy", storage_location: "Fridge", status: "some", expires_in_days: 12, package_size: "12 ct" },
  { normalized_name: "Feta Cheese", category: "Dairy", storage_location: "Fridge", status: "some", expires_in_days: 14, package_size: "8 oz" },
  { normalized_name: "Persian Cucumbers", category: "Produce", storage_location: "Fridge", status: "full", expires_in_days: 6 },
  { normalized_name: "Cherry Tomatoes", category: "Produce", storage_location: "Fridge", status: "some", expires_in_days: 4, package_size: "10 oz" },
  { normalized_name: "Olive Oil", category: "Pantry", storage_location: "Pantry", status: "full", expires_in_days: null },
  { normalized_name: "Cumin", category: "Spices", storage_location: "Pantry", status: "full", expires_in_days: null },
  { normalized_name: "Garam Masala", category: "Spices", storage_location: "Pantry", status: "full", expires_in_days: null },
  { normalized_name: "Black Beans", category: "Pantry", storage_location: "Pantry", status: "full", expires_in_days: null, package_size: "15 oz can" },
  { normalized_name: "Corn Tortillas", category: "Bakery", storage_location: "Pantry", status: "some", expires_in_days: 10 },
];
