import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

const bodySchema = z.object({
  event: z.enum([
    // Current vocabulary.
    "recommendation_shown",
    "recommendation_dismissed",
    "recipe_opened",
    "video_opened",
    // Only recorded where playback is genuinely observable. Opening YouTube in
    // a new tab is not, so that path records video_opened and stops there
    // rather than inventing a completion nobody measured.
    "video_started",
    "video_completed",
    "planned",
    "cooked",
    // Older names still sent by existing clients.
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
 * Household learning signals.
 *
 * These are read now: meals/behavior.ts folds them into ranking pressure, so a
 * dismissal, an opened recipe or a cooked dinner changes what gets suggested
 * next. Both the current and the legacy event names are accepted and normalised
 * on read, which is what lets the vocabulary move without stranding history.
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
