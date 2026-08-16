import { fail, handle } from "@/lib/http";
import { ingestReceipt } from "@/lib/receipt/service";
import { groupForReview } from "@/lib/receipt/service";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return fail("Attach a receipt photo to scan.", 400);
  }
  if (file.size === 0) {
    return fail("That file was empty. Try taking the photo again.", 400);
  }
  if (file.size > MAX_BYTES) {
    return fail("That image is too large. Try a photo under 12 MB.", 413);
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    return fail("Receipts need to be a photo — JPEG, PNG or HEIC.", 415);
  }

  return handle(async () => {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await ingestReceipt(bytes, file.type || "image/jpeg");
    const buckets = groupForReview(result.items);
    return {
      receipt: result.receipt,
      items: result.items,
      parser: result.parser,
      warnings: result.warnings,
      counts: {
        food: buckets.ready.length + buckets.review.length,
        ready: buckets.ready.length,
        review: buckets.review.length,
        excluded: buckets.excluded.length,
      },
    };
  });
}
