import { z } from "zod";
import { getDb } from "@/lib/db";
import { fail, handle, readJson } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Clearing the kitchen.
 *
 * Two scopes, both destructive, both explicit. `demo` removes only the starter
 * pantry the app shipped with — identifiable because seeded rows carry
 * status_source "seed" and have no receipt behind them, while anything real
 * arrived from a scan. `all` empties the kitchen outright.
 *
 * Nothing else is touched: household, both members, preferences, targets,
 * recipe memory, cook history and meal logs all survive. This endpoint only
 * ever deletes inventory rows, and only when asked by name.
 */
const bodySchema = z.object({
  scope: z.enum(["demo", "all"]),
  /** Must echo the scope. Guards against an accidental or replayed request. */
  confirm: z.string(),
});

export async function POST(request: Request) {
  const body = await readJson<unknown>(request).catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("Tell us what to clear.", 400);
  if (parsed.data.confirm !== parsed.data.scope) {
    return fail("That reset wasn't confirmed.", 400);
  }

  return handle(async () => {
    const db = getDb();
    const inventory = await db.listInventory();

    const doomed =
      parsed.data.scope === "all"
        ? inventory
        : inventory.filter(
            (item) => item.status_source === "seed" && !item.receipt_id && !item.receipt_item_id,
          );

    for (const item of doomed) await db.deleteInventoryItem(item.id);

    return {
      removed: doomed.length,
      remaining: inventory.length - doomed.length,
      scope: parsed.data.scope,
    };
  });
}
