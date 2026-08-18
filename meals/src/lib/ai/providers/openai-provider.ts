import "server-only";
import { AIFailure } from "@/lib/ai/failure";
import { structuredCall, resetOpenAIClient as resetClient } from "@/lib/ai/openai-call";
import {
  openAIModelFor,
  openAIModelHint,
  resetOpenAIModelCatalogue,
} from "@/lib/ai/openai-models";
import {
  AIConfigurationError,
  type AIProvider,
  type ImageInput,
  type ReceiptParseResult,
} from "@/lib/ai/provider";
import { postProcess } from "@/lib/receipt/normalize";
import { validateParsedReceipt } from "@/lib/receipt/validate";
import { RECEIPT_SYSTEM_PROMPT, receiptJsonSchema } from "@/lib/receipt/schema";

/**
 * Real multimodal receipt parsing.
 *
 * One image, one call, strict structured output, validated before anything is
 * persisted. No household history is sent — the parser's job is to read the
 * paper, and shipping context would cost tokens without improving transcription.
 *
 * The whole module is server-only: the key is read from the process
 * environment, never passed in, so there is no path by which a browser bundle
 * could obtain it.
 */

/** Test seam: neither the client nor a discovered model may outlive a changed key. */
export function resetOpenAIClient(): void {
  resetClient();
  resetOpenAIModelCatalogue();
}

const USER_PROMPT = `Transcribe this grocery receipt.

The photo may be rotated, skewed, shadowed, slightly blurred, or a long receipt
photographed at an angle. Read it as best you can.

Return every purchasable product line. Preserve raw_name exactly as printed.
Classify each line: human_food, non_food, pet_food, or uncertain.
Use null for any value you cannot read; never guess a price or a product.
If a line is illegible, include it with low confidence and an uncertain_reason.
If the image is not a receipt at all, return an empty items array.`;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  /**
   * Synchronous, so it can only ever be a hint: the real id is resolved against
   * the live catalogue at call time and reported in the parse result, which is
   * what telemetry records.
   */
  modelName(): string {
    return openAIModelHint("receipt_vision");
  }

  assertReady(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new AIConfigurationError(
        "AI_PROVIDER=openai but OPENAI_API_KEY is not set",
        "Receipt scanning isn't configured on the server yet.",
      );
    }
  }

  async parseReceipt(image: ImageInput): Promise<ReceiptParseResult> {
    this.assertReady();
    const model = await openAIModelFor("receipt_vision");

    const result = await structuredCall({
      model,
      system: RECEIPT_SYSTEM_PROMPT,
      prompt: USER_PROMPT,
      image,
      schemaName: "parsed_receipt",
      schema: receiptJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 8000,
      // Reading a receipt is transcription. There is nothing to reason about,
      // and every token spent thinking is a token not spent on a line item.
      reasoning: "minimal",
    });

    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch {
      // Truncation and genuine malformation look alike at the JSON layer; the
      // response status tells us which happened, and the advice differs.
      throw new AIFailure(
        result.truncated ? "truncated" : "schema_invalid",
        "model reply was not valid JSON",
      );
    }

    const validated = validateParsedReceipt(raw);
    const receipt = postProcess(validated.receipt);

    // Nothing purchasable found: a photo of a wall, a blank slip, or a receipt
    // too blurred to read. Not something a retry of the same photo will fix.
    if (receipt.items.length === 0) {
      throw new AIFailure("unreadable", "model returned no product lines");
    }

    const warnings: string[] = [];
    if (validated.dropped > 0) {
      warnings.push(
        validated.dropped === 1
          ? "One line couldn't be read and was left off. Check the receipt photo if something's missing."
          : `${validated.dropped} lines couldn't be read and were left off. Check the receipt photo if something's missing.`,
      );
      // Paths only — the failing values could be receipt contents.
      // eslint-disable-next-line no-console
      console.warn("[receipt] dropped lines:", validated.issues.join("; "));
    }
    if (receipt.total === null) {
      warnings.push("The total wasn't legible, so it hasn't been recorded.");
    }
    if (result.truncated) {
      warnings.push("This receipt was long enough that the end may be missing.");
    }

    return {
      receipt,
      model: result.model,
      usage: result.usage,
      warnings,
      attempts: result.attempts,
      dropped_items: validated.dropped,
    };
  }
}
