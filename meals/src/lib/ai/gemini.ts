import "server-only";
import { AIFailure } from "@/lib/ai/failure";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { withRetry } from "@/lib/ai/retry";
import type { ThinkingLevel } from "@/lib/ai/models";
import type { AIUsage } from "@/lib/ai/provider";

/**
 * Minimal Gemini client over the Generative Language REST API.
 *
 * Deliberately not the vendor SDK: this app needs exactly one call shape —
 * generate structured JSON, optionally from an image — and a hand-rolled fetch
 * keeps the failure taxonomy, timeout and retry policy the same code the
 * OpenAI path already uses. The key is read from the process environment here
 * and never passed in, so no browser bundle can reach it.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new AIFailure("not_configured", "AI_PROVIDER=gemini but GEMINI_API_KEY is not set");
  }
  return key;
}

/**
 * Wall-clock ceiling for ONE attempt.
 *
 * This has to fit inside the serverless function limit with room for retries
 * and for everything the route does afterwards. It used to be 60s — the same
 * as the function limit — so three attempts plus backoff could run for over
 * three minutes against a sixty-second budget. The platform killed the
 * function mid-flight, no response was ever written, and the phone showed
 * "Load failed" while the server logged nothing at all.
 */
function timeoutMs(): number {
  const configured = Number(process.env.GEMINI_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 30_000;
}

/**
 * Hard ceiling across all attempts. Nothing may exceed this, so a caller can
 * reason about the worst case rather than hoping.
 *
 * Sized against what still has to happen after the model answers: ranking,
 * up to a handful of YouTube lookups, the Supabase writes that give recipes
 * their identity, and serialisation. Against a 60-second function limit, the
 * model gets 25 and the rest of the route keeps 35.
 */
function budgetMs(): number {
  const configured = Number(process.env.GEMINI_BUDGET_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 35_000;
}

/**
 * Whether this process has learned that the model rejects thinkingConfig.
 *
 * Set only by an actual 400 naming it, so a model that does support the field
 * never loses the setting, and one that does not is worked around after a
 * single failure rather than on every call.
 */
let thinkingConfigRejected = false;

/**
 * Generation parameters.
 *
 * Deliberately minimal: an unsupported knob is rejected for the whole request,
 * and a request that fails on a parameter looks identical, from the outside, to
 * a model that had nothing to say. `temperature` is opt-in via
 * GEMINI_TEMPERATURE rather than always-on for exactly that reason.
 *
 * `thinkingConfig` is the exception, and it is here because production proved
 * it necessary. These are thinking models: asked for `{"ok":true}` with a
 * 64-token ceiling, the deployed app got back no text at all, a finishReason of
 * MAX_TOKENS, and a 14.8-second latency — the entire output budget had gone on
 * internal reasoning before a single character was emitted. For transcribing a
 * receipt and for filling a fixed JSON schema there is nothing to reason about,
 * so the budget is spent on the answer instead.
 */
function generationConfig(request: GeminiRequest, maxOutputTokens: number): Record<string, unknown> {
  const config: Record<string, unknown> = {
    maxOutputTokens,
    responseMimeType: "application/json",
  };
  if (request.responseSchema) config.responseSchema = request.responseSchema;

  // Sampling parameters are deliberately absent. Structured output constrained
  // by a schema does not need them, and an unsupported or deprecated knob is
  // rejected for the whole request — a failure indistinguishable, from the
  // outside, from a model that had nothing to say.
  if (!thinkingConfigRejected) {
    config.thinkingConfig = { thinkingLevel: request.thinkingLevel ?? "low" };
  }

  return config;
}

/** Test seam, so one case's discovery does not leak into the next. */
export function resetGeminiCapabilities(): void {
  thinkingConfigRejected = false;
}

export interface InlineImage {
  base64: string;
  mimeType: string;
}

export interface GeminiRequest {
  model: string;
  /** System-level framing, sent as system_instruction. */
  system: string;
  prompt: string;
  image?: InlineImage;
  /** OpenAPI-subset schema. Gemini constrains output to it. */
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  /** How much reasoning to pay for before the answer. */
  thinkingLevel?: ThinkingLevel;
}

export interface GeminiResult {
  text: string;
  usage: AIUsage;
  model: string;
  attempts: number;
  /** True when the reply was cut short by the output cap. */
  truncated: boolean;
}

interface GeminiResponseBody {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

/**
 * Map an HTTP failure onto the shared taxonomy.
 * Status codes only — a provider message can quote the content it refused.
 */
function failureForStatus(status: number, retryAfter: string | null): AIFailure {
  const retryAfterMs = retryAfter && Number.isFinite(Number(retryAfter))
    ? Number(retryAfter) * 1000
    : null;

  if (status === 429) {
    return new AIFailure("rate_limit", "gemini returned 429", { retryAfterMs });
  }
  if (status === 400) {
    return new AIFailure("invalid_image", "gemini rejected the request payload (400)");
  }
  if (status === 401 || status === 403) {
    return new AIFailure("not_configured", `gemini rejected the API key (${status})`);
  }
  return new AIFailure("api_error", `gemini returned ${status}`);
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

/** One generateContent call, with the shared timeout and retry policy. */
export async function generateContent(request: GeminiRequest): Promise<GeminiResult> {
  const key = apiKey();

  const parts: Record<string, unknown>[] = [{ text: request.prompt }];
  if (request.image) {
    parts.push({
      inline_data: { mime_type: request.image.mimeType, data: request.image.base64 },
    });
  }

  const baseTokens = request.maxOutputTokens ?? 8000;
  // Raised for the retry when a reply is cut off mid-JSON. Capped, because a
  // model that cannot finish at double the allowance will not finish at ten
  // times it either — that is a prompt problem, not a budget problem.
  let allowance = baseTokens;

  const buildBody = (): Record<string, unknown> => ({
    contents: [{ role: "user", parts }],
    // Canonical JSON name for the field. Proto3 JSON accepts either spelling,
    // but the documented one is what the API reference and every example use.
    systemInstruction: { parts: [{ text: request.system }] },
    generationConfig: generationConfig(request, allowance),
  });

  const startedAt = Date.now();
  const budget = budgetMs();

  const { value, attempts } = await withRetry(async () => {
    // Never start an attempt that cannot finish inside the budget.
    const remaining = budget - (Date.now() - startedAt);
    if (remaining <= 1_000) {
      throw new AIFailure("timeout", `gemini budget of ${budget}ms exhausted`);
    }
    const attemptTimeout = Math.min(timeoutMs(), remaining);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeout);

    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${request.model}:generateContent`, {
        method: "POST",
        // Header rather than query string, so the key never lands in a URL that
        // could be logged by a proxy or an error reporter.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(buildBody()),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new AIFailure("timeout", `gemini call exceeded ${attemptTimeout}ms`);
      }
      throw new AIFailure("api_error", `gemini request failed: ${(error as Error).name}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // A 400 naming thinkingConfig means this model does not accept it. Drop
      // it for the rest of the process and let the retry succeed, rather than
      // failing every call for the lifetime of the deployment.
      if (response.status === 400 && !thinkingConfigRejected) {
        const detail = await response.clone().text().catch(() => "");
        if (/thinking/i.test(detail)) {
          thinkingConfigRejected = true;
          // eslint-disable-next-line no-console
          console.warn("[gemini] model rejected thinkingConfig; retrying without it");
          throw new AIFailure("api_error", "gemini rejected thinkingConfig, retrying");
        }
      }
      const failure = failureForStatus(response.status, response.headers.get("retry-after"));
      // Status and model only — a provider error body can quote the prompt.
      // eslint-disable-next-line no-console
      console.error(
        "[gemini] request failed",
        JSON.stringify({ model: request.model, status: response.status, kind: failure.kind }),
      );
      throw failure;
    }
    const body = (await response.json()) as GeminiResponseBody;

    // Truncation is a budget failure, not a provider failure, and it is worth
    // exactly one more attempt with more room. Retrying at the same allowance
    // would deterministically truncate at the same point.
    const candidate = body.candidates?.[0];
    const cutOff = candidate?.finishReason === "MAX_TOKENS";
    const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    const unparseable = text.length > 0 && !isCompleteJson(text);

    if ((cutOff || unparseable) && allowance < baseTokens * 2) {
      const previous = allowance;
      allowance = Math.min(baseTokens * 2, 32_000);
      // eslint-disable-next-line no-console
      console.warn(
        "[gemini] reply truncated, retrying with more room",
        JSON.stringify({ model: request.model, from: previous, to: allowance, chars: text.length }),
      );
      throw new AIFailure("api_error", `gemini truncated at ${previous} tokens, retrying`);
    }

    return body;
  }, {
    attempts: 3,
    baseDelayMs: 500,
    // Backoff must respect the budget too. Sleeping past it turns a bounded
    // call into an unbounded one by the back door — the attempts are capped
    // but the waiting between them is not.
    sleep: async (ms) => {
      const remaining = budget - (Date.now() - startedAt);
      if (remaining <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, Math.min(ms, remaining)));
    },
  });

  const candidate = value.candidates?.[0];

  // A safety block is not a transient failure; retrying sends the same image.
  if (!candidate && value.promptFeedback?.blockReason) {
    throw new AIFailure("unreadable", `gemini blocked the prompt (${value.promptFeedback.blockReason})`);
  }

  const truncated = candidate?.finishReason === "MAX_TOKENS";
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");

  if (!text) {
    throw new AIFailure(
      truncated ? "truncated" : "api_error",
      truncated ? "gemini hit maxOutputTokens" : "gemini returned no text",
    );
  }

  // eslint-disable-next-line no-console
  console.info(
    "[gemini]",
    JSON.stringify({
      model: request.model,
      ms: Date.now() - startedAt,
      attempts,
      truncated,
      chars: text.length,
      // Token counts only. No prompt, no image, no key.
      in: value.usageMetadata?.promptTokenCount ?? null,
      out: value.usageMetadata?.candidatesTokenCount ?? null,
    }),
  );

  const inputTokens = value.usageMetadata?.promptTokenCount ?? null;
  const outputTokens = value.usageMetadata?.candidatesTokenCount ?? null;

  return {
    text,
    truncated,
    attempts,
    model: request.model,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: value.usageMetadata?.totalTokenCount ?? null,
      estimated_cost_usd: estimateCostUsd(request.model, inputTokens, outputTokens),
    },
  };
}

/**
 * Convert a JSON Schema to the OpenAPI subset Gemini's responseSchema accepts.
 *
 * Two differences matter: it has no `additionalProperties`, and it expresses
 * optionality as `nullable: true` rather than a `["string","null"]` type union.
 * Converting lets the receipt contract stay defined once, in zod, instead of
 * being maintained twice and drifting.
 */
export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (Array.isArray(schema)) {
    return schema.map(toGeminiSchema) as unknown as Record<string, unknown>;
  }
  if (!schema || typeof schema !== "object") {
    return schema as Record<string, unknown>;
  }

  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(source)) {
    if (key === "additionalProperties") continue;

    if (key === "type" && Array.isArray(raw)) {
      const types = raw.filter((t) => t !== "null");
      out.type = types[0] ?? "string";
      if (types.length !== raw.length) out.nullable = true;
      continue;
    }

    out[key] =
      raw && typeof raw === "object" ? toGeminiSchema(raw) : raw;
  }

  return out;
}
