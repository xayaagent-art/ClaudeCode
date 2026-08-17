import "server-only";
import { AIFailure } from "@/lib/ai/failure";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { withRetry } from "@/lib/ai/retry";
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

function timeoutMs(): number {
  const configured = Number(process.env.GEMINI_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 60_000;
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
  /** 0 for transcription, higher where variety is the point. */
  temperature?: number;
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

/** One generateContent call, with the shared timeout and retry policy. */
export async function generateContent(request: GeminiRequest): Promise<GeminiResult> {
  const key = apiKey();

  const parts: Record<string, unknown>[] = [{ text: request.prompt }];
  if (request.image) {
    parts.push({
      inline_data: { mime_type: request.image.mimeType, data: request.image.base64 },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    system_instruction: { parts: [{ text: request.system }] },
    generationConfig: {
      temperature: request.temperature ?? 0,
      maxOutputTokens: request.maxOutputTokens ?? 8000,
      responseMimeType: "application/json",
      ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
    },
  };

  const { value, attempts } = await withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${request.model}:generateContent`, {
        method: "POST",
        // Header rather than query string, so the key never lands in a URL that
        // could be logged by a proxy or an error reporter.
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new AIFailure("timeout", `gemini call exceeded ${timeoutMs()}ms`);
      }
      throw new AIFailure("api_error", `gemini request failed: ${(error as Error).name}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw failureForStatus(response.status, response.headers.get("retry-after"));
    }
    return (await response.json()) as GeminiResponseBody;
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
