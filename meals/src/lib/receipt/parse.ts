import "server-only";
import { createHash } from "node:crypto";
import { AIConfigurationError, activeProviderName, getAIProvider } from "@/lib/ai";
import type { AIUsage, ImageInput } from "@/lib/ai";
import type { ParsedReceipt } from "@/lib/receipt/schema";

export type ParserKind = "openai" | "fixture";

export interface ParseOutcome {
  receipt: ParsedReceipt;
  parser: ParserKind;
  model: string;
  usage: AIUsage | null;
  latency_ms: number;
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

/**
 * Which parser will run. `fixture` is only ever returned in mock mode — the
 * "no key, quietly use the fixture" behaviour from the first milestone is gone.
 */
export function activeParser(): ParserKind {
  return activeProviderName() === "openai" ? "openai" : "fixture";
}

/** Stable identity for an uploaded image, so the same photo is recognised. */
export function hashImage(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Parse a receipt image through the active AI provider.
 *
 * In real mode a failure is a failure: it throws a recoverable error the UI can
 * offer a retry for. It never degrades to fixture data — that would be a silent
 * lie about what the user just photographed.
 */
export async function parseReceiptImage(image: ImageInput): Promise<ParseOutcome> {
  const provider = getAIProvider();
  const startedAt = Date.now();

  try {
    const result = await provider.parseReceipt(image);
    return {
      receipt: result.receipt,
      parser: provider.name === "openai" ? "openai" : "fixture",
      model: result.model,
      usage: result.usage,
      latency_ms: Date.now() - startedAt,
      warnings: result.warnings,
    };
  } catch (error) {
    if (error instanceof AIConfigurationError) {
      throw new ReceiptParseError(error.message, error.userMessage);
    }
    throw new ReceiptParseError(
      `receipt parse failed (${provider.name}/${provider.modelName()}): ${(error as Error).message}`,
      "We couldn't read this receipt. Try again, or choose another photo.",
    );
  }
}
