import "server-only";
import { AIFailure } from "@/lib/ai/failure";
import { generateContent, toGeminiSchema } from "@/lib/ai/gemini";
import { modelFor, shouldEscalateReceipt } from "@/lib/ai/models";
import {
  AIConfigurationError,
  type AIProvider,
  type ImageInput,
  type ReceiptParseResult,
} from "@/lib/ai/provider";
import { confidenceDistribution, postProcess } from "@/lib/receipt/normalize";
import { validateParsedReceipt } from "@/lib/receipt/validate";
import { RECEIPT_SYSTEM_PROMPT, receiptJsonSchema } from "@/lib/receipt/schema";
import type { ParsedReceipt } from "@/lib/receipt/schema";

/**
 * Receipt parsing on Gemini.
 *
 * This is a provider swap, not a new pipeline: the prompt, the JSON contract,
 * the per-line validation, the post-processing and the failure taxonomy are all
 * the same code the OpenAI provider runs. Only the call changes.
 *
 * The one thing that is genuinely different is cost shape. Flash-Lite is cheap
 * enough to be the default for every receipt, and the expensive model is only
 * reached when deterministic checks say the cheap read actually failed — never
 * speculatively, and never because a few lines came back uncertain.
 */

const USER_PROMPT = `Transcribe this grocery receipt.

The photo may be rotated, skewed, shadowed, slightly blurred, or a long receipt
photographed at an angle. Read it as best you can.

Return every purchasable product line. Preserve raw_name exactly as printed.
Classify each line: human_food, non_food, pet_food, or uncertain.
Use null for any value you cannot read; never guess a price or a product.
If a line is illegible, include it with low confidence and an uncertain_reason.
If the image is not a receipt at all, return an empty items array.`;

interface Attempt {
  receipt: ParsedReceipt;
  dropped: number;
  model: string;
  usage: ReceiptParseResult["usage"];
  attempts: number;
  truncated: boolean;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  modelName(): string {
    return modelFor("receipt_parse");
  }

  assertReady(): void {
    if (!process.env.GEMINI_API_KEY) {
      throw new AIConfigurationError(
        "AI_PROVIDER=gemini but GEMINI_API_KEY is not set",
        "Receipt scanning isn't configured on the server yet.",
      );
    }
  }

  async parseReceipt(image: ImageInput): Promise<ReceiptParseResult> {
    this.assertReady();

    const warnings: string[] = [];
    let result = await this.readWith(modelFor("receipt_parse"), image);
    let totalAttempts = result.attempts;

    const distribution = confidenceDistribution(result.receipt.items);
    const weak = shouldEscalateReceipt({
      itemCount: result.receipt.items.length,
      meanConfidence: distribution.mean,
      droppedItems: result.dropped,
    });

    if (weak) {
      const escalationModel = modelFor("receipt_escalation");
      // Only worth the money if it is actually a different model.
      if (escalationModel !== result.model) {
        try {
          const escalated = await this.readWith(escalationModel, image);
          totalAttempts += escalated.attempts;
          if (isBetter(escalated, result)) {
            result = escalated;
            warnings.push("This receipt was hard to read, so it was checked a second time.");
          }
        } catch {
          // The cheap read stands. An escalation that fails must not turn a
          // usable-but-weak parse into no parse at all.
          totalAttempts += 1;
        }
      }
    }

    if (result.receipt.items.length === 0) {
      throw new AIFailure("unreadable", "gemini returned no product lines");
    }

    if (result.dropped > 0) {
      warnings.push(
        result.dropped === 1
          ? "One line couldn't be read and was left off. Check the receipt photo if something's missing."
          : `${result.dropped} lines couldn't be read and were left off. Check the receipt photo if something's missing.`,
      );
    }
    if (result.receipt.total === null) {
      warnings.push("The total wasn't legible, so it hasn't been recorded.");
    }
    if (result.truncated) {
      warnings.push("This receipt was long enough that the end may be missing.");
    }

    return {
      receipt: result.receipt,
      model: result.model,
      usage: result.usage,
      warnings,
      attempts: totalAttempts,
      dropped_items: result.dropped,
    };
  }

  /** One full read at a given model: call, parse, validate, post-process. */
  private async readWith(model: string, image: ImageInput): Promise<Attempt> {
    const response = await generateContent({
      model,
      system: RECEIPT_SYSTEM_PROMPT,
      prompt: USER_PROMPT,
      image: { base64: image.base64, mimeType: image.mimeType },
      responseSchema: toGeminiSchema(receiptJsonSchema),
      maxOutputTokens: 8000,
      temperature: 0,
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.text);
    } catch {
      throw new AIFailure(
        response.truncated ? "truncated" : "schema_invalid",
        "gemini reply was not valid JSON",
      );
    }

    const validated = validateParsedReceipt(raw);
    return {
      receipt: postProcess(validated.receipt),
      dropped: validated.dropped,
      model: response.model,
      usage: response.usage,
      attempts: response.attempts,
      truncated: response.truncated,
    };
  }
}

/**
 * Did the second read actually improve on the first?
 *
 * More usable lines is the primary signal — a receipt where the cheap model saw
 * three items and the better one saw twenty was misread, not sparse. Equal
 * counts fall back to confidence.
 */
function isBetter(candidate: Attempt, incumbent: Attempt): boolean {
  if (candidate.receipt.items.length !== incumbent.receipt.items.length) {
    return candidate.receipt.items.length > incumbent.receipt.items.length;
  }
  const a = confidenceDistribution(candidate.receipt.items).mean ?? 0;
  const b = confidenceDistribution(incumbent.receipt.items).mean ?? 0;
  return a > b;
}
