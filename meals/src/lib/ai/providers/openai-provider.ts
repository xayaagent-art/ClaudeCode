import "server-only";
import OpenAI from "openai";
import { estimateCostUsd } from "@/lib/ai/pricing";
import {
  AIConfigurationError,
  type AIProvider,
  type AIUsage,
  type ImageInput,
  type ReceiptParseResult,
} from "@/lib/ai/provider";
import { postProcess } from "@/lib/receipt/normalize";
import {
  RECEIPT_SYSTEM_PROMPT,
  parsedReceiptSchema,
  receiptJsonSchema,
} from "@/lib/receipt/schema";

/**
 * Real multimodal receipt parsing.
 *
 * One image, one call, strict structured output, validated before anything is
 * persisted. No household history is sent — the parser's job is to read the
 * paper, and shipping context would cost tokens without improving transcription.
 */

let client: OpenAI | null = null;

function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIConfigurationError(
        "AI_PROVIDER=openai but OPENAI_API_KEY is not set",
        "Receipt scanning isn't configured on the server yet.",
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

const USER_PROMPT = `Transcribe this grocery receipt.

The photo may be rotated, skewed, shadowed, slightly blurred, or a long receipt
photographed at an angle. Read it as best you can.

Return every purchasable product line. Preserve raw_name exactly as printed.
Classify each line: human_food, non_food, pet_food, or uncertain.
Use null for any value you cannot read; never guess a price or a product.
If a line is illegible, include it with low confidence and an uncertain_reason.`;

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  modelName(): string {
    // A receipt is transcription, not reasoning. The model is configurable so a
    // cheaper one can be used without touching code.
    return process.env.OPENAI_RECEIPT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5";
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
    const model = this.modelName();

    const response = await openai().responses.create({
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
    });

    const text = response.output_text;
    if (!text) throw new Error("model returned no output");

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("model returned output that was not valid JSON");
    }

    const validated = parsedReceiptSchema.safeParse(raw);
    if (!validated.success) {
      throw new Error(
        `structured output failed validation: ${validated.error.issues
          .map((issue) => issue.path.join("."))
          .join(", ")}`,
      );
    }

    const inputTokens = response.usage?.input_tokens ?? null;
    const outputTokens = response.usage?.output_tokens ?? null;
    const usage: AIUsage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: response.usage?.total_tokens ?? null,
      estimated_cost_usd: estimateCostUsd(model, inputTokens, outputTokens),
    };

    const receipt = postProcess(validated.data);
    const warnings: string[] = [];
    if (receipt.items.length === 0) {
      warnings.push("No product lines were found on this receipt.");
    }
    if (receipt.total === null) {
      warnings.push("The total wasn't legible, so it hasn't been recorded.");
    }

    return { receipt, model, usage, warnings };
  }
}
