import "server-only";
import { getDb } from "@/lib/db";
import { daysToExpiry, todayISO } from "@/lib/date";
import { USE_SOON_DAYS, isAvailable } from "@/lib/kitchen/match";
import { logsForDay, totalsFor } from "@/lib/nutrition/engine";
import type { HouseholdContext, InventoryItem, MealType, Member } from "@/lib/types";

/**
 * Assembles the structured context every downstream decision reads from.
 * Nothing builds a free-form prompt out of raw rows — the recommender, the
 * planner and the AI tool layer all consume this one shape.
 */
export async function buildHouseholdContext(
  mealType: MealType = "dinner",
  today = todayISO(),
): Promise<{ context: HouseholdContext; inventory: InventoryItem[]; members: Member[] }> {
  const db = getDb();
  const [household, members, inventory, logs, feedback, recipes] = await Promise.all([
    db.getHousehold(),
    db.listMembers(),
    db.listInventory(),
    db.listMealLogs(),
    db.listFeedback(),
    db.listRecipes(),
  ]);

  const todaysLogs = logsForDay(logs, today);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  const contextMembers = members.map((member) => {
    const totals = totalsFor(todaysLogs, member.id);
    return {
      id: member.id,
      name: member.name,
      calorie_target: member.profile.calorie_target,
      protein_target: member.profile.protein_target,
      calories_remaining: member.profile.calorie_target - totals.calories,
      protein_remaining: member.profile.protein_target - totals.protein,
    };
  });

  // Household preferences are the intersection of what everyone will eat and the
  // union of what anyone enjoys — restrictions narrow, tastes broaden.
  const preferredCuisines = [
    ...new Set(members.flatMap((m) => m.profile.preferred_cuisines)),
  ];
  const vegetarian = members.some((m) => m.profile.dietary_preferences.includes("vegetarian"));
  const eggsAllowed = members.every((m) => m.profile.dietary_preferences.includes("eggs"));
  const chickenAllowed = members.every((m) =>
    m.profile.dietary_preferences.some((p) => p === "chicken" || p === "occasional_chicken"),
  );

  const available = inventory.filter(isAvailable);

  const useSoon = available
    .map((item) => ({ item, days: daysToExpiry(item.estimated_expiry, today) }))
    .filter((x): x is { item: InventoryItem; days: number } => x.days !== null && x.days <= USE_SOON_DAYS)
    .sort((a, b) => a.days - b.days)
    .map((x) => ({ name: x.item.normalized_name, days_to_expiry: x.days }));

  // De-duplicate meal history by recipe: the recommender only cares how recently
  // each dish was eaten, not how many people ate it.
  const seen = new Set<string>();
  const recentMeals: HouseholdContext["recent_meals"] = [];
  for (const log of logs) {
    if (seen.has(log.recipe_id)) continue;
    seen.add(log.recipe_id);
    const daysAgo = Math.max(
      0,
      Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(log.consumed_at)) / 86_400_000),
    );
    if (daysAgo > 21) continue;
    recentMeals.push({
      recipe_id: log.recipe_id,
      title: log.recipe_title,
      cuisine: recipeById.get(log.recipe_id)?.cuisine ?? "Other",
      days_ago: daysAgo,
    });
  }

  const context: HouseholdContext = {
    meal_type: mealType,
    date: today,
    household: {
      id: household.id,
      name: household.name,
      members: contextMembers,
    },
    preferences: {
      preferred_cuisines: preferredCuisines,
      max_cooking_time_minutes: Math.min(...members.map((m) => m.profile.max_cooking_time)),
      vegetarian,
      eggs_allowed: eggsAllowed,
      chicken_allowed: chickenAllowed,
      allergies: [...new Set(members.flatMap((m) => m.profile.allergies))],
      dislikes: [...new Set(members.flatMap((m) => m.profile.dislikes))],
      spice_preference: members.some((m) => m.profile.spice_preference === "mild")
        ? "mild"
        : members.some((m) => m.profile.spice_preference === "hot")
          ? "hot"
          : "medium",
      repeat_tolerance:
        members.reduce((acc, m) => acc + m.profile.repeat_tolerance, 0) / (members.length || 1),
    },
    inventory: available.map((item) => ({
      name: item.normalized_name,
      category: item.category,
      status: item.status,
      days_to_expiry: daysToExpiry(item.estimated_expiry, today),
    })),
    recent_meals: recentMeals,
    use_soon: useSoon,
    feedback: feedback.map((f) => ({
      recipe_id: f.recipe_id,
      cuisine: f.cuisine,
      rating: f.rating,
    })),
  };

  return { context, inventory, members };
}
