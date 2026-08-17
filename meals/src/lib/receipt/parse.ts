import "server-only";
import { createHash } from "node:crypto";
import { AIConfigurationError, activeProviderName, getAIProvider } from "@/lib/ai";
import { AIFailure, type AIFailureKind, classifyProviderError, copyForKind } from "@/lib/ai/failure";
import type { AIUsage, ImageInput } from "@/lib/ai";
import type { ParsedReceipt } from "@/lib/receipt/schema";

export type ParserKind = "openai" | "fixture";

export interface ParseOutcome {
  receipt: ParsedReceipt;
  parser: ParserKind;
  model: string;
  usage: AIUsage | null;
  latency_ms: number;
  /** Provider calls made, including retries. */
  attempts: number;
  /** Model lines dropped for failing validation. */
  dropped_items: number;
  /** Non-fatal problems worth telling the user about. */
  warnings: string[];
}

/**
 * A parse that failed in a way the UI can explain.
 *
 * `kind` is what lets the scan screen offer the right next step — retry the
 * same photo, take a different one, or wait. `userMessage` is always safe to
 * render; `message` is for the server log and may name the provider.
 */
export class ReceiptParseError extends Error {
  readonly kind: AIFailureKind;
  readonly userMessage: string;
  readonly title: string;
  readonly retryable: boolean;
  readonly status: number;
  /** Provider calls made before failing. Spend scales with this. */
  readonly attempts: number;

  constructor(kind: AIFailureKind, detail: string, options: { userMessage?: string; attempts?: number } = {}) {
    const copy = copyForKind(kind);
    super(detail);
    this.name = "ReceiptParseError";
    this.kind = kind;
    this.title = copy.title;
    this.userMessage = options.userMessage ?? copy.userMessage;
    this.retryable = copy.retryable;
    this.status = copy.status;
    this.attempts = options.attempts ?? 1;
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
 * In real mode a failure is a failure: it throws a typed error the UI can act
 * on. It never degrades to fixture data — that would be a silent lie about what
 * the user just photographed.
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
      attempts: result.attempts,
      dropped_items: result.dropped_items,
      warnings: result.warnings,
    };
  } catch (error) {
    // A missing key is an operator problem, and keeps its own wording.
    if (error instanceof AIConfigurationError) {
      throw new ReceiptParseError("not_configured", error.message, {
        userMessage: error.userMessage,
      });
    }

    const failure = error instanceof AIFailure ? error : classifyProviderError(error);
    throw new ReceiptParseError(
      failure.kind,
      `receipt parse failed (${provider.name}/${provider.modelName()}): ${failure.message}`,
      { attempts: failure.attempts },
    );
  }
}
