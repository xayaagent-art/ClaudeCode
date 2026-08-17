import { z } from "zod";
import { AIFailure } from "@/lib/ai/failure";
import {
  type ParsedReceipt,
  type ParsedReceiptItem,
  parsedReceiptItemSchema,
  parsedReceiptSchema,
} from "@/lib/receipt/schema";

/**
 * Validation of a model reply, one line at a time.
 *
 * Whole-document validation is the wrong granularity for a receipt: one line
 * where the model emitted `"quantity": "two"` would throw away thirty perfectly
 * good ones and charge the household for a second call. Instead the envelope is
 * validated strictly, then each line independently — good lines are kept, bad
 * lines are dropped and counted, and the user is told how many went missing so
 * the result is never quietly short.
 */

/** The receipt minus its items, which are checked separately. */
const envelopeSchema = parsedReceiptSchema.omit({ items: true }).extend({
  items: z.array(z.unknown()),
});

export interface ValidationOutcome {
  receipt: ParsedReceipt;
  /** Lines the model returned that failed the contract. */
  dropped: number;
  /** Field paths that failed, for logs. Never contains receipt content. */
  issues: string[];
}

function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.join(".") || "(root)");
}

/**
 * Turn raw model JSON into a validated receipt.
 *
 * Throws `schema_invalid` when the reply is unusable — a broken envelope, or
 * items that all failed. A partial result is not an error: it comes back with a
 * `dropped` count for the caller to surface.
 */
export function validateParsedReceipt(raw: unknown): ValidationOutcome {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new AIFailure(
      "schema_invalid",
      `envelope failed validation: ${issuePaths(envelope.error).join(", ")}`,
    );
  }

  const items: ParsedReceiptItem[] = [];
  const issues: string[] = [];

  for (const [index, candidate] of envelope.data.items.entries()) {
    const item = parsedReceiptItemSchema.safeParse(candidate);
    if (item.success) {
      items.push(item.data);
      continue;
    }
    // The index locates the bad line without reproducing its text.
    issues.push(`items[${index}]: ${issuePaths(item.error).join("|")}`);
  }

  const dropped = envelope.data.items.length - items.length;

  // Every line failing means the model misunderstood the contract, not that the
  // receipt had thirty illegible lines. That is worth a retry.
  if (dropped > 0 && items.length === 0) {
    throw new AIFailure("schema_invalid", `all ${dropped} items failed validation`);
  }

  return {
    receipt: { ...envelope.data, items },
    dropped,
    issues,
  };
}
