import "server-only";
import OpenAI from "openai";
import { AIFailure } from "@/lib/ai/failure";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { withRetry } from "@/lib/ai/retry";
import type { AIUsage } from "@/lib/ai/provider";

/**
 * One call shape for everything this app asks OpenAI for.
 *
 * Receipt vision and meal generation differ only in prompt, schema and model —
 * so they share a single client, a single timeout budget, one retry policy and
 * one failure taxonomy. Two hand-rolled copies is how a fix to one path silently
 * fails to reach the other.
 *
 * The key is read from the process environment here and never passed in, so
 * there is no path by which a browser bundle could obtain it.
 */

let client: OpenAI | null = null;

export function openAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new AIFailure("not_configured", "AI_PROVIDER=openai but OPENAI_API_KEY is not set");
  }
  return key;
}

/**
 * Wall-clock ceiling for ONE attempt.
 *
 * Sized to fit inside the serverless function limit with room for retries and
 * for everything the route still has to do afterwards. The Gemini path shipped
 * this at 60s once — the same as the function limit — and three attempts plus
 * backoff ran for minutes against a sixty-second budget. The platform killed
 * the function mid-flight, no response was written, and the phone showed
 * "Load failed" while the server logged nothing.
 */
function timeoutMs(): number {
  const configured = Number(process.env.OPENAI_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 30_000;
}

/** Hard ceiling across all attempts, so the worst case is a number, not a hope. */
function budgetMs(): number {
  const configured = Number(process.env.OPENAI_BUDGET_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 40_000;
}

export function openaiClient(): OpenAI {
  if (!client) {
    // maxRetries: 0 hands retry policy to withRetry, so backoff, the attempt
    // count and the budget are ours to reason about and to test.
    client = new OpenAI({ apiKey: apiKey(), maxRetries: 0, timeout: timeoutMs() });
  }
  return client;
}

/**
 * Whether this process has learned that the model rejects `reasoning`.
 *
 * Model ids are discovered at runtime rather than hard-coded, so which
 * parameters a given id accepts is not knowable in advance. A 400 naming the
 * field teaches the process once, instead of failing every call for the
 * lifetime of the deployment.
 */
let reasoningRejected = false;

/** Test seam, so one case's discovery does not leak into the next. */
export function resetOpenAIClient(): void {
  client = null;
  reasoningRejected = false;
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface OpenAIStructuredRequest {
  model: string;
  /** System-level framing, sent as `instructions`. */
  system: string;
  prompt: string;
  image?: { base64: string; mimeType: string };
  /** Name for the strict JSON schema, surfaced in provider errors. */
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  /** How much reasoning to pay for before the answer. */
  reasoning?: ReasoningEffort;
}

export interface OpenAIStructuredResult {
  text: string;
  model: string;
  usage: AIUsage;
  /** Reasoning tokens billed as output but never visible in the reply. */
  reasoningTokens: number | null;
  attempts: number;
  truncated: boolean;
  ms: number;
}

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" };

/** Does the 400 body name a parameter we can drop and try again without? */
function mentionsReasoning(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? "";
  return /reasoning/i.test(message);
}

/** Cheap completeness check — a cut-off reply is valid text but invalid JSON. */
function isCompleteJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask for one JSON object matching `schema`, via the Responses API.
 *
 * Strict Structured Outputs means the model cannot return a shape the caller
 * did not ask for, so callers validate content rather than structure. Every
 * failure arrives as a typed AIFailure; nothing here degrades to fixture data.
 */
export async function structuredCall(
  request: OpenAIStructuredRequest,
): Promise<OpenAIStructuredResult> {
  const content: ContentPart[] = [{ type: "input_text", text: request.prompt }];
  if (request.image) {
    content.push({
      type: "input_image",
      image_url: `data:${request.image.mimeType};base64,${request.image.base64}`,
      detail: "high",
    });
  }

  const baseTokens = request.maxOutputTokens ?? 8000;
  // Raised once when a reply is cut off mid-JSON. Capped, because a model that
  // cannot finish at double the allowance will not finish at ten times it
  // either — that is a prompt problem, not a budget problem.
  let allowance = baseTokens;

  const startedAt = Date.now();
  const budget = budgetMs();

  const { value, attempts } = await withRetry(
    async () => {
      // Never start an attempt that cannot finish inside the budget.
      const remaining = budget - (Date.now() - startedAt);
      if (remaining <= 1_000) {
        throw new AIFailure("timeout", `openai budget of ${budget}ms exhausted`);
      }

      let response;
      try {
        response = await openaiClient().responses.create(
          {
            model: request.model,
            instructions: request.system,
            input: [{ role: "user", content }],
            text: {
              format: {
                type: "json_schema" as const,
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
            max_output_tokens: allowance,
            ...(request.reasoning && !reasoningRejected
              ? { reasoning: { effort: request.reasoning } }
              : {}),
          },
          { timeout: Math.min(timeoutMs(), remaining) },
        );
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 400 && !reasoningRejected && mentionsReasoning(error)) {
          reasoningRejected = true;
          // eslint-disable-next-line no-console
          console.warn("[openai] model rejected reasoning.effort; retrying without it");
          throw new AIFailure("api_error", "openai rejected reasoning.effort, retrying");
        }
        throw error;
      }

      const cutOff =
        response.status === "incomplete" &&
        response.incomplete_details?.reason === "max_output_tokens";
      const text = response.output_text ?? "";
      const unparseable = text.length > 0 && !isCompleteJson(text);

      // Truncation is a budget failure, not a provider failure, and it is worth
      // exactly one more attempt with more room. Retrying at the same allowance
      // would deterministically truncate at the same point.
      if ((cutOff || unparseable) && allowance < baseTokens * 2) {
        const previous = allowance;
        allowance = Math.min(baseTokens * 2, 32_000);
        // eslint-disable-next-line no-console
        console.warn(
          "[openai] reply truncated, retrying with more room",
          JSON.stringify({ model: request.model, from: previous, to: allowance, chars: text.length }),
        );
        throw new AIFailure("api_error", `openai truncated at ${previous} tokens, retrying`);
      }

      return response;
    },
    {
      // Attempt count and backoff stay with withRetry, so OPENAI_MAX_ATTEMPTS
      // and OPENAI_RETRY_BASE_MS remain the operator controls they document
      // themselves as being.
      //
      // Backoff must respect the budget too. Sleeping past it turns a bounded
      // call into an unbounded one by the back door — the attempts are capped
      // but the waiting between them is not.
      sleep: async (ms) => {
        const remaining = budget - (Date.now() - startedAt);
        if (remaining <= 0) return;
        await new Promise((resolve) => setTimeout(resolve, Math.min(ms, remaining)));
      },
    },
  );

  const truncated =
    value.status === "incomplete" && value.incomplete_details?.reason === "max_output_tokens";
  const text = value.output_text ?? "";

  if (!text) {
    throw new AIFailure(
      truncated ? "truncated" : "api_error",
      truncated ? "openai hit max_output_tokens" : "openai returned no text",
    );
  }

  const inputTokens = value.usage?.input_tokens ?? null;
  const outputTokens = value.usage?.output_tokens ?? null;
  const reasoningTokens = value.usage?.output_tokens_details?.reasoning_tokens ?? null;
  const ms = Date.now() - startedAt;

  // eslint-disable-next-line no-console
  console.info(
    "[openai]",
    JSON.stringify({
      model: request.model,
      ms,
      attempts,
      truncated,
      chars: text.length,
      // Token counts only. No prompt, no image, no key.
      in: inputTokens,
      out: outputTokens,
      reasoning: reasoningTokens,
    }),
  );

  return {
    text,
    truncated,
    attempts,
    ms,
    model: value.model ?? request.model,
    reasoningTokens,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: value.usage?.total_tokens ?? null,
      estimated_cost_usd: estimateCostUsd(request.model, inputTokens, outputTokens),
    },
  };
}
