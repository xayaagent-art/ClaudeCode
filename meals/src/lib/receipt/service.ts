import "server-only";
import { getDb } from "@/lib/db";
import { addDays, todayISO } from "@/lib/date";
import { HOUSEHOLD_ID } from "@/lib/seed";
import { activeProviderName } from "@/lib/ai";
import { ReceiptParseError, activeParser, hashImage, parseReceiptImage } from "@/lib/receipt/parse";
import {
  bucketItems,
  confidenceBand,
  estimateShelfLifeDays,
  mergeForInventory,
  needsReview,
} from "@/lib/receipt/normalize";
import { applyMappings, indexMappings, mappingFromCorrection } from "@/lib/receipt/mappings";
import { decideRestock } from "@/lib/kitchen/restock";
import { shelfLifeDays } from "@/lib/kitchen/freshness";
import { adjustShelfLife, buildProductSignals } from "@/lib/kitchen/signals";
import { canonicalName } from "@/lib/kitchen/match";
import { storeReceiptImage } from "@/lib/receipt/storage";
import type { Classification, Receipt, ReceiptItem, StorageLocation } from "@/lib/types";

export interface IngestResult {
  receipt: Receipt;
  items: ReceiptItem[];
  parser: "openai" | "fixture";
  warnings: string[];
  /** Set when this exact image was already processed. */
  duplicate_of: string | null;
  /** Raw lines resolved from a learned store mapping rather than the model. */
  mappings_applied: string[];
}

/**
 * Upload → parse → persist. Stage 1 of the two-stage import.
 *
 * Ordering matters: the image is hashed first so a re-upload of the same photo
 * is recognised before any money is spent on a model call.
 */
export async function ingestReceipt(bytes: Buffer, mimeType: string): Promise<IngestResult> {
  const db = getDb();
  const imageHash = hashImage(bytes);

  // Cost control: the same photo does not get parsed twice.
  const existing = await db.findReceiptByHash(imageHash);
  if (existing && existing.processing_status !== "failed") {
    const items = await db.listReceiptItems(existing.id);
    return {
      receipt: existing,
      items,
      parser: existing.parser ?? activeParser(),
      warnings: ["We've already read this receipt — showing the previous result."],
      duplicate_of: existing.id,
      mappings_applied: [],
    };
  }

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
    image_hash: imageHash,
    processing_status: "parsing",
    parser: activeParser(),
    error_message: null,
  });

  const startedAt = Date.now();

  try {
    const outcome = await parseReceiptImage({ base64: bytes.toString("base64"), mimeType });
    const parsed = outcome.receipt;

    // Store-specific learning: a line the household has already corrected is
    // resolved from the mapping table, not from whatever the model said.
    const index = indexMappings(await db.listMappings());
    const { items: mappedItems, applied } = applyMappings(parsed.items, index, parsed.merchant);

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
      mappedItems.map((item) => ({
        receipt_id: receipt.id,
        raw_name: item.raw_name,
        normalized_name: item.normalized_name,
        quantity: item.quantity,
        package_size: item.package_size,
        unit_price: item.unit_price,
        price: item.total_price,
        category: item.category,
        storage_location: item.storage_location,
        classification: item.classification,
        confidence: item.confidence,
        matched_food_id: null,
        // Only human food is pre-selected. Uncertain lines are included but land
        // in Needs Review, so nothing questionable reaches the kitchen silently.
        included: item.classification === "human_food" || item.classification === "uncertain",
        notes: item.uncertain_reason,
      })),
    );

    const buckets = bucketItems(mappedItems);
    await db.addTelemetry({
      receipt_id: receipt.id,
      provider: activeProviderName(),
      model: outcome.model,
      latency_ms: outcome.latency_ms,
      input_tokens: outcome.usage?.input_tokens ?? null,
      output_tokens: outcome.usage?.output_tokens ?? null,
      total_tokens: outcome.usage?.total_tokens ?? null,
      estimated_cost_usd: outcome.usage?.estimated_cost_usd ?? null,
      item_count: mappedItems.length,
      high_confidence_count: buckets.ready.length,
      needs_review_count: buckets.review.length,
      excluded_count: buckets.excluded.length,
      success: true,
      error_kind: null,
    });

    return {
      receipt: updated,
      items,
      parser: outcome.parser,
      warnings: outcome.warnings,
      duplicate_of: null,
      mappings_applied: applied,
    };
  } catch (error) {
    const message =
      error instanceof ReceiptParseError
        ? error.userMessage
        : "We couldn't read this receipt. Try again, or choose another photo.";

    await db.updateReceipt(receipt.id, {
      processing_status: "failed",
      error_message: message,
    });

    await db.addTelemetry({
      receipt_id: receipt.id,
      provider: activeProviderName(),
      model: "unknown",
      latency_ms: Date.now() - startedAt,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      estimated_cost_usd: null,
      item_count: 0,
      high_confidence_count: 0,
      needs_review_count: 0,
      excluded_count: 0,
      success: false,
      // The class name only — never the prompt or the image contents.
      error_kind: (error as Error).name || "Error",
    });

    throw error;
  }
}

export interface ConfirmResult {
  added: number;
  skipped: number;
  /** Existing items refilled rather than duplicated. */
  restocked: number;
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
    (item) =>
      item.included &&
      item.classification !== "non_food" &&
      item.classification !== "pet_food" &&
      // Trust over recall: an unresolved uncertain line never enters inventory.
      item.classification !== "uncertain",
  );

  const purchaseDate = receipt.purchase_date ?? todayISO();
  const merged = mergeForInventory(eligible);

  // Restock intelligence: buying spinach again when spinach is Low refills the
  // item you have rather than creating a second "Spinach" row. Two genuinely
  // different products keep separate rows.
  const [existingInventory, existingEvents] = await Promise.all([
    db.listInventory(),
    db.listInventoryEvents(400),
  ]);
  const signals = buildProductSignals(existingInventory, existingEvents);

  const toCreate: typeof merged = [];
  let restocked = 0;

  for (const item of merged) {
    const decision = decideRestock(
      {
        normalized_name: item.normalized_name,
        category: item.category,
        package_size: item.package_size,
        quantity: item.quantity,
      },
      existingInventory,
    );

    if (decision.kind === "new_product") {
      toCreate.push(item);
      continue;
    }

    const base = shelfLifeDays(item.normalized_name, item.storage_location, item.category);
    const { days } = adjustShelfLife(base, signals.get(canonicalName(item.normalized_name)));

    await db.updateInventoryItem(decision.target.id, {
      status: decision.newStatus,
      quantity: decision.target.quantity + item.quantity,
      purchase_date: purchaseDate,
      estimated_expiry: addDays(purchaseDate, days),
      status_confidence: 0.95,
      status_source: "receipt",
      package_size: item.package_size ?? decision.target.package_size,
    });

    await db.addInventoryEvent({
      inventory_item_id: decision.target.id,
      event_type: "restocked",
      from_status: decision.target.status,
      to_status: decision.newStatus,
      detail: `Restocked from ${receipt.merchant ?? "receipt"} — ${decision.reason}`,
    });
    restocked += 1;
  }

  const created = await db.addInventoryItems(
    toCreate.map((item) => {
      const base = shelfLifeDays(item.normalized_name, item.storage_location, item.category);
      const { days } = adjustShelfLife(base, signals.get(canonicalName(item.normalized_name)));
      return {
        normalized_name: item.normalized_name,
        raw_name: item.raw_name,
        category: item.category,
        storage_location: item.storage_location,
        quantity: item.quantity,
        package_size: item.package_size,
        status: "full" as const,
        purchase_date: purchaseDate,
        estimated_expiry: addDays(purchaseDate, days),
        nutrition_food_id: null,
        nutrition_source: null,
        nutrition_confidence: null,
        calories_per_100g: null,
        protein_per_100g: null,
        serving_size: null,
        confidence: item.confidence,
        // Watching it come into the house is nearly as good as being told.
        status_confidence: 0.95,
        last_confirmed_at: null,
        status_source: "receipt" as const,
        receipt_item_id: item.id,
        receipt_id: receiptId,
      };
    }),
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

  return { added: created.length, restocked, skipped: items.length - eligible.length };
}

/**
 * Record a user's correction to a receipt line as a reusable store mapping, so
 * the same abbreviation resolves itself on the next shop.
 */
export async function learnFromCorrection(
  receiptId: string,
  item: ReceiptItem,
  patch: {
    normalized_name?: string;
    category?: string;
    storage_location?: StorageLocation;
    classification?: Classification;
  },
): Promise<void> {
  const db = getDb();
  const receipt = await db.getReceipt(receiptId);
  if (!receipt) return;

  // Only a rename or a reclassification is worth learning; a quantity edit is
  // specific to one shopping trip.
  if (!patch.normalized_name && !patch.classification) return;

  await db.upsertMapping(
    mappingFromCorrection({
      merchant: receipt.merchant,
      raw_name: item.raw_name,
      normalized_name: patch.normalized_name ?? item.normalized_name,
      category: patch.category ?? item.category,
      storage_location: patch.storage_location ?? item.storage_location,
      classification: patch.classification ?? item.classification,
    }),
  );
}

/** Review-screen grouping, computed from persisted rows so edits are reflected. */
export function groupForReview(items: ReceiptItem[]) {
  return bucketItems(
    items.map((item) => ({
      raw_name: item.raw_name,
      normalized_name: item.normalized_name,
      quantity: item.quantity,
      package_size: item.package_size,
      unit_price: item.unit_price,
      total_price: item.price,
      category: item.category,
      storage_location: item.storage_location,
      classification: item.classification,
      confidence: item.confidence,
      uncertain_reason: item.notes,
    })),
  );
}

export { confidenceBand, needsReview };
