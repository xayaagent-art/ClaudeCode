import "server-only";
import OpenAI from "openai";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { AIFailure } from "@/lib/ai/failure";
import { withRetry } from "@/lib/ai/retry";
import {
  AIConfigurationError,
  type AIProvider,
  type AIUsage,
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

let client: OpenAI | null = null;

/** Wall-clock ceiling for a single attempt. A long receipt at high detail is slow. */
function timeoutMs(): number {
  const configured = Number(process.env.OPENAI_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 60_000;
}

function missingKey(): AIConfigurationError {
  return new AIConfigurationError(
    "AI_PROVIDER=openai but OPENAI_API_KEY is not set",
    "Receipt scanning isn't configured on the server yet.",
  );
}

function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw missingKey();
    // maxRetries: 0 hands retry policy to withRetry, so backoff and the retry
    // count are ours to reason about and to test.
    client = new OpenAI({ apiKey, maxRetries: 0, timeout: timeoutMs() });
  }
  return client;
}

/** Test seam: the memoised client must not outlive a changed key. */
export function resetOpenAIClient(): void {
  client = null;
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

  modelName(): string {
    // A receipt is transcription, not reasoning. The model is configurable so a
    // cheaper one can be used without touching code.
    return process.env.OPENAI_RECEIPT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5";
  }

  assertReady(): void {
    if (!process.env.OPENAI_API_KEY) throw missingKey();
  }

  async parseReceipt(image: ImageInput): Promise<ReceiptParseResult> {
    this.assertReady();
    const model = this.modelName();

    const { value: text, attempts } = await withRetry(async () => this.callModel(image, model));

    let raw: unknown;
    try {
      raw = JSON.parse(text.output);
    } catch {
      // Truncation and genuine malformation look alike at the JSON layer; the
      // response status tells us which happened, and the advice differs.
      throw new AIFailure(
        text.truncated ? "truncated" : "schema_invalid",
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
    if (text.truncated) {
      warnings.push("This receipt was long enough that the end may be missing.");
    }

    return {
      receipt,
      model,
      usage: text.usage,
      warnings,
      attempts,
      dropped_items: validated.dropped,
    };
  }

  /** One attempt. Everything here is retryable-or-not by classification alone. */
  private async callModel(
    image: ImageInput,
    model: string,
  ): Promise<{ output: string; usage: AIUsage; truncated: boolean }> {
    const response = await openai().responses.create(
      {
        model,
        instructions: RECEIPT_SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: USER_PROMPT },
              {
                type: "input_image",
                image_url: `data:${image.mimeType};base64,${image.base64}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema" as const,
            name: "parsed_receipt",
            strict: true,
            schema: receiptJsonSchema as unknown as Record<string, unknown>,
          },
        },
        max_output_tokens: 8000,
      },
      { timeout: timeoutMs() },
    );

    const truncated =
      response.status === "incomplete" &&
      response.incomplete_details?.reason === "max_output_tokens";

    const output = response.output_text;
    if (!output) {
      throw new AIFailure(
        truncated ? "truncated" : "api_error",
        truncated ? "reply hit max_output_tokens" : "model returned no output",
      );
    }

    const inputTokens = response.usage?.input_tokens ?? null;
    const outputTokens = response.usage?.output_tokens ?? null;

    return {
      output,
      truncated,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: response.usage?.total_tokens ?? null,
        estimated_cost_usd: estimateCostUsd(model, inputTokens, outputTokens),
      },
    };
  }
}
