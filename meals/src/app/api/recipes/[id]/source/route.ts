import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { fail, handle } from "@/lib/http";
import { buildHouseholdContext } from "@/lib/household/context";
import { resolveRecipeSource } from "@/lib/meals/discovery-service";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Explicitly (re)resolve the cooking source for a recipe.
 *
 * This is the only path that spends external quota on a recipe view, and it is
 * user-initiated ("find a different video"). Normal viewing reads the cached
 * source off the recipe.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const force = new URL(request.url).searchParams.get("force") === "true";

  const recipe = await getDb().getRecipe(id);
  if (!recipe) return fail("We couldn't find that recipe.", 404);

  return handle(async () => {
    const { context } = await buildHouseholdContext("dinner", todayISO());
    const outcome = await resolveRecipeSource(recipe, context, { force });
    return {
      outcome: outcome.outcome,
      reason: outcome.reason,
      video_url: outcome.recipe.video_url,
      video_platform: outcome.recipe.video_platform,
      thumbnail_url: outcome.recipe.thumbnail_url,
      source_name: outcome.recipe.source_name,
      attribution: outcome.recipe.attribution,
    };
  });
}
