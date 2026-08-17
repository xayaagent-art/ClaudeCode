import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { recommendMeals } from "@/lib/meals/recommend";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  count: z.number().int().min(1).max(5).default(3),
  exclude_recipe_ids: z.array(z.string()).default([]),
  /** True when the user asked for a different set — turns up the novelty penalty. */
  regenerate: z.boolean().default(false),
});

export async function POST(request: Request) {
  const body = await readJson<unknown>(request).catch(() => ({}));
  const parsed = bodySchema.parse(body ?? {});

  return handle(() =>
    recommendMeals({
      mealType: parsed.meal_type,
      count: parsed.count,
      excludeRecipeIds: parsed.exclude_recipe_ids,
      regenerate: parsed.regenerate,
    }),
  );
}
