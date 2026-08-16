import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const patchSchema = z.object({
  normalized_name: z.string().min(1).max(120).optional(),
  quantity: z.number().positive().max(99).optional(),
  category: z.string().min(1).max(40).optional(),
  storage_location: z.enum(["Fridge", "Pantry", "Freezer", "Produce"]).optional(),
  classification: z.enum(["human_food", "non_food", "pet_food", "uncertain"]).optional(),
  included: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const { itemId } = await params;
  const body = await readJson<unknown>(request);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("That change isn't valid.", 400);

  return handle(async () => {
    // A user edit is authoritative: accepting it makes the line high-confidence.
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.normalized_name || parsed.data.classification) {
      patch.confidence = 1;
      patch.notes = null;
    }
    return getDb().updateReceiptItem(itemId, patch);
  });
}
