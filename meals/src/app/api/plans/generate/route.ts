import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { handle, readJson } from "@/lib/http";
import { buildHouseholdContext } from "@/lib/household/context";
import { buildWeekPlan } from "@/lib/meals/plan";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(14).default(7),
});

export async function POST(request: Request) {
  const body = await readJson<unknown>(request).catch(() => ({}));
  const parsed = bodySchema.parse(body ?? {});
  const startDate = parsed.start_date ?? todayISO();

  return handle(async () => {
    const db = getDb();
    const { context, inventory } = await buildHouseholdContext("dinner", startDate);
    const recipes = await db.listRecipes();
    const { entries } = buildWeekPlan(recipes, inventory, context, startDate, parsed.days);
    const plan = await db.savePlan({ start_date: startDate, entries });
    return plan;
  });
}
