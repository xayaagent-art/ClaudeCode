import { getDb } from "@/lib/db";
import { fail, handle } from "@/lib/http";
import { deleteReceiptImage } from "@/lib/receipt/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  const receipt = await db.getReceipt(id);
  if (!receipt) return fail("Receipt not found.", 404);

  return handle(async () => ({
    receipt,
    items: await db.listReceiptItems(id),
  }));
}

/** Deleting a receipt removes the stored image too, not just the row. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getDb();
  const receipt = await db.getReceipt(id);
  if (!receipt) return fail("Receipt not found.", 404);

  return handle(async () => {
    if (receipt.image_path) await deleteReceiptImage(receipt.image_path);
    await db.updateReceipt(id, { image_path: null });
    return { deleted: true };
  });
}
