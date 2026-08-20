import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { enrichRecipes } from "@/lib/meals/enrichment";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  recipe_ids: z.array(z.string().max(200)).min(1).max(24),
  /** How many may go to the provider in this call; the caller polls for more. */
  limit: z.number().int().min(1).max(6).default(3),
});

/**
 * Fill in imagery for recipes already on screen.
 *
 * Separate from generation on purpose: recommendations return before any video
 * is looked up, and this is what closes the gap afterwards. Safe to call
 * repeatedly — recipes that already have a source are returned untouched and
 * cost nothing, so a surface can poll until every card reports a settled state.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.parse((await readJson<unknown>(request).catch(() => ({}))) ?? {});
  return handle(() => enrichRecipes(parsed.recipe_ids, { limit: parsed.limit }));
}
