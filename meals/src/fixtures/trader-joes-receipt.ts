import type { ParsedReceipt } from "@/lib/receipt/schema";

/**
 * Development fixture: a Trader Joe's grocery run.
 *
 * Two jobs:
 *  1. `receiptLines` renders fixtures/trader-joes-receipt.html into a real PNG
 *     (scripts/render-receipt-fixture.mjs) that is fed through the actual vision
 *     pipeline during manual testing.
 *  2. `fixtureParsedReceipt` is the expected structured result, used by the
 *     offline parser and by regression tests.
 *
 * The parser is NOT written around these strings. They are a fixture, and the
 * behaviours they pin down are general: raw names preserved, non-food and pet
 * food excluded from meal inventory, ambiguous lines flagged, missing prices
 * tolerated, duplicate lines kept distinct.
 */

export const FIXTURE_MERCHANT = "Trader Joe's";
export const FIXTURE_PURCHASE_DATE = "2026-08-15";

/** Raw receipt body, in print order, as it appears on the paper. */
export const receiptLines: { text: string; price: string }[] = [
  { text: "TOMATO FETA SOUP 20OZ", price: "3.99" },
  { text: "VANILLA ICE CREAM 1PT", price: "3.49" },
  { text: "ORG VANILLA YOGURT 32OZ", price: "4.29" },
  { text: "OAT BEVERAGE 32OZ", price: "2.99" },
  { text: "TANGERINES 2LB BAG", price: "3.49" },
  { text: "CREAMY TOMATO BASIL 32OZ", price: "3.99" },
  { text: "BRKFST CHKN SAUSAGE BURRITO", price: "2.99" },
  { text: "COLBY JACK CHEESE 16OZ", price: "4.49" },
  { text: "PROVOLONE SLICED 8OZ", price: "2.99" },
  { text: "ENG CHEDDAR CARML ONION 7OZ", price: "3.99" },
  { text: "PINEAPPLE WHOLE EA", price: "3.49" },
  { text: "BTRNT SQ MAC & CHEESE 12OZ", price: "4.99" },
  { text: "ONIONS RED ORG 2 LB", price: "3.29" },
  { text: "BLUEBERRIES 18OZ", price: "4.99" },
  { text: "TOMATO BASIL MARINARA 25OZ", price: "2.29" },
  { text: "ORG BLACK TEA CONCENTRATE", price: "3.99" },
  { text: "PERSIAN CUCUMBERS 1LB", price: "2.49" },
  { text: "YELLOW SQUASH EA", price: "0.99" },
  { text: "YELLOW SQUASH EA", price: "0.99" },
  { text: "OLIVES KALAMATA PITTED 6OZ", price: "3.49" },
  { text: "ENGLISH MUFFINS 6CT", price: "2.29" },
  { text: "PEARS BOSC EA", price: "0.79" },
  { text: "SPAGHETTI SQUASH EA", price: "2.99" },
  { text: "HERB GOAT LOG 8OZ", price: "3.99" },
  { text: "ORG BABY SPINACH 16OZ", price: "" },
  { text: "HAND SANITIZER TJS 8OZ", price: "2.99" },
  { text: "DOG FOOD LAMB & RICE 13OZ", price: "1.79" },
  { text: "BAG FEE", price: "0.10" },
];

export const FIXTURE_SUBTOTAL = 79.62;
export const FIXTURE_TAX = 1.42;
export const FIXTURE_TOTAL = 81.04;

type Item = ParsedReceipt["items"][number];

function item(
  raw: string,
  normalized: string,
  overrides: Partial<Item> = {},
): Item {
  return {
    raw_name: raw,
    normalized_name: normalized,
    quantity: 1,
    package_size: null,
    unit_price: null,
    total_price: null,
    category: "Other",
    storage_location: "Pantry",
    classification: "human_food",
    confidence: 0.95,
    uncertain_reason: null,
    ...overrides,
  };
}

export const fixtureParsedReceipt: ParsedReceipt = {
  merchant: FIXTURE_MERCHANT,
  purchase_date: FIXTURE_PURCHASE_DATE,
  currency: "USD",
  subtotal: FIXTURE_SUBTOTAL,
  tax: FIXTURE_TAX,
  total: FIXTURE_TOTAL,
  items: [
    item("TOMATO FETA SOUP 20OZ", "Tomato Feta Soup", {
      package_size: "20 oz", total_price: 3.99, category: "Pantry", storage_location: "Pantry", confidence: 0.96,
    }),
    item("VANILLA ICE CREAM 1PT", "Vanilla Ice Cream", {
      package_size: "1 pt", total_price: 3.49, category: "Frozen", storage_location: "Freezer", confidence: 0.97,
    }),
    item("ORG VANILLA YOGURT 32OZ", "Organic Vanilla Yogurt", {
      package_size: "32 oz", total_price: 4.29, category: "Dairy", storage_location: "Fridge", confidence: 0.96,
    }),
    item("OAT BEVERAGE 32OZ", "Oat Beverage", {
      package_size: "32 oz", total_price: 2.99, category: "Beverages", storage_location: "Fridge", confidence: 0.93,
    }),
    item("TANGERINES 2LB BAG", "Tangerines", {
      package_size: "2 lb", total_price: 3.49, category: "Produce", storage_location: "Produce", confidence: 0.97,
    }),
    item("CREAMY TOMATO BASIL 32OZ", "Creamy Tomato Basil Soup", {
      package_size: "32 oz", total_price: 3.99, category: "Pantry", storage_location: "Pantry", confidence: 0.82,
      uncertain_reason: "Line does not say whether this is soup or pasta sauce.",
    }),
    item("BRKFST CHKN SAUSAGE BURRITO", "Breakfast Chicken Sausage Burrito", {
      total_price: 2.99, category: "Frozen", storage_location: "Freezer", confidence: 0.92,
    }),
    item("COLBY JACK CHEESE 16OZ", "Colby Jack Cheese", {
      package_size: "16 oz", total_price: 4.49, category: "Dairy", storage_location: "Fridge", confidence: 0.97,
    }),
    item("PROVOLONE SLICED 8OZ", "Sliced Provolone", {
      package_size: "8 oz", total_price: 2.99, category: "Dairy", storage_location: "Fridge", confidence: 0.96,
    }),
    item("ENG CHEDDAR CARML ONION 7OZ", "English Cheddar with Caramelized Onion", {
      package_size: "7 oz", total_price: 3.99, category: "Dairy", storage_location: "Fridge", confidence: 0.9,
    }),
    item("PINEAPPLE WHOLE EA", "Pineapple", {
      total_price: 3.49, category: "Produce", storage_location: "Produce", confidence: 0.97,
    }),
    item("BTRNT SQ MAC & CHEESE 12OZ", "Butternut Squash Mac & Cheese", {
      package_size: "12 oz", total_price: 4.99, category: "Frozen", storage_location: "Freezer", confidence: 0.88,
    }),
    item("ONIONS RED ORG 2 LB", "Organic Red Onions", {
      package_size: "2 lb", total_price: 3.29, category: "Produce", storage_location: "Pantry", confidence: 0.98,
    }),
    item("BLUEBERRIES 18OZ", "Blueberries", {
      package_size: "18 oz", total_price: 4.99, category: "Produce", storage_location: "Fridge", confidence: 0.97,
    }),
    item("TOMATO BASIL MARINARA 25OZ", "Tomato Basil Marinara", {
      package_size: "25 oz", total_price: 2.29, category: "Pantry", storage_location: "Pantry", confidence: 0.96,
    }),
    item("ORG BLACK TEA CONCENTRATE", "Organic Black Tea Concentrate", {
      total_price: 3.99, category: "Beverages", storage_location: "Fridge", confidence: 0.9,
    }),
    item("PERSIAN CUCUMBERS 1LB", "Persian Cucumbers", {
      package_size: "1 lb", total_price: 2.49, category: "Produce", storage_location: "Fridge", confidence: 0.97,
    }),
    item("YELLOW SQUASH EA", "Yellow Squash", {
      total_price: 0.99, category: "Produce", storage_location: "Produce", confidence: 0.96,
    }),
    item("YELLOW SQUASH EA", "Yellow Squash", {
      total_price: 0.99, category: "Produce", storage_location: "Produce", confidence: 0.96,
    }),
    item("OLIVES KALAMATA PITTED 6OZ", "Pitted Kalamata Olives", {
      package_size: "6 oz", total_price: 3.49, category: "Pantry", storage_location: "Pantry", confidence: 0.95,
    }),
    item("ENGLISH MUFFINS 6CT", "English Muffins", {
      package_size: "6 ct", total_price: 2.29, category: "Bakery", storage_location: "Pantry", confidence: 0.97,
    }),
    item("PEARS BOSC EA", "Bosc Pears", {
      total_price: 0.79, category: "Produce", storage_location: "Produce", confidence: 0.96,
    }),
    item("SPAGHETTI SQUASH EA", "Spaghetti Squash", {
      total_price: 2.99, category: "Produce", storage_location: "Produce", confidence: 0.96,
    }),
    item("HERB GOAT LOG 8OZ", "Herbed Goat Cheese", {
      package_size: "8 oz", total_price: 3.99, category: "Dairy", storage_location: "Fridge", confidence: 0.64,
      uncertain_reason: "Abbreviated line; 'log' is a shape, not a product type.",
    }),
    // Price column smudged on the paper — the parser must not invent a number.
    item("ORG BABY SPINACH 16OZ", "Organic Baby Spinach", {
      package_size: "16 oz", total_price: null, category: "Produce", storage_location: "Fridge", confidence: 0.94,
    }),
    item("HAND SANITIZER TJS 8OZ", "Hand Sanitizer", {
      package_size: "8 oz", total_price: 2.99, category: "Household", storage_location: "Pantry",
      classification: "non_food", confidence: 0.98,
    }),
    item("DOG FOOD LAMB & RICE 13OZ", "Lamb and Rice Canned Dog Food", {
      package_size: "13 oz", total_price: 1.79, category: "Pet", storage_location: "Pantry",
      classification: "pet_food", confidence: 0.97,
    }),
  ],
};
