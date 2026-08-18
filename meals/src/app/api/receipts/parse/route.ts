import { fail, handle } from "@/lib/http";
import { ingestReceipt } from "@/lib/receipt/service";
import { groupForReview } from "@/lib/receipt/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  // These four are request-shape problems the server can answer without
  // touching storage or a model. Content validation happens deeper in, where
  // the bytes themselves are sniffed.
  if (!(file instanceof File)) {
    return fail("Attach a receipt photo to scan.", 400, { kind: "invalid_image", retryable: false });
  }
  if (file.size === 0) {
    return fail("That file was empty. Try taking the photo again.", 400, {
      kind: "invalid_image",
      retryable: false,
    });
  }
  if (file.size > MAX_BYTES) {
    return fail("That image is too large. Try a photo under 12 MB.", 413, {
      kind: "invalid_image",
      retryable: false,
    });
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    return fail("Receipts need to be a photo — JPEG, PNG or HEIC.", 415, {
      kind: "invalid_image",
      retryable: false,
    });
  }

  const startedAt = Date.now();

  return handle(async () => {
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await ingestReceipt(bytes, file.type || "image/jpeg");
    const buckets = groupForReview(result.items);

    // Sizes and counts only — never the image, the prompt, or the model reply.
    // eslint-disable-next-line no-console
    console.info(
      "[receipts/parse]",
      JSON.stringify({
        ms: Date.now() - startedAt,
        parser: result.parser,
        bytes: bytes.length,
        items: result.items.length,
        review: buckets.review.length,
        duplicate: Boolean(result.duplicate_of),
      }),
    );
    return {
      receipt: result.receipt,
      items: result.items,
      parser: result.parser,
      warnings: result.warnings,
      duplicate_of: result.duplicate_of,
      mappings_applied: result.mappings_applied,
      counts: {
        food: buckets.ready.length + buckets.review.length,
        ready: buckets.ready.length,
        review: buckets.review.length,
        excluded: buckets.excluded.length,
      },
    };
  });
}
