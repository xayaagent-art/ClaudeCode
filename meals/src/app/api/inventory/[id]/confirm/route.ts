import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["full", "some", "low", "out"]),
});

/**
 * A human answering "still have spinach?".
 *
 * This is the highest-quality observation the system can get, so it sets
 * confidence to certain and stamps last_confirmed_at — which in turn stops the
 * confirmation engine asking again for a while.
 */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("That answer isn't valid.", 400);

  return handle(async () => {
    const db = getDb();
    const before = await db.getInventoryItem(id);
    if (!before) throw new Error("Unknown inventory item");

    const now = new Date().toISOString();
    const updated = await db.updateInventoryItem(id, {
      status: parsed.data.status,
      status_confidence: 1,
      status_source: "user",
      last_confirmed_at: now,
    });

    await db.addInventoryEvent({
      inventory_item_id: id,
      event_type: "user_confirmation",
      from_status: before.status,
      to_status: parsed.data.status,
      detail: "Confirmed by you",
    });

    return updated;
  });
}
