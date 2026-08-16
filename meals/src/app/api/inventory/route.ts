import { z } from "zod";
import { getDb } from "@/lib/db";
import { addDays, todayISO } from "@/lib/date";
import { fail, handle, readJson } from "@/lib/http";
import { estimateShelfLifeDays } from "@/lib/receipt/normalize";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => ({ items: await getDb().listInventory() }));
}

const createSchema = z.object({
  normalized_name: z.string().min(1).max(120),
  category: z.string().min(1).max(40).default("Other"),
  storage_location: z.enum(["Fridge", "Pantry", "Freezer", "Produce"]).default("Pantry"),
  quantity: z.number().positive().max(99).default(1),
  package_size: z.string().max(40).nullable().default(null),
  status: z.enum(["full", "some", "low", "out"]).default("full"),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Give the item a name before adding it.", 400);

  return handle(async () => {
    const db = getDb();
    const today = todayISO();
    const input = parsed.data;
    const [item] = await db.addInventoryItems([
      {
        normalized_name: input.normalized_name,
        raw_name: null,
        category: input.category,
        storage_location: input.storage_location,
        quantity: input.quantity,
        package_size: input.package_size,
        status: input.status,
        purchase_date: today,
        estimated_expiry: addDays(
          today,
          estimateShelfLifeDays(input.normalized_name, input.storage_location),
        ),
        nutrition_food_id: null,
        nutrition_source: null,
        nutrition_confidence: null,
        calories_per_100g: null,
        protein_per_100g: null,
        serving_size: null,
        confidence: 1,
        receipt_item_id: null,
        receipt_id: null,
      },
    ]);

    await db.addInventoryEvent({
      inventory_item_id: item.id,
      event_type: "manual_adjustment",
      from_status: null,
      to_status: item.status,
      detail: "Added by hand",
    });

    return item;
  });
}
