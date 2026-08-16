import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";
import { canonicalName } from "@/lib/kitchen/match";

export const runtime = "nodejs";

const bodySchema = z.object({
  recipe_id: z.string().min(1),
  rating: z.enum(["love", "fine", "never"]),
  /** Omit to record the same rating for everyone in the household. */
  member_id: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("That feedback isn't valid.", 400);

  return handle(async () => {
    const db = getDb();
    const [recipe, members] = await Promise.all([
      db.getRecipe(parsed.data.recipe_id),
      db.listMembers(),
    ]);
    if (!recipe) throw new Error("Unknown recipe");

    // Feedback is stored against cuisine and main ingredients too, so it can
    // shape recommendations for dishes the household has never cooked.
    const mainIngredients = recipe.ingredients
      .filter((i) => !i.optional)
      .slice(0, 4)
      .map((i) => canonicalName(i.ingredient_name));

    const targets = parsed.data.member_id
      ? members.filter((m) => m.id === parsed.data.member_id)
      : members;

    for (const member of targets) {
      await db.addFeedback({
        member_id: member.id,
        recipe_id: recipe.id,
        rating: parsed.data.rating,
        cuisine: recipe.cuisine,
        main_ingredients: mainIngredients,
      });
    }

    return { recorded: targets.length };
  });
}
