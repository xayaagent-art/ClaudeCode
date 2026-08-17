import "server-only";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/date";
import { inspectAll } from "@/lib/kitchen/state";
import { chooseConfirmations, type ConfirmationPrompt } from "@/lib/kitchen/confirmations";
import { logsForDay, targetsFor, totalsFor } from "@/lib/nutrition/engine";
import type { MealRecommendation } from "@/lib/types";

export interface TodayPayload {
  date: string;
  members: { id: string; name: string; calorie_target: number; protein_target: number }[];
  progress: {
    scope: string;
    name: string;
    consumed: { calories: number; protein: number };
    target: { calories: number; protein: number };
  }[];
  meals_today: {
    batch_id: string;
    recipe_id: string;
    title: string;
    member_id: string;
    meal_type: string;
    calories: number;
    protein: number;
  }[];
  use_soon: { id: string; name: string; label: string; past_best: boolean }[];
  /** At most two questions, usually none. */
  confirmations: ConfirmationPrompt[];
  inventory_count: number;
  latest_recommendation:
    | (Pick<MealRecommendation, "recipe_id" | "recommendation_reason" | "availability"> & {
        title: string;
        cuisine: string;
        total_time_minutes: number;
        protein_per_serving: number;
        calories_per_serving: number;
        image_url: string | null;
      })
    | null;
}

/** Single source of truth for the Today screen, used by the page and the API. */
export async function getTodayPayload(date = todayISO()): Promise<TodayPayload> {
  const db = getDb();
  const [members, logs, inventory, recommendations, events, recipes] = await Promise.all([
    db.listMembers(),
    db.listMealLogs(),
    db.listInventory(),
    db.listRecommendations(6),
    db.listInventoryEvents(300),
    db.listRecipes(),
  ]);

  const insights = inspectAll(inventory, events, date);

  const todaysLogs = logsForDay(logs, date);
  const scopes = [
    { id: null as string | null, name: "Household" },
    ...members.map((m) => ({ id: m.id as string | null, name: m.name })),
  ];

  // The headline suggestion is the most recent one the household has not eaten
  // yet AND that still resolves to a real recipe. Walking the list rather than
  // taking the first row matters: a recommendation whose recipe has since been
  // removed used to blank the whole card, and an older catalog row could sit
  // there looking current. Today now shows the newest suggestion that can
  // actually be opened, from the same store every other screen reads.
  const eatenToday = new Set(todaysLogs.map((log) => log.recipe_id));
  let pending: (typeof recommendations)[number] | undefined;
  let recipe: Awaited<ReturnType<typeof db.getRecipe>> = null;
  for (const candidate of recommendations) {
    if (eatenToday.has(candidate.recipe_id)) continue;
    const resolved = await db.getRecipe(candidate.recipe_id);
    if (!resolved) continue;
    pending = candidate;
    recipe = resolved;
    break;
  }

  return {
    date,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      calorie_target: m.profile.calorie_target,
      protein_target: m.profile.protein_target,
    })),
    progress: scopes.map((scope) => ({
      scope: scope.id ?? "household",
      name: scope.name,
      consumed: totalsFor(todaysLogs, scope.id),
      target: targetsFor(members, scope.id),
    })),
    meals_today: todaysLogs.map((log) => ({
      batch_id: log.batch_id,
      recipe_id: log.recipe_id,
      title: log.recipe_title,
      member_id: log.member_id,
      meal_type: log.meal_type,
      calories: log.calories,
      protein: log.protein,
    })),
    use_soon: insights
      .filter((insight) => insight.use_soon && insight.status !== "out")
      .sort((a, b) => b.use_soon_score - a.use_soon_score)
      .slice(0, 5)
      .map((insight) => ({
        id: insight.item.id,
        name: insight.item.normalized_name,
        label: insight.freshness_label,
        past_best: insight.likely_past_best,
      })),
    confirmations: chooseConfirmations({
      insights,
      recommendationDependencies: recommendations.flatMap(
        (rec) =>
          recipes.find((r) => r.id === rec.recipe_id)?.ingredients.map((i) => i.ingredient_name) ??
          [],
      ),
      today: date,
    }),
    inventory_count: inventory.filter((i) => i.status !== "out").length,
    latest_recommendation:
      pending && recipe
        ? {
            recipe_id: pending.recipe_id,
            recommendation_reason: pending.recommendation_reason,
            availability: pending.availability,
            title: recipe.title,
            cuisine: recipe.cuisine,
            total_time_minutes: recipe.total_time_minutes,
            protein_per_serving: recipe.protein_per_serving,
            calories_per_serving: recipe.calories_per_serving,
            image_url: recipe.image_url,
          }
        : null,
  };
}
