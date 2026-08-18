/**
 * Local price table for cost telemetry.
 *
 * These are estimates, stored as USD per million tokens, and they go stale — the
 * value is tracking relative cost per receipt over time, not billing accuracy.
 * Override with AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK rather than
 * editing code when prices change.
 */

interface Price {
  input_per_mtok: number;
  output_per_mtok: number;
}

const PRICES: Record<string, Price> = {
  "gpt-5": { input_per_mtok: 1.25, output_per_mtok: 10 },
  "gpt-5-mini": { input_per_mtok: 0.25, output_per_mtok: 2 },
  "gpt-5-nano": { input_per_mtok: 0.05, output_per_mtok: 0.4 },
  "gpt-4.1": { input_per_mtok: 2, output_per_mtok: 8 },
  "gpt-4.1-mini": { input_per_mtok: 0.4, output_per_mtok: 1.6 },
  "gpt-4o": { input_per_mtok: 2.5, output_per_mtok: 10 },
  "gpt-4o-mini": { input_per_mtok: 0.15, output_per_mtok: 0.6 },
  // Newer GPT-5 point releases are not listed individually: they resolve
  // through the family-prefix fallback below to the "gpt-5" rate, which is an
  // estimate and says so. Override with the AI_PRICE_* variables once the real
  // rate card is known rather than guessing a number here.

  // Gemini. These are Flash-tier assumptions, not confirmed rate-card figures,
  // and they are here so relative cost per receipt is trackable rather than
  // absent. Set AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK once the
  // real numbers are known; nothing in the app depends on their accuracy.
  "gemini-3.6-flash": { input_per_mtok: 0.3, output_per_mtok: 2.5 },
  "gemini-3.5-flash-lite": { input_per_mtok: 0.1, output_per_mtok: 0.4 },
  "gemini-3.5-flash": { input_per_mtok: 0.3, output_per_mtok: 2.5 },
};

function priceFor(model: string): Price | null {
  const envInput = Number(process.env.AI_PRICE_INPUT_PER_MTOK);
  const envOutput = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK);
  if (Number.isFinite(envInput) && Number.isFinite(envOutput)) {
    return { input_per_mtok: envInput, output_per_mtok: envOutput };
  }
  if (PRICES[model]) return PRICES[model];
  // Fall back to the closest family prefix, e.g. "gpt-5-2026-01-01" → "gpt-5".
  const family = Object.keys(PRICES)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return family ? PRICES[family] : null;
}

/** Null when the model has no known price — never a fabricated number. */
export function estimateCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = priceFor(model);
  if (!price) return null;
  if (inputTokens === null && outputTokens === null) return null;

  const cost =
    ((inputTokens ?? 0) / 1_000_000) * price.input_per_mtok +
    ((outputTokens ?? 0) / 1_000_000) * price.output_per_mtok;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
