import { describe, expect, it } from "vitest";
import { parsedReceiptSchema, type ParsedReceiptItem } from "@/lib/receipt/schema";
import {
  bucketItems,
  confidenceBand,
  estimateShelfLifeDays,
  mergeForInventory,
  needsReview,
  postProcess,
} from "@/lib/receipt/normalize";
import { fixtureParsedReceipt, receiptLines } from "@/fixtures/trader-joes-receipt";

const processed = postProcess(fixtureParsedReceipt);

function itemNamed(raw: string): ParsedReceiptItem {
  const found = processed.items.find((item) => item.raw_name === raw);
  if (!found) throw new Error(`fixture is missing ${raw}`);
  return found;
}

describe("receipt parsing contract", () => {
  it("validates the fixture against the parse schema", () => {
    const result = parsedReceiptSchema.safeParse(fixtureParsedReceipt);
    expect(result.success).toBe(true);
  });

  it("preserves raw receipt names verbatim through post-processing", () => {
    for (const item of processed.items) {
      expect(receiptLines.some((line) => line.text === item.raw_name)).toBe(true);
    }
    expect(itemNamed("ONIONS RED ORG 2 LB").normalized_name).toBe("Organic Red Onions");
  });

  it("drops register lines that are not products", () => {
    expect(processed.items.some((item) => item.raw_name === "BAG FEE")).toBe(false);
  });

  it("tolerates a line with no legible price", () => {
    const spinach = itemNamed("ORG BABY SPINACH 16OZ");
    expect(spinach.price).toBeNull();
    // A smudged price must not drag down confidence in the product itself.
    expect(spinach.classification).toBe("human_food");
  });

  it("keeps duplicate receipt lines distinct on the receipt", () => {
    const squash = processed.items.filter((item) => item.raw_name === "YELLOW SQUASH EA");
    expect(squash).toHaveLength(2);
  });

  it("merges duplicate lines into a single inventory entry", () => {
    const merged = mergeForInventory(
      processed.items.map((item) => ({
        normalized_name: item.normalized_name,
        quantity: item.quantity,
      })),
    );
    const squash = merged.filter((item) => item.normalized_name === "Yellow Squash");
    expect(squash).toHaveLength(1);
    expect(squash[0].quantity).toBe(2);
  });

  it("does not merge two different products that read alike", () => {
    const merged = mergeForInventory(
      processed.items.map((item) => ({
        normalized_name: item.normalized_name,
        quantity: item.quantity,
      })),
    );
    const names = merged.map((item) => item.normalized_name);
    expect(names).toContain("Tomato Feta Soup");
    expect(names).toContain("Creamy Tomato Basil Soup");
    expect(names).toContain("Organic Red Onions");
    expect(names).toContain("English Cheddar With Caramelized Onion");
  });

  it("keeps every food line from the fixture, one entry per distinct product", () => {
    const foodLines = processed.items.filter((item) => item.classification === "human_food");
    const merged = mergeForInventory(
      foodLines.map((item) => ({
        normalized_name: item.normalized_name,
        quantity: item.quantity,
      })),
    );
    // 25 food lines, of which the two yellow squash rows are one product.
    expect(foodLines).toHaveLength(25);
    expect(merged).toHaveLength(24);
  });
});

describe("receipt classification", () => {
  it("keeps non-food and pet food out of meal inventory", () => {
    const { ready, review, excluded } = bucketItems(processed.items);
    const plannable = [...ready, ...review].map((item) => item.normalized_name);

    expect(plannable).not.toContain("Hand Sanitizer");
    expect(plannable).not.toContain("Lamb And Rice Canned Dog Food");
    expect(excluded.map((item) => item.classification)).toEqual(
      expect.arrayContaining(["non_food", "pet_food"]),
    );
  });

  it("demotes a mislabelled non-food line rather than trusting the parse", () => {
    const [reclassified] = postProcess({
      ...fixtureParsedReceipt,
      items: [
        {
          raw_name: "DISH SOAP LEMON 16OZ",
          normalized_name: "Lemon Dish Soap",
          quantity: 1,
          package_size: "16 oz",
          price: 3.49,
          category: "Pantry",
          storage_location: "Pantry",
          classification: "human_food",
          confidence: 0.95,
          uncertain_reason: null,
        },
      ],
    }).items;

    expect(reclassified.classification).toBe("non_food");
  });

  it("never promotes a line the parser flagged as not food", () => {
    const [item] = postProcess({
      ...fixtureParsedReceipt,
      items: [
        {
          raw_name: "MYSTERY BOX",
          normalized_name: "Mystery Box",
          quantity: 1,
          package_size: null,
          price: 1,
          category: "Other",
          storage_location: "Pantry",
          classification: "non_food",
          confidence: 0.9,
          uncertain_reason: null,
        },
      ],
    }).items;

    expect(item.classification).toBe("non_food");
  });
});

describe("ambiguity handling", () => {
  it("routes low-confidence and flagged lines to review", () => {
    const { ready, review } = bucketItems(processed.items);
    const reviewNames = review.map((item) => item.normalized_name);

    expect(reviewNames).toContain("Herbed Goat Cheese");
    expect(ready.map((item) => item.normalized_name)).toContain("Organic Red Onions");
  });

  it("bands confidence without inventing precision", () => {
    expect(confidenceBand(0.98)).toBe("high");
    expect(confidenceBand(0.64)).toBe("medium");
    expect(confidenceBand(0.3)).toBe("low");
    expect(needsReview({ ...itemNamed("HERB GOAT LOG 8OZ") })).toBe(true);
    expect(needsReview({ ...itemNamed("ONIONS RED ORG 2 LB") })).toBe(false);
  });
});

describe("shelf life estimates", () => {
  it("gives perishables a short window and pantry goods a long one", () => {
    expect(estimateShelfLifeDays("Organic Baby Spinach", "Fridge")).toBeLessThanOrEqual(7);
    expect(estimateShelfLifeDays("Tomato Basil Marinara", "Pantry")).toBeGreaterThan(100);
    expect(estimateShelfLifeDays("Vanilla Ice Cream", "Freezer")).toBeGreaterThan(30);
  });
});
