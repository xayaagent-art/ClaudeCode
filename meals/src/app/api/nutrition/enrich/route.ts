import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { enrichInventory } from "@/lib/nutrition/enrich";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  receipt_id: z.string().optional(),
  item_ids: z.array(z.string()).optional(),
});

/** Stage 2 of receipt import — safe to call repeatedly, skips resolved items. */
export async function POST(request: Request) {
  const body = await readJson<unknown>(request).catch(() => ({}));
  const parsed = bodySchema.parse(body ?? {});
  return handle(() =>
    enrichInventory({ receiptId: parsed.receipt_id, itemIds: parsed.item_ids }),
  );
}
