import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";
import { tools } from "@/lib/ai/tools";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  normalized_name: z.string().min(1).max(120).optional(),
  status: z.enum(["full", "some", "low", "out"]).optional(),
  storage_location: z.enum(["Fridge", "Pantry", "Freezer", "Produce"]).optional(),
  quantity: z.number().positive().max(99).optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("That change isn't valid.", 400);

  return handle(() => tools.update_inventory({ inventory_item_id: id, ...parsed.data }));
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    await getDb().deleteInventoryItem(id);
    return { deleted: true };
  });
}
