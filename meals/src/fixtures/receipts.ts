import type { ParsedReceipt } from "@/lib/receipt/schema";
import { fixtureParsedReceipt, FIXTURE_MERCHANT } from "@/fixtures/trader-joes-receipt";

/**
 * Receipt fixture registry.
 *
 * Regression fixture #1 is the Trader Joe's receipt. To add another retailer:
 *
 *   1. drop a photo at public/fixtures/<id>-receipt.png
 *   2. add a module exporting its expected ParsedReceipt
 *   3. register it below
 *
 * Tests iterate this registry, so a new retailer is automatically covered by the
 * shared invariants (raw names preserved, non-food excluded, duplicates merged)
 * without any retailer-specific parsing logic anywhere in the app.
 */

export interface ReceiptFixture {
  id: string;
  merchant: string;
  /** Path under public/, when a rendered image exists for manual testing. */
  imagePath: string | null;
  parsed: ParsedReceipt;
}

export const receiptFixtures: ReceiptFixture[] = [
  {
    id: "trader-joes",
    merchant: FIXTURE_MERCHANT,
    imagePath: "/fixtures/trader-joes-receipt.png",
    parsed: fixtureParsedReceipt,
  },
];

export function fixtureFor(id: string): ReceiptFixture | undefined {
  return receiptFixtures.find((fixture) => fixture.id === id);
}

export function listFixtures(): string[] {
  return receiptFixtures.map((fixture) => fixture.id);
}
