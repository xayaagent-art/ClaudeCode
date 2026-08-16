import "server-only";
import OpenAI from "openai";

/**
 * Thin wrapper over the OpenAI Responses API.
 *
 * Everything the app asks a model for is either a structured output validated
 * against a schema, or discarded. The key never leaves the server.
 */

export function aiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

export function modelName(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5";
}

export interface ImageInput {
  base64: string;
  mimeType: string;
}

export interface StructuredRequest {
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  image?: ImageInput;
  /** Allow the model to search the web (used for recipe discovery only). */
  webSearch?: boolean;
  maxOutputTokens?: number;
}

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" };

/**
 * Ask for one JSON object matching `schema`. Throws if the model returns
 * something that is not parseable JSON — callers decide how to degrade.
 */
export async function structuredResponse<T>(request: StructuredRequest): Promise<T> {
  const content: ContentPart[] = [{ type: "input_text", text: request.prompt }];
  if (request.image) {
    content.push({
      type: "input_image",
      image_url: `data:${request.image.mimeType};base64,${request.image.base64}`,
      detail: "high",
    });
  }

  const response = await openai().responses.create({
    model: modelName(),
    instructions: request.system,
    input: [{ role: "user", content }],
    ...(request.webSearch ? { tools: [{ type: "web_search" as const }] } : {}),
    text: {
      format: {
        type: "json_schema" as const,
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
  });

  const text = response.output_text;
  if (!text) throw new Error("Model returned no output");
  return JSON.parse(text) as T;
}
