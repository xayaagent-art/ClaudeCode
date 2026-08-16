import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  event: z.enum([
    "recommendation_seen",
    "recommendation_selected",
    "recipe_viewed",
    "recipe_video_opened",
    "external_source_opened",
    "meal_logged",
    "recommendation_regenerated",
    "meal_disliked",
  ]),
  recipe_id: z.string().max(120).nullable().default(null),
  cuisine: z.string().max(60).nullable().default(null),
  member_id: z.string().max(60).nullable().default(null),
  detail: z
    .record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]))
    .default({}),
});

/**
 * Household learning signals. Persisted only — nothing consumes them for
 * ranking yet, which is deliberate: capture the history first, model later.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("That signal isn't valid.", 400);

  return handle(async () => {
    await getDb().addSignal(parsed.data);
    return { recorded: true };
  });
}

export async function GET() {
  return handle(async () => ({ signals: await getDb().listSignals(100) }));
}
