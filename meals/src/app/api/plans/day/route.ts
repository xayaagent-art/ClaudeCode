import { z } from "zod";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { fail, handle, readJson } from "@/lib/http";
import { buildHouseholdContext } from "@/lib/household/context";
import { behaviorAdjustment, summarizeBehavior } from "@/lib/meals/behavior";
import { generateMealCandidates } from "@/lib/meals/candidates";
import { dedupeAgainstMemory, isNearDuplicate } from "@/lib/meals/memory";
import { materialize } from "@/lib/meals/registry";
import { rankRecipes } from "@/lib/meals/rank";
import type { PlanEntry, Recipe } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
 * The replacement is generated, not looked up. Ranking the existing library
 * was fast but bounded by it — after a few swaps the library is exhausted and
 * the answer becomes "there's nothing else", which is a statement about our
 * storage rather than about dinner. One targeted generation for one day costs
 * a single request and is the same path the nightly recommender uses; the
 * library is the fallback when that fails, not the source.
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
    const signals = await db.listSignals(300);
    const behavior = summarizeBehavior(signals, known, plan);

    // Everything the week already uses, so the replacement is genuinely new.
    const otherDays = plan.entries.filter(
      (entry) => entry.meal_type === "dinner" && entry.date !== date && entry.recipe_id,
    );
    const excludedIds = new Set(otherDays.map((entry) => entry.recipe_id as string));
    const current = plan.entries.find(
      (entry) => entry.date === date && entry.meal_type === "dinner",
    );
    if (current?.recipe_id) excludedIds.add(current.recipe_id);

    // The dishes the swap must not land back on, as recipes rather than ids, so
    // a freshly generated near-duplicate of Wednesday is caught too.
    const avoid = known.filter((recipe) => excludedIds.has(recipe.id));

    // One targeted generation for this one day.
    const generated = await generateMealCandidates(context, {
      count: 8,
      exclude: [
        ...context.recent_meals.map((meal) => meal.title),
        ...avoid.map((recipe) => recipe.title),
      ],
      planned: otherDays
        .map((entry) => entry.recipe_title)
        .filter((title): title is string => Boolean(title)),
    });
    const { fresh } = dedupeAgainstMemory(generated.recipes, known);

    const pool = [...known.filter((recipe) => !excludedIds.has(recipe.id)), ...fresh].filter(
      (recipe) => !avoid.some((planned) => isNearDuplicate(planned, recipe)),
    );

    const ranked = rankRecipes(pool, inventory, context, date)
      .map((entry) => ({
        ...entry,
        // A dish already committed to elsewhere this week is not a swap, and one
        // cooked two days ago is not a change of scene.
        score:
          Math.round(
            (entry.score + behaviorAdjustment(entry.recipe, behavior, { casualAlternative: true }).delta) *
              1000,
          ) / 1000,
      }))
      .sort((a, b) => b.score - a.score);

    const choice = ranked[0];
    if (!choice) throw new Error("We couldn't find another dinner that fits this week.");

    // Identity before display: the plan entry is a link the user will tap.
    const durable: Recipe =
      (await materialize([choice.recipe])).get(choice.recipe.id) ?? choice.recipe;

    const entries: PlanEntry[] = plan.entries.map((entry) =>
      entry.date === date && entry.meal_type === "dinner"
        ? {
            ...entry,
            kind: "recipe" as const,
            recipe_id: durable.id,
            recipe_title: durable.title,
            note: choice.reason,
          }
        : entry,
    );

    const saved = await db.savePlan({ start_date: plan.start_date, entries });

    // Committing to a dinner is a preference signal in its own right.
    await db.addSignal({
      event: "recommendation_selected",
      recipe_id: durable.id,
      cuisine: durable.cuisine,
      member_id: null,
      detail: { surface: "plan_day_swap", date },
    });

    return {
      plan: saved,
      replaced: { date, recipe_id: durable.id },
      // Says plainly whether this came from the model or from the shelf.
      source: generated.outcome === "generated" && fresh.some((r) => r.id === choice.recipe.id)
        ? "generated"
        : "library",
      generation_failed: generated.outcome === "failed",
    };
  });
}
