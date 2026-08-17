import { AIFailure } from "@/lib/ai/failure";

/**
 * Image validation, before a model call is made.
 *
 * A browser's `file.type` is whatever the OS guessed from the extension, so it
 * is a hint rather than a fact. Sniffing the leading bytes catches a renamed
 * PDF, a truncated upload, or an empty file locally — for free, and before we
 * spend anything asking a vision model to look at it.
 */

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Below this, there is no photograph of a receipt in there. */
const MIN_BYTES = 512;

function startsWith(bytes: Buffer, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** ISO base-media brand, e.g. "heic" / "mif1" for HEIF stills. */
function ftypBrand(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.toString("ascii", 4, 8) !== "ftyp") return null;
  return bytes.toString("ascii", 8, 12).toLowerCase();
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** The format the bytes actually are, or null when they aren't a known image. */
export function sniffImageFormat(bytes: Buffer): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  const brand = ftypBrand(bytes);
  if (brand && HEIF_BRANDS.has(brand)) return "image/heic";

  return null;
}

export interface ValidatedImage {
  /** The true format, which may differ from what the client claimed. */
  mimeType: ImageFormat;
  bytes: number;
}

/**
 * Throw unless these bytes are an image a vision model can decode.
 *
 * The thrown failure is deliberately not retryable: the same file will fail the
 * same way, and telling someone to "try again" with a PDF is a dead end.
 */
export function assertReadableImage(bytes: Buffer): ValidatedImage {
  if (bytes.length === 0) {
    throw new AIFailure("invalid_image", "upload was empty");
  }
  if (bytes.length < MIN_BYTES) {
    throw new AIFailure("invalid_image", `upload was only ${bytes.length} bytes`);
  }

  const format = sniffImageFormat(bytes);
  if (!format) {
    // Byte values only — never the content itself.
    const head = bytes.subarray(0, 4).toString("hex");
    throw new AIFailure("invalid_image", `unrecognised image header 0x${head}`);
  }

  return { mimeType: format, bytes: bytes.length };
}
