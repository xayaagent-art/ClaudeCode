import type { ParsedReceipt } from "@/lib/receipt/schema";

/**
 * AI provider abstraction.
 *
 * `AI_PROVIDER` decides which implementation runs, and the choice is explicit
 * rather than inferred from whether a key happens to be present. The two modes
 * must never blend: in `openai` mode a failure is an error the user can retry,
 * never a silent fall back to fixture data.
 */

export type AIProviderName = "openai" | "mock";

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface AIUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  /** Best-effort, from a local price table. Null when the model is unpriced. */
  estimated_cost_usd: number | null;
}

export interface ReceiptParseResult {
  receipt: ParsedReceipt;
  model: string;
  usage: AIUsage | null;
  /** Non-fatal notes worth showing the user. */
  warnings: string[];
  /** Provider calls actually made, including retries. Cost is per attempt. */
  attempts: number;
  /** Lines the model returned that failed validation and were left out. */
  dropped_items: number;
}

export interface AIProvider {
  readonly name: AIProviderName;
  /** Human-readable model identifier recorded in telemetry. */
  modelName(): string;
  /** Throws AIConfigurationError when the provider cannot run. */
  assertReady(): void;
  parseReceipt(image: ImageInput): Promise<ReceiptParseResult>;
}

/** Configuration problem the operator must fix — distinct from a parse failure. */
export class AIConfigurationError extends Error {
  readonly userMessage: string;
  constructor(message: string, userMessage: string) {
    super(message);
    this.name = "AIConfigurationError";
    this.userMessage = userMessage;
  }
}

/**
 * Resolve the active provider.
 *
 * Explicit `AI_PROVIDER` always wins. With nothing set we fall back to `mock`,
 * because guessing "real" and then failing on a missing key is worse than a
 * clearly-labelled demo mode.
 */
export function activeProviderName(): AIProviderName {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === "openai") return "openai";
  if (configured === "mock") return "mock";

  // Legacy switch from the first milestone, still honoured.
  const legacy = process.env.RECEIPT_PARSER?.trim().toLowerCase();
  if (legacy === "openai") return "openai";
  if (legacy === "fixture") return "mock";

  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

/** True when the app is running against real models rather than fixtures. */
export function isRealMode(): boolean {
  return activeProviderName() === "openai";
}
