import { getDb } from "@/lib/db";
import { handle } from "@/lib/http";
import { todayISO } from "@/lib/date";
import { chooseConfirmations } from "@/lib/kitchen/confirmations";
import { inspectAll } from "@/lib/kitchen/state";

export const runtime = "nodejs";

/**
 * The small set of inventory questions worth asking right now.
 * Usually empty — that is the intended state.
 */
export async function GET() {
  return handle(async () => {
    const db = getDb();
    const [items, events, recommendations, recipes] = await Promise.all([
      db.listInventory(),
      db.listInventoryEvents(300),
      db.listRecommendations(3),
      db.listRecipes(),
    ]);

    // What tonight's suggestions actually lean on, so we only ask about
    // ingredients whose answer would change a recommendation.
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const dependencies = recommendations.flatMap(
      (rec) => recipeById.get(rec.recipe_id)?.ingredients.map((i) => i.ingredient_name) ?? [],
    );

    const prompts = chooseConfirmations({
      insights: inspectAll(items, events, todayISO()),
      recommendationDependencies: dependencies,
    });

    return { prompts };
  });
}
