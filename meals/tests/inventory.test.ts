import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "meals-test-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { planDeductions, stepDown, usesPerStep, usesSinceLastStep } = await import(
  "@/lib/kitchen/deduct"
);
const { assessRecipe, findInventoryMatch, isAvailable } = await import("@/lib/kitchen/match");
const { confirmReceipt } = await import("@/lib/receipt/service");
const { logMeal, undoMeal } = await import("@/lib/meals/log");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { HOUSEHOLD_ID } = await import("@/lib/seed");
const { inventoryItem, TODAY } = await import("./helpers");

const db = localDatabase();
const palakPaneer = catalogRecipes.find((r) => r.id === "cat-palak-paneer-bowls")!;

beforeEach(async () => {
  await resetLocalDatabase();
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function seedReceipt() {
  const receipt = await db.createReceipt({
    household_id: HOUSEHOLD_ID,
    merchant: "Trader Joe's",
    purchase_date: TODAY,
    currency: "USD",
    subtotal: 10,
    tax: 1,
    total: 11,
    image_path: "test.png",
    processing_status: "parsed",
    parser: "fixture",
    error_message: null,
  });

  await db.replaceReceiptItems(receipt.id, [
    {
      receipt_id: receipt.id,
      raw_name: "ONIONS RED ORG 2 LB",
      normalized_name: "Organic Red Onions",
      quantity: 1,
      package_size: "2 lb",
      price: 3.29,
      category: "Produce",
      storage_location: "Pantry",
      classification: "human_food",
      confidence: 0.98,
      matched_food_id: null,
      included: true,
      notes: null,
    },
    {
      receipt_id: receipt.id,
      raw_name: "HAND SANITIZER TJS 8OZ",
      normalized_name: "Hand Sanitizer",
      quantity: 1,
      package_size: "8 oz",
      price: 2.99,
      category: "Household",
      storage_location: "Pantry",
      classification: "non_food",
      confidence: 0.98,
      matched_food_id: null,
      included: false,
      notes: null,
    },
    {
      receipt_id: receipt.id,
      raw_name: "DOG FOOD LAMB & RICE 13OZ",
      normalized_name: "Lamb And Rice Canned Dog Food",
      quantity: 1,
      package_size: "13 oz",
      price: 1.79,
      category: "Pet",
      storage_location: "Pantry",
      classification: "pet_food",
      confidence: 0.97,
      matched_food_id: null,
      included: false,
      notes: null,
    },
  ]);

  return receipt;
}

describe("receipt confirmation creates inventory", () => {
  it("adds only human food and records an event for each item", async () => {
    const before = (await db.listInventory()).length;
    const receipt = await seedReceipt();

    const result = await confirmReceipt(receipt.id);
    expect(result.added).toBe(1);

    const inventory = await db.listInventory();
    expect(inventory).toHaveLength(before + 1);

    const added = inventory.find((i) => i.receipt_id === receipt.id)!;
    expect(added.normalized_name).toBe("Organic Red Onions");
    expect(added.status).toBe("full");
    expect(added.estimated_expiry).not.toBeNull();
    expect(added.raw_name).toBe("ONIONS RED ORG 2 LB");

    const events = await db.listInventoryEvents();
    expect(events.some((e) => e.inventory_item_id === added.id && e.event_type === "receipt_added")).toBe(
      true,
    );

    expect(inventory.some((i) => i.normalized_name === "Hand Sanitizer")).toBe(false);
    expect(inventory.some((i) => i.normalized_name.includes("Dog Food"))).toBe(false);

    const stored = await db.getReceipt(receipt.id);
    expect(stored?.processing_status).toBe("confirmed");
  });
});

describe("availability", () => {
  it("ignores items marked out", () => {
    const stocked = inventoryItem("Paneer");
    expect(isAvailable(stocked)).toBe(true);
    expect(findInventoryMatch("Paneer", [stocked])?.id).toBe(stocked.id);

    const empty = { ...stocked, status: "out" as const };
    expect(isAvailable(empty)).toBe(false);
    expect(findInventoryMatch("Paneer", [empty])).toBeNull();
  });

  it("matches through common product-name variations", () => {
    const kitchen = [inventoryItem("Organic Red Onions"), inventoryItem("Baby Spinach")];
    expect(findInventoryMatch("Yellow Onions", kitchen)?.normalized_name).toBe("Organic Red Onions");
    expect(findInventoryMatch("Baby Spinach", kitchen)?.normalized_name).toBe("Baby Spinach");
  });

  it("does not confuse two different squashes", () => {
    const kitchen = [inventoryItem("Yellow Squash")];
    expect(findInventoryMatch("Spaghetti Squash", kitchen)).toBeNull();
    expect(findInventoryMatch("Butternut Squash", kitchen)).toBeNull();
  });

  it("reads a product name by its head, not its trailing modifier", async () => {
    const { canonicalName } = await import("@/lib/kitchen/match");
    // "with X" describes the cheese; it does not make the product an onion.
    expect(canonicalName("English Cheddar With Caramelized Onion")).toBe("cheddar");
    expect(canonicalName("Organic Red Onions")).toBe("onion");
    expect(canonicalName("Tomato Feta Soup")).not.toBe(
      canonicalName("Creamy Tomato Basil Soup"),
    );
  });

  it("does not treat a prepared meal as its headline vegetable", () => {
    const kitchen = [inventoryItem("Butternut Squash Mac & Cheese", { storage_location: "Freezer" })];
    expect(findInventoryMatch("Butternut Squash", kitchen)).toBeNull();
  });

  it("treats salt and pepper as always on hand", () => {
    const assessment = assessRecipe(
      {
        ...palakPaneer,
        ingredients: [
          { id: "a", recipe_id: "r", ingredient_name: "Salt", quantity: 1, unit: "tsp", optional: false },
        ],
      },
      [],
    );
    expect(assessment.missing).toHaveLength(0);
    expect(assessment.ratio).toBe(1);
  });
});

describe("meal logging reduces inventory safely", () => {
  it("steps a fresh ingredient down one level and records the event", async () => {
    const result = await logMeal({ recipe_id: palakPaneer.id, meal_type: "dinner" });

    expect(result.logs).toHaveLength(2); // one row per household member
    expect(result.logs[0].calories).toBeGreaterThan(0);

    const spinach = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    expect(spinach.status).toBe("low"); // seeded at "some"

    const events = await db.listInventoryEvents();
    expect(events.some((e) => e.event_type === "meal_consumed" && e.detail?.includes(palakPaneer.title))).toBe(
      true,
    );
  });

  it("leaves bulk staples alone until they have been used several times", async () => {
    const before = (await db.listInventory()).find((i) => i.normalized_name === "Basmati Rice")!;
    await logMeal({ recipe_id: palakPaneer.id, meal_type: "dinner" });
    const after = (await db.listInventory()).find((i) => i.normalized_name === "Basmati Rice")!;
    expect(after.status).toBe(before.status);
  });

  it("never steps an item below out", () => {
    expect(stepDown("full")).toBe("some");
    expect(stepDown("low")).toBe("out");
    expect(stepDown("out")).toBe("out");
  });

  it("does not deduct when the inventory match is weak", () => {
    const uncertain = inventoryItem("Baby Spinach", { confidence: 0.4, status: "full" });
    const decisions = planDeductions(palakPaneer.ingredients, [uncertain], []);
    const spinach = decisions.find((d) => d.item.normalized_name === "Baby Spinach")!;
    expect(spinach.stepped).toBe(false);
    expect(spinach.detail).toMatch(/confidence/i);
  });

  it("requires more uses for token amounts than for main ingredients", () => {
    const spice = palakPaneer.ingredients.find((i) => i.ingredient_name === "Cumin")!;
    const spinach = palakPaneer.ingredients.find((i) => i.ingredient_name === "Baby Spinach")!;
    expect(usesPerStep(spice, inventoryItem("Cumin", { category: "Spices" }))).toBeGreaterThan(
      usesPerStep(spinach, inventoryItem("Baby Spinach")),
    );
  });

  it("counts uses only back to the last real status change", () => {
    const events = [
      { inventory_item_id: "x", event_type: "meal_consumed", from_status: "some", to_status: "some" },
      { inventory_item_id: "x", event_type: "meal_consumed", from_status: "some", to_status: "some" },
      { inventory_item_id: "x", event_type: "meal_consumed", from_status: "full", to_status: "some" },
      { inventory_item_id: "x", event_type: "meal_consumed", from_status: "full", to_status: "full" },
    ].map((event, index) => ({
      ...event,
      id: `e${index}`,
      household_id: "h",
      detail: null,
      created_at: `2026-08-1${5 - index}T00:00:00.000Z`,
    })) as Parameters<typeof usesSinceLastStep>[0];

    expect(usesSinceLastStep(events, "x")).toBe(2);
  });
});

describe("undo", () => {
  it("removes the logs and restores the inventory it moved", async () => {
    const before = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    const result = await logMeal({ recipe_id: palakPaneer.id, meal_type: "dinner" });

    const during = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    expect(during.status).not.toBe(before.status);

    const undone = await undoMeal(result.batch_id);
    expect(undone.removed).toBe(2);
    expect(await db.listMealLogs()).toHaveLength(0);

    const after = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    expect(after.status).toBe(before.status);
  });
});

describe("manual editing", () => {
  it("saves a status change and writes an audit event", async () => {
    const { tools } = await import("@/lib/ai/tools");
    const item = (await db.listInventory())[0];

    const updated = await tools.update_inventory({
      inventory_item_id: item.id,
      status: "out",
    });
    expect(updated.status).toBe("out");

    const events = await db.listInventoryEvents();
    expect(events[0].event_type).toBe("marked_out");
    expect(events[0].from_status).toBe(item.status);
  });

  it("adds and removes an item by hand", async () => {
    const [created] = await db.addInventoryItems([
      {
        normalized_name: "Halloumi",
        raw_name: null,
        category: "Dairy",
        storage_location: "Fridge",
        quantity: 1,
        package_size: null,
        status: "full",
        purchase_date: TODAY,
        estimated_expiry: null,
        nutrition_food_id: null,
        nutrition_source: null,
        nutrition_confidence: null,
        calories_per_100g: null,
        protein_per_100g: null,
        serving_size: null,
        confidence: 1,
        receipt_item_id: null,
        receipt_id: null,
      },
    ]);
    expect((await db.listInventory()).some((i) => i.id === created.id)).toBe(true);

    await db.deleteInventoryItem(created.id);
    expect((await db.listInventory()).some((i) => i.id === created.id)).toBe(false);
  });
});
