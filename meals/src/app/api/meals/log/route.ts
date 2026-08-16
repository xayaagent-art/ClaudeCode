import { z } from "zod";
import { fail, handle, readJson } from "@/lib/http";
import { logMeal } from "@/lib/meals/log";

export const runtime = "nodejs";

const bodySchema = z.object({
  recipe_id: z.string().min(1),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  servings_by_member: z.record(z.string(), z.number().positive().max(6)).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("We couldn't log that meal.", 400);
  return handle(() => logMeal(parsed.data));
}
