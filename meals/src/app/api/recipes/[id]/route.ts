import { fail, handle } from "@/lib/http";
import { getRecipeDetail } from "@/lib/views/recipe";
import type { MealType } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const mealType = (new URL(request.url).searchParams.get("meal_type") ?? "dinner") as MealType;

  const detail = await getRecipeDetail(id, mealType);
  if (!detail) return fail("We couldn't find that recipe.", 404);
  return handle(async () => detail);
}
