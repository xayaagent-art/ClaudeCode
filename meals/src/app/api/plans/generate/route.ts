import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { handle, readJson } from "@/lib/http";
import { buildHouseholdContext } from "@/lib/household/context";
import { buildWeekPlan } from "@/lib/meals/plan";
import { generateMealCandidates } from "@/lib/meals/candidates";
import { dedupeAgainstMemory } from "@/lib/meals/memory";
import { materialize } from "@/lib/meals/registry";

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

  const startedAt = Date.now();

  return handle(async () => {
    const db = getDb();
    const { context, inventory } = await buildHouseholdContext("dinner", startDate);
    const known = await db.listRecipes();

    // A week planned only from the built-in library repeats itself by the third
    // day. The planner now draws from the same dynamic pool the nightly
    // recommender uses, so a week has somewhere to go.
    const generated = await generateMealCandidates(context, {
      exclude: context.recent_meals.map((meal) => meal.title),
    });
    const { fresh } = dedupeAgainstMemory(generated.recipes, known);

    const { entries, planned } = buildWeekPlan(
      [...known, ...fresh],
      inventory,
      context,
      startDate,
      parsed.days,
    );

    // Identity before display: every planned dinner is a link the user will
    // tap, so each one is persisted before the plan is saved — and the entry
    // records the durable id, which may differ when a candidate turns out to
    // be a dish already in the library.
    const durable = await materialize(planned.map((day) => day.recipe));
    const addressable = entries.map((entry) => ({
      ...entry,
      recipe_id: entry.recipe_id ? (durable.get(entry.recipe_id)?.id ?? entry.recipe_id) : entry.recipe_id,
    }));

    const plan = await db.savePlan({ start_date: startDate, entries: addressable });

    // eslint-disable-next-line no-console
    console.info(
      "[plans/generate]",
      JSON.stringify({
        ms: Date.now() - startedAt,
        generation: generated.outcome,
        model: generated.model,
        candidates: generated.recipes.length,
        fresh: fresh.length,
        planned: planned.length,
        materialized: durable.size,
        days: parsed.days,
      }),
    );

    return { ...plan, generation_failed: generated.outcome === "failed" };
  });
}
