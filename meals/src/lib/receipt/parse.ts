import "server-only";
import { aiEnabled, structuredResponse, type ImageInput } from "@/lib/ai/openai";
import {
  RECEIPT_SYSTEM_PROMPT,
  parsedReceiptSchema,
  receiptJsonSchema,
  type ParsedReceipt,
} from "@/lib/receipt/schema";
import { postProcess } from "@/lib/receipt/normalize";
import { fixtureParsedReceipt } from "@/fixtures/trader-joes-receipt";

export type ParserKind = "openai" | "fixture";

export interface ParseOutcome {
  receipt: ParsedReceipt;
  parser: ParserKind;
  /** Non-fatal problems worth telling the user about. */
  warnings: string[];
}

export class ReceiptParseError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "ReceiptParseError";
  }
}

/** Which parser will run, given the current configuration. */
export function activeParser(): ParserKind {
  const forced = process.env.RECEIPT_PARSER;
  if (forced === "fixture") return "fixture";
  if (forced === "openai") return "openai";
  return aiEnabled() ? "openai" : "fixture";
}

const USER_PROMPT = `Transcribe this grocery receipt.

Return every purchasable product line. Preserve raw_name exactly as printed.
Classify each line: human_food, non_food, pet_food, or uncertain.
If a price or a whole line is illegible, say so with a low confidence and an
uncertain_reason rather than guessing a product.`;

/**
 * Parse a receipt image.
 *
 * With OPENAI_API_KEY set this runs the real vision pipeline. Without it, the
 * built-in Trader Joe's fixture is returned so the rest of the loop stays
 * exercisable offline — the result is labelled `fixture` all the way to the UI
 * so nobody mistakes it for a reading of their own receipt.
 */
export async function parseReceiptImage(image: ImageInput): Promise<ParseOutcome> {
  if (activeParser() === "fixture") {
    return {
      receipt: postProcess(fixtureParsedReceipt),
      parser: "fixture",
      warnings: [
        "Offline demo parser: this is the bundled Trader Joe's fixture, not a reading of your image. Set OPENAI_API_KEY to parse real receipts.",
      ],
    };
  }

  let raw: unknown;
  try {
    raw = await structuredResponse<unknown>({
      system: RECEIPT_SYSTEM_PROMPT,
      prompt: USER_PROMPT,
      schemaName: "parsed_receipt",
      schema: receiptJsonSchema as unknown as Record<string, unknown>,
      image,
      maxOutputTokens: 8000,
    });
  } catch (error) {
    throw new ReceiptParseError(
      `receipt vision call failed: ${(error as Error).message}`,
      "We couldn't read that receipt. Try a straighter, better-lit photo of the whole receipt.",
    );
  }

  const validated = parsedReceiptSchema.safeParse(raw);
  if (!validated.success) {
    throw new ReceiptParseError(
      `receipt failed schema validation: ${validated.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      "That receipt came back in a shape we couldn't use. Try scanning it again.",
    );
  }

  const receipt = postProcess(validated.data);
  const warnings: string[] = [];
  if (receipt.items.length === 0) {
    warnings.push("No product lines were found on this receipt.");
  }
  if (receipt.total === null) {
    warnings.push("The total wasn't legible, so it hasn't been recorded.");
  }

  return { receipt, parser: "openai", warnings };
}
