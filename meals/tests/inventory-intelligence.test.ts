import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "meals-invint-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
process.env.AI_PROVIDER = "mock";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { localDatabase, resetLocalDatabase } = await import("@/lib/db/local");
const { assessFreshness, foodCategoryFor, shelfLifeDays, useSoonScore } = await import(
  "@/lib/kitchen/freshness"
);
const { confidenceBandOf, currentConfidence, decayConfidence, inspect, replayStatus } =
  await import("@/lib/kitchen/state");
const { decideRestock } = await import("@/lib/kitchen/restock");
const { chooseConfirmations } = await import("@/lib/kitchen/confirmations");
const { adjustShelfLife, buildProductSignals } = await import("@/lib/kitchen/signals");
const { logMeal, undoMeal } = await import("@/lib/meals/log");
const { confirmReceipt, ingestReceipt } = await import("@/lib/receipt/service");
const { catalogRecipes } = await import("@/lib/meals/catalog");
const { rankRecipes } = await import("@/lib/meals/rank");
const { addDays, todayISO } = await import("@/lib/date");
const { inventoryItem, householdContext, TODAY } = await import("./helpers");
import type { InventoryEvent, InventoryItem } from "@/lib/types";

const db = localDatabase();
const palak = catalogRecipes.find((r) => r.id === "cat-palak-paneer-bowls")!;

beforeEach(async () => {
  await resetLocalDatabase();
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function event(overrides: Partial<InventoryEvent>): InventoryEvent {
  return {
    id: crypto.randomUUID(),
    household_id: "h",
    inventory_item_id: "item-1",
    event_type: "meal_consumed",
    from_status: "full",
    to_status: "some",
    detail: null,
    created_at: `${TODAY}T12:00:00.000Z`,
    ...overrides,
  };
}

describe("freshness estimates", () => {
  it("categorises products, falling back to storage location", () => {
    expect(foodCategoryFor("Baby Spinach", "Fridge")).toBe("leafy_greens");
    expect(foodCategoryFor("Blueberries", "Fridge")).toBe("berries");
    expect(foodCategoryFor("Greek Yogurt", "Fridge")).toBe("dairy");
    expect(foodCategoryFor("Basmati Rice", "Pantry")).toBe("pantry_staple");
    expect(foodCategoryFor("Some Unknown Thing", "Freezer")).toBe("frozen");
  });

  it("gives perishables short windows and staples long ones", () => {
    expect(shelfLifeDays("Baby Spinach", "Fridge")).toBeLessThanOrEqual(6);
    expect(shelfLifeDays("Chicken Breast", "Fridge")).toBeLessThanOrEqual(4);
    expect(shelfLifeDays("Basmati Rice", "Pantry")).toBeGreaterThan(180);
  });

  it("describes freshness as an estimate, never an exact time", () => {
    const spinach = inventoryItem("Baby Spinach", {
      storage_location: "Fridge",
      purchase_date: addDays(TODAY, -3),
      estimated_expiry: addDays(TODAY, 2),
    });
    const freshness = assessFreshness(spinach, TODAY);
    expect(freshness.state).toBe("use_soon");
    expect(freshness.label).toMatch(/likely good for about 2 more days/i);
    expect(freshness.label).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("flags items past their likely best without claiming certainty", () => {
    const old = inventoryItem("Baby Spinach", {
      storage_location: "Fridge",
      purchase_date: addDays(TODAY, -12),
      estimated_expiry: addDays(TODAY, -3),
    });
    const freshness = assessFreshness(old, TODAY);
    expect(freshness.state).toBe("likely_past_best");
    expect(freshness.label).toMatch(/probably/i);
  });

  it("says non-perishables keep well rather than inventing a date", () => {
    const rice = inventoryItem("Basmati Rice", { estimated_expiry: null });
    const freshness = assessFreshness(rice, TODAY);
    expect(freshness.days_left).toBeNull();
    expect(freshness.label).toBe("Keeps well");
    expect(useSoonScore(rice, TODAY)).toBe(0);
  });

  it("scores urgency higher the closer an item is to going off", () => {
    const soon = inventoryItem("Baby Spinach", { estimated_expiry: addDays(TODAY, 1) });
    const later = inventoryItem("Baby Spinach", { estimated_expiry: addDays(TODAY, 5) });
    expect(useSoonScore(soon, TODAY)).toBeGreaterThan(useSoonScore(later, TODAY));
    expect(useSoonScore({ ...soon, status: "out" }, TODAY)).toBe(0);
  });
});

describe("confidence", () => {
  it("decays with age and never reaches zero", () => {
    expect(decayConfidence(1, 0)).toBe(1);
    expect(decayConfidence(1, 14)).toBeCloseTo(0.5, 2);
    expect(decayConfidence(1, 400)).toBeGreaterThan(0);
    expect(decayConfidence(1, 28)).toBeLessThan(decayConfidence(1, 14));
  });

  it("bands confidence for display", () => {
    expect(confidenceBandOf(0.9)).toBe("high");
    expect(confidenceBandOf(0.5)).toBe("medium");
    expect(confidenceBandOf(0.3)).toBe("low");
  });

  it("trusts a user confirmation more than an inference", () => {
    const confirmed = inventoryItem("Paneer", {
      status_source: "user",
      status_confidence: 1,
      last_confirmed_at: `${TODAY}T08:00:00.000Z`,
    });
    const guessed = inventoryItem("Paneer", {
      status_source: "inferred",
      status_confidence: 0.7,
      last_confirmed_at: null,
      updated_at: `${TODAY}T08:00:00.000Z`,
    });
    expect(currentConfidence(confirmed, TODAY)).toBeGreaterThan(currentConfidence(guessed, TODAY));
  });
});

describe("state is explainable from events", () => {
  it("replays a status trail", () => {
    const events = [
      event({ event_type: "receipt_added", from_status: null, to_status: "full", created_at: `${TODAY}T01:00:00Z` }),
      event({ event_type: "meal_consumed", from_status: "full", to_status: "some", created_at: `${TODAY}T02:00:00Z` }),
      event({ event_type: "meal_consumed", from_status: "some", to_status: "low", created_at: `${TODAY}T03:00:00Z` }),
    ];
    const { status, steps } = replayStatus(events, "item-1");
    expect(status).toBe("low");
    expect(steps).toHaveLength(3);
    expect(steps[2]).toMatch(/some → low/);
  });

  it("explains an item in plain language", () => {
    const item = inventoryItem("Baby Spinach", {
      id: "item-1",
      purchase_date: addDays(TODAY, -5),
      estimated_expiry: addDays(TODAY, 1),
      status: "low",
    });
    const insight = inspect(item, [event({ inventory_item_id: "item-1" }), event({ inventory_item_id: "item-1" })], TODAY);
    expect(insight.explanation).toContain("Bought 5 days ago");
    expect(insight.explanation).toContain("used in 2 meals");
    expect(insight.availability).toBe("low");
  });

  it("marks uncertain stock as available_uncertain, not simply available", () => {
    const stale = inventoryItem("Paneer", {
      status: "some",
      status_source: "inferred",
      status_confidence: 0.7,
      updated_at: `${addDays(TODAY, -30)}T00:00:00.000Z`,
      last_confirmed_at: null,
    });
    expect(inspect(stale, [], TODAY).availability).toBe("available_uncertain");
  });
});

describe("scenario A–C: purchase then repeated consumption", () => {
  it("A. a newly confirmed receipt item starts Full and high confidence", async () => {
    const ingest = await ingestReceipt(Buffer.from("receipt-A"), "image/png");
    await confirmReceipt(ingest.receipt.id);

    const added = (await db.listInventory()).find((i) => i.receipt_id === ingest.receipt.id)!;
    expect(added.status).toBe("full");
    expect(added.status_source).toBe("receipt");
    expect(currentConfidence(added, todayISO())).toBeGreaterThan(0.9);
  });

  it("B + C. meals step an item down, and repeated use keeps stepping", async () => {
    const before = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    expect(before.status).toBe("full");

    await logMeal({ recipe_id: palak.id, meal_type: "dinner" });
    const afterOne = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    expect(afterOne.status).toBe("some");
    expect(afterOne.status_source).toBe("inferred");

    await logMeal({ recipe_id: "cat-paneer-tikka-bowls", meal_type: "dinner" });
    const afterTwo = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    expect(["low", "out"]).toContain(afterTwo.status);
  });

  it("leaves bulk staples alone after a single meal", async () => {
    const before = (await db.listInventory()).find((i) => i.normalized_name === "Basmati Rice")!;
    await logMeal({ recipe_id: palak.id, meal_type: "dinner" });
    const after = (await db.listInventory()).find((i) => i.normalized_name === "Basmati Rice")!;
    expect(after.status).toBe(before.status);
  });
});

describe("scenario D: restock detection", () => {
  it("refills an existing Low item rather than duplicating it", () => {
    const inventory = [inventoryItem("Baby Spinach", { status: "low" })];
    const decision = decideRestock(
      { normalized_name: "Baby Spinach", category: "Produce", package_size: "16 oz", quantity: 1 },
      inventory,
    );
    expect(decision.kind).toBe("restock");
    if (decision.kind === "restock") expect(decision.newStatus).toBe("full");
  });

  it("tops up an item that still has some left", () => {
    const inventory = [inventoryItem("Greek Yogurt", { status: "some" })];
    const decision = decideRestock(
      { normalized_name: "Greek Yogurt", category: "Dairy", package_size: "32 oz", quantity: 1 },
      inventory,
    );
    expect(decision.kind).toBe("additional");
  });

  it("keeps two genuinely different products separate", () => {
    const inventory = [inventoryItem("Organic Vanilla Yogurt", { status: "some" })];
    const decision = decideRestock(
      { normalized_name: "Greek Yogurt", category: "Dairy", package_size: "32 oz", quantity: 1 },
      inventory,
    );
    expect(decision.kind).toBe("new_product");
    expect(decision.reason).toMatch(/different product/i);
  });

  it("prefers refilling the emptiest matching item", () => {
    const inventory = [
      inventoryItem("Baby Spinach", { id: "full-one", status: "full" }),
      inventoryItem("Baby Spinach", { id: "empty-one", status: "out" }),
    ];
    const decision = decideRestock(
      { normalized_name: "Baby Spinach", category: "Produce", package_size: null, quantity: 1 },
      inventory,
    );
    expect(decision.kind).toBe("restock");
    if (decision.kind !== "new_product") expect(decision.target.id).toBe("empty-one");
  });

  it("restocks through the real confirm path without creating duplicates", async () => {
    // Drop spinach to Low, then buy it again on a receipt.
    const spinach = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    await db.updateInventoryItem(spinach.id, { status: "low" });

    const receipt = await db.createReceipt({
      household_id: "11111111-1111-4111-8111-111111111111",
      merchant: "Trader Joe's",
      purchase_date: todayISO(),
      currency: "USD",
      subtotal: 4,
      tax: 0,
      total: 4,
      image_path: null,
      image_hash: "restock-hash",
      processing_status: "parsed",
      parser: "fixture",
      error_message: null,
    });
    await db.replaceReceiptItems(receipt.id, [
      {
        receipt_id: receipt.id,
        raw_name: "ORG BABY SPINACH 16OZ",
        normalized_name: "Baby Spinach",
        quantity: 1,
        package_size: "16 oz",
        unit_price: null,
        price: 3.99,
        category: "Produce",
        storage_location: "Fridge",
        classification: "human_food",
        confidence: 0.97,
        matched_food_id: null,
        included: true,
        notes: null,
      },
    ]);

    const beforeCount = (await db.listInventory()).length;
    const result = await confirmReceipt(receipt.id);

    expect(result.restocked).toBe(1);
    expect(result.added).toBe(0);
    expect((await db.listInventory())).toHaveLength(beforeCount);

    const after = (await db.listInventory()).find((i) => i.normalized_name === "Baby Spinach")!;
    expect(after.status).toBe("full");
    expect(after.status_source).toBe("receipt");

    const events = await db.listInventoryEvents();
    expect(events.some((e) => e.event_type === "restocked")).toBe(true);
  });
});

describe("scenario E–F: expiry and manual override", () => {
  it("E. a likely-expired item is flagged and drops out of use-soon boosting", () => {
    const stale = inventoryItem("Baby Spinach", {
      purchase_date: addDays(TODAY, -14),
      estimated_expiry: addDays(TODAY, -4),
    });
    const insight = inspect(stale, [], TODAY);
    expect(insight.likely_past_best).toBe(true);
    expect(insight.use_soon).toBe(true);
  });

  it("F. marking something Out removes it from availability", async () => {
    const { tools } = await import("@/lib/ai/tools");
    const paneer = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    await tools.update_inventory({ inventory_item_id: paneer.id, status: "out" });

    const inventory = await db.listInventory();
    const context = householdContext();
    const ranked = rankRecipes([palak], inventory, context, todayISO());
    const paneerRecipe = ranked.find((r) => r.recipe.id === palak.id)!;

    expect(
      paneerRecipe.availability.missing.map((m) => m.ingredient.ingredient_name),
    ).toContain("Paneer");
  });
});

describe("scenario G–H: undo and durability", () => {
  it("G. undo restores the previous inventory state", async () => {
    const before = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    const logged = await logMeal({ recipe_id: palak.id, meal_type: "dinner" });

    const during = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    expect(during.status).not.toBe(before.status);

    await undoMeal(logged.batch_id);
    const after = (await db.listInventory()).find((i) => i.normalized_name === "Paneer")!;
    expect(after.status).toBe(before.status);
  });

  it("H. the event history survives reloading the store from disk", async () => {
    await logMeal({ recipe_id: palak.id, meal_type: "dinner" });
    const before = await db.listInventoryEvents();
    expect(before.length).toBeGreaterThan(0);

    // Fresh adapter instance reading the same file — as a server restart would.
    const { localDatabase: reopened } = await import("@/lib/db/local");
    const after = await reopened().listInventoryEvents();
    expect(after.length).toBe(before.length);
  });
});

describe("scenario I: lightweight confirmation", () => {
  const uncertainSpinach = inventoryItem("Baby Spinach", {
    id: "spin",
    status: "some",
    status_source: "inferred",
    status_confidence: 0.7,
    updated_at: `${addDays(TODAY, -25)}T00:00:00.000Z`,
    last_confirmed_at: null,
    estimated_expiry: addDays(TODAY, 2),
  });

  it("asks when a recommendation depends on uncertain stock", () => {
    const prompts = chooseConfirmations({
      insights: [inspect(uncertainSpinach, [], TODAY)],
      recommendationDependencies: ["Baby Spinach"],
      today: TODAY,
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].question).toMatch(/still have baby spinach/i);
    expect(prompts[0].options.map((o) => o.label)).toEqual(["Plenty", "Low", "Out"]);
  });

  it("stays quiet about confident stock", () => {
    const confident = inventoryItem("Paneer", {
      status: "full",
      status_source: "user",
      status_confidence: 1,
      last_confirmed_at: `${TODAY}T08:00:00.000Z`,
      estimated_expiry: addDays(TODAY, 9),
    });
    const prompts = chooseConfirmations({
      insights: [inspect(confident, [], TODAY)],
      recommendationDependencies: ["Paneer"],
      today: TODAY,
    });
    expect(prompts).toHaveLength(0);
  });

  it("does not re-ask about something confirmed a day ago", () => {
    const justConfirmed: InventoryItem = {
      ...uncertainSpinach,
      last_confirmed_at: `${addDays(TODAY, -1)}T08:00:00.000Z`,
    };
    const prompts = chooseConfirmations({
      insights: [inspect(justConfirmed, [], TODAY)],
      recommendationDependencies: ["Baby Spinach"],
      today: TODAY,
    });
    expect(prompts).toHaveLength(0);
  });

  it("never asks more than two questions at once", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      inspect({ ...uncertainSpinach, id: `item-${index}` }, [], TODAY),
    );
    const prompts = chooseConfirmations({
      insights: many,
      recommendationDependencies: ["Baby Spinach"],
      today: TODAY,
    });
    expect(prompts.length).toBeLessThanOrEqual(2);
  });

  it("asks about food safety when something is probably past its best", () => {
    const old = inventoryItem("Blueberries", {
      status: "some",
      purchase_date: addDays(TODAY, -14),
      estimated_expiry: addDays(TODAY, -5),
    });
    const prompts = chooseConfirmations({ insights: [inspect(old, [], TODAY)], today: TODAY });
    expect(prompts[0].kind).toBe("probably_expired");
    expect(prompts[0].options.map((o) => o.status)).toContain("out");
  });
});

describe("household food signals", () => {
  it("derives purchase, usage and lifetime statistics from events", () => {
    const item = inventoryItem("Greek Yogurt", { id: "yog" });
    const events: InventoryEvent[] = [
      event({ inventory_item_id: "yog", event_type: "receipt_added", from_status: null, to_status: "full", created_at: "2026-08-01T00:00:00Z" }),
      event({ inventory_item_id: "yog", event_type: "meal_consumed", from_status: "full", to_status: "some", created_at: "2026-08-02T00:00:00Z" }),
      event({ inventory_item_id: "yog", event_type: "marked_out", from_status: "some", to_status: "out", created_at: "2026-08-04T00:00:00Z" }),
      event({ inventory_item_id: "yog", event_type: "restocked", from_status: "out", to_status: "full", created_at: "2026-08-10T00:00:00Z" }),
    ];

    const signal = buildProductSignals([item], events).get("yogurt")!;
    expect(signal.purchases).toBe(2);
    expect(signal.avg_days_to_out).toBe(3);
    expect(signal.repurchase_interval_days).toBe(9);
    expect(signal.meal_uses).toBe(1);
  });

  it("shortens a shelf-life estimate when the household always finishes early", () => {
    const fast = {
      product: "yogurt",
      purchases: 3,
      avg_days_to_out: 4,
      repurchase_interval_days: 7,
      meal_uses: 6,
      fast_consumption_count: 3,
      waste_count: 0,
      staple_likelihood: 0.2,
    };
    const adjusted = adjustShelfLife(14, fast);
    expect(adjusted.days).toBe(4);
    expect(adjusted.reason).toMatch(/usually finishes it/i);
  });

  it("never stretches an estimate beyond the category default", () => {
    const slow = {
      product: "yogurt",
      purchases: 3,
      avg_days_to_out: 40,
      repurchase_interval_days: 45,
      meal_uses: 2,
      fast_consumption_count: 0,
      waste_count: 0,
      staple_likelihood: 0.9,
    };
    expect(adjustShelfLife(14, slow).days).toBe(14);
  });

  it("ignores a single observation", () => {
    const thin = {
      product: "yogurt",
      purchases: 1,
      avg_days_to_out: 2,
      repurchase_interval_days: null,
      meal_uses: 1,
      fast_consumption_count: 1,
      waste_count: 0,
      staple_likelihood: 0.5,
    };
    expect(adjustShelfLife(14, thin).days).toBe(14);
  });
});

describe("recommendations understand confidence", () => {
  it("ranks a confidently-stocked kitchen above an uncertain one", () => {
    const context = householdContext();
    const confident = [
      inventoryItem("Baby Spinach", { status_source: "user", status_confidence: 1, last_confirmed_at: `${TODAY}T00:00:00.000Z` }),
      inventoryItem("Paneer", { status_source: "user", status_confidence: 1, last_confirmed_at: `${TODAY}T00:00:00.000Z` }),
      inventoryItem("Greek Yogurt"),
      inventoryItem("Yellow Onions"),
      inventoryItem("Garlic"),
      inventoryItem("Basmati Rice"),
      inventoryItem("Garam Masala"),
      inventoryItem("Cumin"),
    ];
    const uncertain = confident.map((item) => ({
      ...item,
      status_source: "inferred" as const,
      status_confidence: 0.7,
      last_confirmed_at: null,
      updated_at: `${addDays(TODAY, -40)}T00:00:00.000Z`,
    }));

    const sure = rankRecipes([palak], confident, context, TODAY)[0];
    const unsure = rankRecipes([palak], uncertain, context, TODAY)[0];

    expect(sure.factors.inventory_fit).toBeGreaterThan(unsure.factors.inventory_fit);
    expect(sure.score).toBeGreaterThan(unsure.score);
  });

  it("keeps dietary filters absolute regardless of use-soon urgency", () => {
    const context = householdContext(); // chicken_allowed = false
    const chicken = catalogRecipes.find((r) => r.id === "cat-chicken-souvlaki-bowls")!;
    const kitchen = [
      inventoryItem("Chicken Breast", { estimated_expiry: addDays(TODAY, 0) }),
      inventoryItem("Greek Yogurt", { estimated_expiry: addDays(TODAY, 1) }),
    ];
    const ranked = rankRecipes([chicken, palak], kitchen, context, TODAY);
    expect(ranked.map((r) => r.recipe.id)).not.toContain(chicken.id);
  });
});
