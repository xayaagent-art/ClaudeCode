import "server-only";
import { getDb } from "@/lib/db";
import { addDays, todayISO } from "@/lib/date";
import type { PlanEntry } from "@/lib/types";

/**
 * The week, as something you can look at.
 *
 * Plan used to render its stored entries directly, which meant a list of
 * titles: the entry knows a recipe id and a name and nothing else. A visual
 * week needs the dish behind each day — its picture, how long it takes, what
 * it gives you — so each day is resolved through the same lookup /recipes/[id]
 * uses. A day whose recipe no longer resolves is shown as unplanned rather
 * than as a card that 404s when tapped.
 */

export interface PlanDay {
  date: string;
  /** "recipe" | "leftovers" | "eating_out" | "empty" */
  kind: PlanEntry["kind"] | "empty";
  note: string | null;
  recipe: {
    id: string;
    title: string;
    cuisine: string;
    total_time_minutes: number;
    protein_per_serving: number;
    thumbnail_url: string | null;
    image_url: string | null;
  } | null;
}

export interface PlanPayload {
  start_date: string;
  /** Inclusive range label, e.g. "Aug 17 – 23". */
  days: PlanDay[];
  has_plan: boolean;
  kitchen_empty: boolean;
}

export async function getPlanPayload(start = todayISO(), span = 7): Promise<PlanPayload> {
  const db = getDb();
  const [plan, inventory] = await Promise.all([db.getCurrentPlan(start), db.listInventory()]);

  const dates = Array.from({ length: span }, (_, index) => addDays(start, index));
  const dinners = new Map(
    (plan?.entries ?? [])
      .filter((entry) => entry.meal_type === "dinner")
      .map((entry) => [entry.date, entry]),
  );

  // One lookup per distinct recipe rather than per day, since a week can
  // legitimately repeat a dish.
  const ids = [
    ...new Set(
      [...dinners.values()]
        .map((entry) => entry.recipe_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const recipes = new Map(
    (await Promise.all(ids.map((id) => db.getRecipe(id))))
      .filter((recipe) => recipe !== null)
      .map((recipe) => [recipe!.id, recipe!]),
  );

  const days: PlanDay[] = dates.map((date) => {
    const entry = dinners.get(date);
    if (!entry) return { date, kind: "empty", note: null, recipe: null };

    const recipe = entry.recipe_id ? recipes.get(entry.recipe_id) : undefined;
    return {
      date,
      // An entry that says "recipe" but resolves to nothing is not a recipe day.
      kind: entry.kind === "recipe" && !recipe ? "empty" : entry.kind,
      note: entry.note,
      recipe: recipe
        ? {
            id: recipe.id,
            title: recipe.title,
            cuisine: recipe.cuisine,
            total_time_minutes: recipe.total_time_minutes,
            protein_per_serving: recipe.protein_per_serving,
            thumbnail_url: recipe.thumbnail_url,
            image_url: recipe.image_url,
          }
        : null,
    };
  });

  return {
    start_date: plan?.start_date ?? start,
    days,
    has_plan: Boolean(plan) && days.some((day) => day.kind !== "empty"),
    kitchen_empty: inventory.filter((item) => item.status !== "out").length === 0,
  };
}
