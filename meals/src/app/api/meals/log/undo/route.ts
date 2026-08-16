import { z } from "zod";
import { fail, handle, readJson } from "@/lib/http";
import { undoMeal } from "@/lib/meals/log";

export const runtime = "nodejs";

const bodySchema = z.object({ batch_id: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Nothing to undo.", 400);
  return handle(() => undoMeal(parsed.data.batch_id));
}
