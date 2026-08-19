import "server-only";
import { openaiClient, type ReasoningEffort } from "@/lib/ai/openai-call";

/**
 * Task → OpenAI model resolution.
 *
 * Model identifiers live here and nowhere else. The wrinkle is that a marketing
 * name is not an API id, and guessing one produces a 404 that looks exactly
 * like a broken integration. So this asks OpenAI what it actually has and picks
 * the best match, rather than hard-coding a name nobody has verified.
 *
 * Order of authority:
 *   1. An explicit env override — always wins, needs no network.
 *   2. What `/v1/models` actually lists, matched against per-task preferences.
 *   3. A conservative fallback, so a discovery failure degrades to a model that
 *      is known to exist rather than to nothing at all.
 */

export type OpenAITask = "receipt_vision" | "meal_generation";

const ENV_KEYS: Record<OpenAITask, string> = {
  receipt_vision: "OPENAI_RECEIPT_MODEL",
  meal_generation: "OPENAI_MEAL_MODEL",
};

export type OpenAIReasoning = ReasoningEffort;

/**
 * How much reasoning each task is worth paying for.
 *
 * Transcribing a receipt has nothing to reason about, so `minimal` is what it
 * wants — and production answered that verbatim:
 *
 *   400 Unsupported value: 'minimal' is not supported with the 'gpt-5.6-luna'
 *   model. Supported values are: 'none', 'low', 'medium', 'high', 'xhigh', 'max'.
 *
 * `low` is the nearest supported value to "a little deliberation", which is
 * genuinely worth having on a skewed photo where the price column has to be
 * told from the quantity column, and it billed zero reasoning tokens on a
 * prompt with nothing to think about. `none` is reachable through the env
 * override for anyone who wants the floor. Which levels a given id accepts is
 * not knowable from documentation older than the id, so this is a setting
 * rather than a constant.
 */
const REASONING: Record<OpenAITask, OpenAIReasoning> = {
  receipt_vision: "low",
  meal_generation: "low",
};

const REASONING_ENV: Record<OpenAITask, string> = {
  receipt_vision: "OPENAI_RECEIPT_REASONING",
  meal_generation: "OPENAI_MEAL_REASONING",
};

/**
 * Every level the override will honour. `max` is in here because production
 * named it as supported and leaving it out meant `OPENAI_MEAL_REASONING=max`
 * was silently ignored — the setting appeared to take and the model kept
 * running at `low`, which is worse than rejecting it. `minimal` stays despite
 * this account's models rejecting it: a level a future id accepts should not
 * need a code change, and a 400 naming it is recovered from once by the retry
 * in openai-call.ts rather than lost.
 */
const REASONING_VALUES = new Set<string>([
  "none", "minimal", "low", "medium", "high", "xhigh", "max",
]);

export function reasoningFor(task: OpenAITask): OpenAIReasoning {
  const override = process.env[REASONING_ENV[task]]?.trim().toLowerCase();
  if (override && REASONING_VALUES.has(override)) return override as OpenAIReasoning;
  return REASONING[task];
}

/**
 * Preference patterns, most specific first.
 *
 * "GPT-5.6 Luna" and "GPT-5.6 Terra" are the names asked for; the API ids for
 * them are matched by substring so a suffix or a dated variant still resolves.
 */
const PREFERENCES: Record<OpenAITask, RegExp[]> = {
  receipt_vision: [/luna/i, /^gpt-5\.6/i, /^gpt-5(?!\.)/i, /^gpt-5/i],
  meal_generation: [/terra/i, /^gpt-5\.6/i, /^gpt-5(?!\.)/i, /^gpt-5/i],
};

/** Used only when discovery is impossible. Known to exist in this account's tier. */
const FALLBACK: Record<OpenAITask, string> = {
  receipt_vision: "gpt-5",
  meal_generation: "gpt-5",
};

let catalogue: string[] | null = null;
let catalogueError: string | null = null;

/** Test seam and a way to re-probe after a model is enabled. */
export function resetOpenAIModelCatalogue(): void {
  catalogue = null;
  catalogueError = null;
}

/**
 * Every model id this key can see, fetched once per process.
 * Never throws: discovery is an optimisation, not a dependency.
 */
export async function listOpenAIModels(): Promise<string[]> {
  if (catalogue) return catalogue;
  try {
    const page = await openaiClient().models.list();
    catalogue = page.data.map((model) => model.id).sort();
    catalogueError = null;
  } catch (error) {
    catalogue = [];
    catalogueError = (error as Error).message;
  }
  return catalogue;
}

export function modelDiscoveryError(): string | null {
  return catalogueError;
}

/** Pick the best available id for a task from what the account actually has. */
export function chooseModel(task: OpenAITask, available: string[]): string {
  for (const pattern of PREFERENCES[task]) {
    // Shortest match wins within a tier: prefer "gpt-5" over "gpt-5-preview-x".
    const matches = available.filter((id) => pattern.test(id)).sort((a, b) => a.length - b.length);
    if (matches.length > 0) return matches[0];
  }
  return FALLBACK[task];
}

/**
 * The model to use for a task, resolved against the live catalogue.
 * An env override short-circuits the network entirely.
 */
export async function openAIModelFor(task: OpenAITask): Promise<string> {
  const override = process.env[ENV_KEYS[task]]?.trim();
  if (override) return override;
  return chooseModel(task, await listOpenAIModels());
}

/** Synchronous best guess, for config displays that must not make a call. */
export function openAIModelHint(task: OpenAITask): string {
  const override = process.env[ENV_KEYS[task]]?.trim();
  if (override) return override;
  if (catalogue && catalogue.length > 0) return chooseModel(task, catalogue);
  return `${FALLBACK[task]} (pending discovery)`;
}
