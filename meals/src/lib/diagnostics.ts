import "server-only";
import { getDb, persistenceKind } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { modelRouting } from "@/lib/ai/models";
import { generateContent, geminiConfigured } from "@/lib/ai/gemini";
import { openAIConfigured, structuredCall, type ReasoningEffort } from "@/lib/ai/openai-call";
import {
  listOpenAIModels,
  modelDiscoveryError,
  openAIModelFor,
  reasoningFor,
} from "@/lib/ai/openai-models";
import { candidateGenerationEnabled, generateMealCandidates } from "@/lib/meals/candidates";
import { buildHouseholdContext } from "@/lib/household/context";
import { rankRecipes } from "@/lib/meals/rank";
import { youtubeProvider } from "@/lib/video/youtube";

/**
 * Read-only production health check.
 *
 * Every route that decides whether this app works is a POST, and a sandbox that
 * cannot issue one cannot tell a working deployment from a broken one. This
 * exercises the real provider client, the real database adapter and the real
 * recipe lookup, so the production code path can be verified rather than
 * assumed. It mutates nothing.
 */
/**
 * What the configured Supabase credential actually claims.
 *
 * Production returned "JWT issued in the future", which has exactly three
 * causes: a token minted with a forward-dated `iat`, a clock difference between
 * the issuer and the gateway, or the wrong token entirely. Only the token can
 * say which. These are public claims from the payload segment — role, project
 * ref and timestamps — never the signature and never the key itself, so this is
 * safe to read while remaining decisive.
 */
function inspectSupabaseKey(): Record<string, unknown> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { present: false };

  const trimmed = key.trim();
  const whitespaceDamaged = trimmed !== key;
  const parts = trimmed.split(".");

  if (parts.length !== 3) {
    // Newer projects issue `sb_secret_...` / `sb_publishable_...` keys, which
    // are not JWTs at all. The distinction matters enormously and the prefix is
    // not secret: a publishable key in the service-role slot fails every write
    // under RLS while looking, from the outside, like a broken database.
    const prefix = /^(sb_[a-z]+_)/.exec(trimmed)?.[1] ?? null;
    return {
      present: true,
      format: prefix ? "supabase_api_key" : "unrecognised",
      prefix,
      length: trimmed.length,
      whitespace_damaged: whitespaceDamaged,
    };
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      iat?: number;
      exp?: number;
      role?: string;
      ref?: string;
      iss?: string;
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    return {
      present: true,
      format: "jwt",
      whitespace_damaged: whitespaceDamaged,
      role: payload.role ?? null,
      project_ref: payload.ref ?? null,
      issuer: payload.iss ?? null,
      issued_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      // Positive means the token claims to have been issued in our future.
      issued_seconds_ahead_of_now: payload.iat ? payload.iat - nowSeconds : null,
      expired: payload.exp ? payload.exp < nowSeconds : null,
      server_time: new Date().toISOString(),
    };
  } catch (error) {
    return { present: true, format: "jwt", decode_error: (error as Error).message };
  }
}

/**
 * What PostgREST says when the configured credential is used directly.
 *
 * The adapter's error — "JWT issued at future" — arrives with no status code
 * and no indication of which layer rejected it, and the same sentence can mean
 * a forward-dated token, the wrong key entirely, or a key the gateway never
 * accepted. One raw request against a table that definitely exists answers it:
 * the status distinguishes auth failure (401) from RLS refusal (200 with an
 * empty array) from a project mismatch (404).
 */
async function probeSupabaseRest(): Promise<Record<string, unknown>> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { checked: false };

  // Both header shapes against `inventory_items` — the table the adapter was
  // actually rejected on, not a table chosen for being easy. The pair is the
  // whole point: `apikey` alone is what a new-format secret is documented to
  // travel as, and adding the Bearer is what supabase-js was doing when
  // production answered "JWT issued at future".
  return {
    checked: true,
    apikey_only: await probeRestOnce(url, { apikey: key }),
    apikey_and_bearer: await probeRestOnce(url, { apikey: key, authorization: `Bearer ${key}` }),
  };
}

async function probeRestOnce(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const askedAt = Date.now();
  try {
    const response = await fetch(`${url}/rest/v1/inventory_items?select=id&limit=1`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    // The body is either an id we already know or PostgREST's own error text.
    // Neither is sensitive, and without it there is nothing to diagnose from.
    const body = (await response.text()).slice(0, 300);
    return { status: response.status, ms: Date.now() - askedAt, body };
  } catch (error) {
    return { ok: false, ms: Date.now() - askedAt, error: (error as Error).message };
  }
}

/**
 * The real generation request, end to end, against the real household.
 *
 * A trivial probe proves the key and the model; it does not prove the actual
 * fourteen-candidate schema is one this model will accept under strict
 * Structured Outputs, which is the thing that decides whether a household ever
 * sees a suggestion. This runs the production path verbatim and reports what
 * came back.
 *
 * It writes nothing. Generation produces candidates in memory — persistence
 * happens later, in `materialize`, which this never calls — so the household's
 * data is untouched, and the only cost is one request.
 */
async function probeGeneration(): Promise<Record<string, unknown>> {
  const askedAt = Date.now();
  try {
    const { context, inventory } = await buildHouseholdContext("dinner");
    const generated = await generateMealCandidates(context);
    // Ranking is pure, so it is free to run and answers the question the count
    // alone does not: would any of these actually survive to the screen?
    const eligible = rankRecipes(generated.recipes, inventory, context);

    return {
      checked: true,
      outcome: generated.outcome,
      model: generated.model,
      ms: Date.now() - askedAt,
      candidates: generated.recipes.length,
      eligible_after_ranking: eligible.length,
      titles: generated.recipes.slice(0, 16).map((recipe) => recipe.title),
      input_tokens: generated.usage?.input_tokens ?? null,
      output_tokens: generated.usage?.output_tokens ?? null,
      estimated_cost_usd: generated.usage?.estimated_cost_usd ?? null,
      failure_kind: generated.failureKind,
      error: generated.error,
      persisted: false,
    };
  } catch (error) {
    return { checked: true, ok: false, ms: Date.now() - askedAt, error: (error as Error).message };
  }
}

export interface HealthReport {
  config: Record<string, unknown>;
  supabase_key: Record<string, unknown>;
  database: Record<string, unknown>;
  supabase_rest: Record<string, unknown>;
  gemini: Record<string, unknown>;
  openai: Record<string, unknown>;
  generation: Record<string, unknown>;
  ms: number;
}

/**
 * Does the configured OpenAI key work, and which models can it actually see?
 *
 * This exists because model ids are discovered rather than assumed. A marketing
 * name is not an API id, guessing one produces a 404 that looks exactly like a
 * broken integration, and no sandbox here can reach api.openai.com to check. So
 * the deployment answers the question itself: list the catalogue, report what
 * each task resolved to, then spend one trivial request proving the resolved
 * model responds.
 */
async function probeOpenAI(live: boolean): Promise<Record<string, unknown>> {
  if (!openAIConfigured()) return { checked: false, key_present: false };

  const catalogue = await listOpenAIModels();
  const [receiptModel, mealModel] = await Promise.all([
    openAIModelFor("receipt_vision"),
    openAIModelFor("meal_generation"),
  ]);

  const report: Record<string, unknown> = {
    checked: true,
    key_present: true,
    models_visible: catalogue.length,
    // GPT-5 and newer only. Listing the first forty ids alphabetically hid the
    // very models the resolver had picked, which made the report look like it
    // had invented them.
    gpt_models: catalogue.filter((id) => /^gpt-[5-9]/.test(id)),
    discovery_error: modelDiscoveryError(),
    resolved: { receipt_vision: receiptModel, meal_generation: mealModel },
  };
  if (!live) return report;

  // Variants, cheapest question first. A 400 tells you the request was wrong
  // but not which part of it, and these models are new enough that "which
  // parameter does this one accept" is not answerable from documentation this
  // build was written against. Each variant changes exactly one thing, so the
  // first one that succeeds names the cause.
  report.reasoning = {
    receipt_vision: reasoningFor("receipt_vision"),
    meal_generation: reasoningFor("meal_generation"),
  };
  report.live = [
    await probeOnce("meal model, configured reasoning", mealModel, reasoningFor("meal_generation")),
    await probeOnce("vision model, configured reasoning", receiptModel, reasoningFor("receipt_vision")),
    // Kept deliberately: "minimal" is the level a transcription task wants and
    // the one this account's models reject. If that ever changes, this line is
    // where it shows up, rather than in a receipt failing for a user.
    await probeOnce("vision model, reasoning=minimal", receiptModel, "minimal"),
  ];
  return report;
}

/**
 * One trivial structured request. The prompt is a fixed literal with no
 * household data in it, which is what makes it safe to report the provider's
 * own error text verbatim — the thing every other call path deliberately
 * withholds, because there a provider message can quote receipt contents.
 */
async function probeOnce(
  label: string,
  model: string,
  reasoning: ReasoningEffort | undefined,
): Promise<Record<string, unknown>> {
  const askedAt = Date.now();
  try {
    const result = await structuredCall({
      model,
      system: "Reply with JSON only.",
      prompt: 'Return exactly {"ok":true}',
      schemaName: "probe",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      // Not tiny. These models spend part of the allowance reasoning before any
      // text appears, so a small ceiling proves nothing except that the ceiling
      // was small.
      maxOutputTokens: 2000,
      ...(reasoning ? { reasoning } : {}),
    });
    return {
      label,
      ok: true,
      model: result.model,
      ms: Date.now() - askedAt,
      attempts: result.attempts,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      reasoning_tokens: result.reasoningTokens,
      reply: result.text.slice(0, 80),
    };
  } catch (error) {
    const failure = error as Error & { kind?: string; cause?: unknown };
    const cause = failure.cause as { status?: number; message?: string } | undefined;
    return {
      label,
      ok: false,
      model,
      ms: Date.now() - askedAt,
      kind: failure.kind ?? failure.name,
      detail: failure.message,
      status: cause?.status ?? null,
      provider_message: cause?.message?.slice(0, 400) ?? null,
    };
  }
}

export async function healthReport(live: boolean): Promise<HealthReport> {
  const startedAt = Date.now();

  const config = {
    ai_provider: activeProviderName(),
    gemini_key_present: geminiConfigured(),
    dynamic_meals: candidateGenerationEnabled(),
    models: modelRouting(),
    storage: persistenceKind(),
    youtube: youtubeProvider.enabled(),
    // Presence only — never a value, for any key.
    openai_key_present: openAIConfigured(),
  };

  // Database reachability plus the recipe-id invariant against real rows: can
  // stored recipes be retrieved by the same lookup the detail page uses?
  let database: Record<string, unknown>;
  try {
    const db = getDb();
    const [recipes, inventory] = await Promise.all([db.listRecipes(), db.listInventory()]);
    const sample = recipes.filter((r) => r.source_type !== "catalog").slice(0, 8);
    const resolved = await Promise.all(sample.map((r) => db.getRecipe(r.id)));

    database = {
      reachable: true,
      recipes: recipes.length,
      inventory: inventory.length,
      generated_sampled: sample.length,
      generated_resolvable: resolved.filter(Boolean).length,
      unresolvable_ids: sample.filter((_, i) => !resolved[i]).map((r) => r.id),
    };
  } catch (error) {
    database = { reachable: false, error: (error as Error).message };
  }

  let gemini: Record<string, unknown> = { checked: false, key_present: geminiConfigured() };
  // Only the active provider is exercised. Gemini stays present and dormant
  // under AI_PROVIDER=openai, and a health check must not spend on a provider
  // the app is not currently using.
  if (live && geminiConfigured() && activeProviderName() === "gemini") {
    const model = modelRouting().meal_candidate_generation;
    const askedAt = Date.now();
    try {
      const response = await generateContent({
        model,
        system: "Reply with JSON only.",
        prompt: 'Return exactly {"ok":true}',
        // Not 64. These models spend part of the allowance reasoning before
        // any text appears, so a tiny ceiling proves nothing except that the
        // ceiling was tiny.
        maxOutputTokens: 2000,
        thinkingLevel: "minimal",
      });
      gemini = {
        checked: true,
        ok: true,
        model: response.model,
        ms: Date.now() - askedAt,
        attempts: response.attempts,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        reply: response.text.slice(0, 80),
      };
    } catch (error) {
      const failure = error as Error & { kind?: string };
      gemini = {
        checked: true,
        ok: false,
        model,
        ms: Date.now() - askedAt,
        kind: failure.kind ?? failure.name,
        detail: failure.message,
      };
    }
  }

  const openai = await probeOpenAI(live && activeProviderName() === "openai");

  return {
    config,
    supabase_key: inspectSupabaseKey(),
    supabase_rest: await probeSupabaseRest(),
    database,
    gemini,
    openai,
    generation:
      live && candidateGenerationEnabled() ? await probeGeneration() : { checked: false },
    ms: Date.now() - startedAt,
  };
}
