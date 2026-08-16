import "server-only";
import type { Database } from "@/lib/db/types";
import { localDatabase } from "@/lib/db/local";
import { supabaseConfigured, supabaseDatabase } from "@/lib/db/supabase";

export type { Database } from "@/lib/db/types";

/**
 * Supabase when it is configured, the local file store otherwise. The local
 * store is a development convenience, not a shipping mode — the Kitchen header
 * surfaces which one is live so it is never ambiguous which data you are seeing.
 */
export function getDb(): Database {
  return supabaseConfigured() ? supabaseDatabase() : localDatabase();
}
