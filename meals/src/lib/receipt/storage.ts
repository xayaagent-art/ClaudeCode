import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "@/lib/db/supabase";

/**
 * Receipt image storage.
 *
 * Receipts carry card digits and store detail, so images are never public.
 * Supabase Storage uses a private bucket read through short-lived signed URLs;
 * the local fallback writes outside the served directory and is streamed back
 * through an API route. Deletion removes the bytes, not just the row.
 */

const BUCKET = "receipts";

function localDir(): string {
  const base = process.env.VERCEL ? "/tmp" : process.cwd();
  return path.join(base, ".data", "receipts");
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic")) return "heic";
  return "jpg";
}

export async function storeReceiptImage(bytes: Buffer, mimeType: string): Promise<string> {
  const name = `${randomUUID()}.${extensionFor(mimeType)}`;

  if (supabaseConfigured()) {
    const { error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .upload(name, bytes, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`receipt upload failed: ${error.message}`);
    return name;
  }

  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(localDir(), name), bytes);
  return name;
}

export async function readReceiptImage(
  imagePath: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const safe = path.basename(imagePath);
  const mimeType = safe.endsWith(".png")
    ? "image/png"
    : safe.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  if (supabaseConfigured()) {
    const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(safe);
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), mimeType };
  }

  try {
    return { bytes: await fs.readFile(path.join(localDir(), safe)), mimeType };
  } catch {
    return null;
  }
}

export async function deleteReceiptImage(imagePath: string): Promise<void> {
  const safe = path.basename(imagePath);
  if (supabaseConfigured()) {
    await supabaseAdmin().storage.from(BUCKET).remove([safe]);
    return;
  }
  await fs.rm(path.join(localDir(), safe), { force: true });
}
