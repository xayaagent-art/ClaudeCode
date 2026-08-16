import { getDb } from "@/lib/db";
import { readReceiptImage } from "@/lib/receipt/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Receipt images are private. They are streamed through this route rather than
 * given a public URL, and are marked no-store so no cache keeps a copy.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const receipt = await getDb().getReceipt(id);
  if (!receipt?.image_path) return new Response("Not found", { status: 404 });

  const image = await readReceiptImage(receipt.image_path);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
