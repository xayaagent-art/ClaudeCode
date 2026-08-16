import "server-only";
import { getDb } from "@/lib/db";
import { addDays, todayISO } from "@/lib/date";
import { HOUSEHOLD_ID } from "@/lib/seed";
import { ReceiptParseError, activeParser, parseReceiptImage } from "@/lib/receipt/parse";
import { bucketItems, estimateShelfLifeDays, mergeForInventory } from "@/lib/receipt/normalize";
import { storeReceiptImage } from "@/lib/receipt/storage";
import type { Receipt, ReceiptItem } from "@/lib/types";

export interface IngestResult {
  receipt: Receipt;
  items: ReceiptItem[];
  parser: "openai" | "fixture";
  warnings: string[];
}

/** Upload → parse → persist. Stage 1 of the two-stage import. */
export async function ingestReceipt(bytes: Buffer, mimeType: string): Promise<IngestResult> {
  const db = getDb();
  const imagePath = await storeReceiptImage(bytes, mimeType);

  const receipt = await db.createReceipt({
    household_id: HOUSEHOLD_ID,
    merchant: null,
    purchase_date: null,
    currency: "USD",
    subtotal: null,
    tax: null,
    total: null,
    image_path: imagePath,
    processing_status: "parsing",
    parser: activeParser(),
    error_message: null,
  });

  try {
    const outcome = await parseReceiptImage({ base64: bytes.toString("base64"), mimeType });
    const parsed = outcome.receipt;

    const updated = await db.updateReceipt(receipt.id, {
      merchant: parsed.merchant,
      purchase_date: parsed.purchase_date,
      currency: parsed.currency,
      subtotal: parsed.subtotal,
      tax: parsed.tax,
      total: parsed.total,
      processing_status: outcome.warnings.length > 0 ? "partially_parsed" : "parsed",
      parser: outcome.parser,
    });

    const items = await db.replaceReceiptItems(
      receipt.id,
      parsed.items.map((item) => ({
        receipt_id: receipt.id,
        raw_name: item.raw_name,
        normalized_name: item.normalized_name,
        quantity: item.quantity,
        package_size: item.package_size,
        price: item.price,
        category: item.category,
        storage_location: item.storage_location,
        classification: item.classification,
        confidence: item.confidence,
        matched_food_id: null,
        included: item.classification === "human_food" || item.classification === "uncertain",
        notes: item.uncertain_reason,
      })),
    );

    return { receipt: updated, items, parser: outcome.parser, warnings: outcome.warnings };
  } catch (error) {
    const message =
      error instanceof ReceiptParseError ? error.userMessage : "Something went wrong reading that receipt.";
    await db.updateReceipt(receipt.id, {
      processing_status: "failed",
      error_message: message,
    });
    throw error;
  }
}

export interface ConfirmResult {
  added: number;
  skipped: number;
}

/**
 * Turn reviewed receipt lines into kitchen inventory.
 * Only human food is added; non-food and pet food stay on the receipt record.
 */
export async function confirmReceipt(receiptId: string): Promise<ConfirmResult> {
  const db = getDb();
  const receipt = await db.getReceipt(receiptId);
  if (!receipt) throw new Error("Unknown receipt");

  const items = await db.listReceiptItems(receiptId);
  const eligible = items.filter(
    (item) => item.included && item.classification !== "non_food" && item.classification !== "pet_food",
  );

  const purchaseDate = receipt.purchase_date ?? todayISO();
  const merged = mergeForInventory(eligible);

  const created = await db.addInventoryItems(
    merged.map((item) => ({
      normalized_name: item.normalized_name,
      raw_name: item.raw_name,
      category: item.category,
      storage_location: item.storage_location,
      quantity: item.quantity,
      package_size: item.package_size,
      status: "full" as const,
      purchase_date: purchaseDate,
      estimated_expiry: addDays(
        purchaseDate,
        estimateShelfLifeDays(item.normalized_name, item.storage_location),
      ),
      nutrition_food_id: null,
      nutrition_source: null,
      nutrition_confidence: null,
      calories_per_100g: null,
      protein_per_100g: null,
      serving_size: null,
      confidence: item.confidence,
      receipt_item_id: item.id,
      receipt_id: receiptId,
    })),
  );

  for (const item of created) {
    await db.addInventoryEvent({
      inventory_item_id: item.id,
      event_type: "receipt_added",
      from_status: null,
      to_status: item.status,
      detail: `Added from ${receipt.merchant ?? "receipt"}`,
    });
  }

  await db.updateReceipt(receiptId, { processing_status: "confirmed" });

  return { added: created.length, skipped: items.length - eligible.length };
}

/** Review-screen grouping, computed from persisted rows so edits are reflected. */
export function groupForReview(items: ReceiptItem[]) {
  return bucketItems(
    items.map((item) => ({
      raw_name: item.raw_name,
      normalized_name: item.normalized_name,
      quantity: item.quantity,
      package_size: item.package_size,
      price: item.price,
      category: item.category,
      storage_location: item.storage_location,
      classification: item.classification,
      confidence: item.confidence,
      uncertain_reason: item.notes,
    })),
  );
}
