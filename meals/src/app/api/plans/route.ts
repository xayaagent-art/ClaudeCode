import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const startDate = new URL(request.url).searchParams.get("start_date") ?? todayISO();
  return handle(async () => ({ plan: await getDb().getCurrentPlan(startDate) }));
}

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  kind: z.enum(["recipe", "leftovers", "eating_out"]),
  recipe_id: z.string().nullable(),
  recipe_title: z.string().nullable(),
  note: z.string().nullable(),
});

const bodySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(entrySchema),
});

/** Replaces a week's entries — used by swap, eating-out and manual edits. */
export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("That plan change isn't valid.", 400);
  return handle(() => getDb().savePlan(parsed.data));
}
