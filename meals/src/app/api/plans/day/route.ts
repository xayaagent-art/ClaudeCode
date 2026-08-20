import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { fail, handle, readJson } from "@/lib/http";
import { buildHouseholdContext } from "@/lib/household/context";
import { rankRecipes } from "@/lib/meals/rank";
import type { PlanEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Swap one dinner without touching the rest of the week.
 *
 * Changing Thursday used to mean regenerating all seven days: the only way to
 * get a different dinner was "Regenerate week", which threw away six choices
 * the household was happy with to fix the one it was not. This replaces a
 * single entry and saves the same plan back.
 *
 * It ranks the household's existing library rather than generating, so the
 * swap returns in the time it takes to read the kitchen. Every other dinner
 * already in the week is excluded, so a swap cannot produce a duplicate.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request).catch(() => ({})));
  if (!parsed.success) return fail("That day isn't valid.", 400);
  const { start_date: startDate, date } = parsed.data;

  return handle(async () => {
    const db = getDb();
    const plan = await db.getCurrentPlan(startDate);
    if (!plan) throw new Error("There's no saved plan to change.");

    const { context, inventory } = await buildHouseholdContext("dinner", todayISO());
    const known = await db.listRecipes();

    // Everything the week already uses, so the replacement is genuinely new.
    const alreadyPlanned = new Set(
      plan.entries
        .filter((entry) => entry.meal_type === "dinner" && entry.date !== date && entry.recipe_id)
        .map((entry) => entry.recipe_id as string),
    );
    const current = plan.entries.find(
      (entry) => entry.date === date && entry.meal_type === "dinner",
    );
    if (current?.recipe_id) alreadyPlanned.add(current.recipe_id);

    const ranked = rankRecipes(
      known.filter((recipe) => !alreadyPlanned.has(recipe.id)),
      inventory,
      context,
      date,
    );
    const choice = ranked[0];
    if (!choice) throw new Error("There's nothing else in your library that fits this week.");

    const entries: PlanEntry[] = plan.entries.map((entry) =>
      entry.date === date && entry.meal_type === "dinner"
        ? {
            ...entry,
            kind: "recipe" as const,
            recipe_id: choice.recipe.id,
            recipe_title: choice.recipe.title,
            note: choice.reason,
          }
        : entry,
    );

    const saved = await db.savePlan({ start_date: plan.start_date, entries });
    return { plan: saved, replaced: { date, recipe_id: choice.recipe.id } };
  });
}
