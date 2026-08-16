import type { Classification, ProductMapping, StorageLocation } from "@/lib/types";
import type { ParsedReceiptItem } from "@/lib/receipt/schema";

/**
 * Store-specific product mappings.
 *
 * Receipts are repetitive: the same household buys the same abbreviated lines
 * from the same shops. Once a human has told us "HERB GOAT LOG" is herbed goat
 * cheese at Trader Joe's, we should never ask again — and never spend a model
 * call on it either.
 *
 * Nothing here is retailer-specific. The merchant is just a key.
 */

/** Normalise a merchant name into a stable lookup key. */
export function merchantKey(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const key = merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return key.length > 0 ? key : null;
}

/** Normalise a raw receipt line into a stable lookup key. */
export function rawKey(rawName: string): string {
  return rawName.toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * A mapping is only trusted enough to bypass review when a human confirmed it,
 * or when the model was very sure and we have seen the line repeatedly.
 */
export function isTrusted(mapping: ProductMapping): boolean {
  if (mapping.source === "user_correction") return true;
  return mapping.confidence >= 0.9 && mapping.times_seen >= 2;
}

export interface MappingIndex {
  /** Exact merchant + line match. */
  scoped: Map<string, ProductMapping>;
  /** Line match learned at any store, used only as a weaker fallback. */
  global: Map<string, ProductMapping>;
}

export function indexMappings(mappings: ProductMapping[]): MappingIndex {
  const scoped = new Map<string, ProductMapping>();
  const global = new Map<string, ProductMapping>();

  for (const mapping of mappings) {
    const line = rawKey(mapping.raw_name);
    if (mapping.merchant) {
      scoped.set(`${mapping.merchant}::${line}`, mapping);
    } else {
      global.set(line, mapping);
    }
  }
  return { scoped, global };
}

/** Find the best mapping for a raw line at a merchant, if any. */
export function lookupMapping(
  index: MappingIndex,
  merchant: string | null,
  rawName: string,
): ProductMapping | null {
  const line = rawKey(rawName);
  const key = merchantKey(merchant);
  if (key) {
    const scoped = index.scoped.get(`${key}::${line}`);
    if (scoped) return scoped;
  }
  return index.global.get(line) ?? null;
}

export interface MappingApplication {
  items: ParsedReceiptItem[];
  /** Raw lines that a known mapping resolved, for telemetry and debugging. */
  applied: string[];
}

/**
 * Overlay known mappings onto a parse.
 *
 * A trusted mapping replaces the model's normalisation and lifts confidence, so
 * a line the user has already corrected stops landing in Needs Review. An
 * untrusted mapping is left alone — it is a hint, not an authority.
 */
export function applyMappings(
  items: ParsedReceiptItem[],
  index: MappingIndex,
  merchant: string | null,
): MappingApplication {
  const applied: string[] = [];

  const mapped = items.map((item) => {
    const mapping = lookupMapping(index, merchant, item.raw_name);
    if (!mapping || !isTrusted(mapping)) return item;

    applied.push(item.raw_name);
    return {
      ...item,
      normalized_name: mapping.normalized_name,
      category: mapping.category ?? item.category,
      storage_location: (mapping.storage_location ?? item.storage_location) as StorageLocation,
      classification: mapping.classification as Classification,
      // A human-confirmed mapping is certain; a repeatedly-seen model one is not
      // promoted beyond what it already earned.
      confidence: mapping.source === "user_correction" ? 1 : Math.max(item.confidence, mapping.confidence),
      uncertain_reason: mapping.source === "user_correction" ? null : item.uncertain_reason,
    };
  });

  return { items: mapped, applied };
}

/** The mapping a user correction should create or update. */
export function mappingFromCorrection(input: {
  merchant: string | null;
  raw_name: string;
  normalized_name: string;
  category: string | null;
  storage_location: StorageLocation | null;
  classification: Classification;
}): Omit<ProductMapping, "id" | "household_id" | "created_at" | "updated_at" | "times_seen"> {
  return {
    merchant: merchantKey(input.merchant),
    raw_name: rawKey(input.raw_name),
    normalized_name: input.normalized_name.trim(),
    category: input.category,
    storage_location: input.storage_location,
    classification: input.classification,
    confidence: 1,
    source: "user_correction",
  };
}
