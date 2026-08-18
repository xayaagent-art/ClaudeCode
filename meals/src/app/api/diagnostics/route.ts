import { getDb, persistenceKind } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { modelRouting } from "@/lib/ai/models";
import { generateContent, geminiConfigured } from "@/lib/ai/gemini";
import { candidateGenerationEnabled } from "@/lib/meals/candidates";
import { youtubeProvider } from "@/lib/video/youtube";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read-only production health check.
 *
 * Every route that actually matters is a POST, and a sandbox that cannot issue
 * one cannot tell a working deployment from a broken one. This exercises the
 * same provider client, the same database adapter and the same recipe lookup
 * over a GET, so the production code path can be verified rather than assumed.
 *
 * It mutates nothing. `?live=1` additionally makes one deliberately tiny Gemini
 * call — a few dozen tokens — because the only way to know the model, the key
 * and the request shape are right in production is to ask it once.
 */
export async function GET(request: Request) {
  const live = new URL(request.url).searchParams.get("live") === "1";
  const startedAt = Date.now();

  const config = {
    ai_provider: activeProviderName(),
    gemini_key_present: geminiConfigured(),
    dynamic_meals: candidateGenerationEnabled(),
    models: modelRouting(),
    storage: persistenceKind(),
    youtube: youtubeProvider.enabled(),
    // Presence only — never the value, and never for a secret we removed.
    openai_key_present: Boolean(process.env.OPENAI_API_KEY),
  };

  // Database reachability plus the recipe-id invariant, checked against real
  // rows: can the most recent stored recipes be retrieved by the same lookup
  // the detail page uses?
  let database: Record<string, unknown>;
  try {
    const db = getDb();
    const [recipes, inventory] = await Promise.all([db.listRecipes(), db.listInventory()]);
    const sample = recipes.filter((r) => r.source_type !== "catalog").slice(0, 5);
    const resolved = await Promise.all(sample.map((r) => db.getRecipe(r.id)));

    database = {
      reachable: true,
      recipes: recipes.length,
      inventory: inventory.length,
      generated_sampled: sample.length,
      generated_resolvable: resolved.filter(Boolean).length,
      unresolvable_ids: sample
        .filter((_, index) => !resolved[index])
        .map((recipe) => recipe.id),
    };
  } catch (error) {
    database = { reachable: false, error: (error as Error).message };
  }

  let gemini: Record<string, unknown> = { checked: false };
  if (live && geminiConfigured()) {
    const model = modelRouting().meal_candidate_generation;
    const askedAt = Date.now();
    try {
      const response = await generateContent({
        model,
        system: "Reply with JSON only.",
        prompt: 'Return exactly {"ok":true}',
        maxOutputTokens: 64,
      });
      gemini = {
        checked: true,
        ok: true,
        model: response.model,
        ms: Date.now() - askedAt,
        attempts: response.attempts,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        // Trimmed, and it is our own trivial prompt — no household data.
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

  return ok({ config, database, gemini, ms: Date.now() - startedAt });
}
