import "server-only";
import type { Database } from "@/lib/db/types";
import { localDatabase } from "@/lib/db/local";
import { supabaseConfigured, supabaseDatabase } from "@/lib/db/supabase";

export type { Database } from "@/lib/db/types";

/**
 * True when this process is a deployed build rather than local development.
 * `VERCEL` is set on every Vercel build and runtime.
 */
function isDeployed(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

/** Escape hatch for running a production build locally against the JSON store. */
function localStoreAllowed(): boolean {
  return process.env.ALLOW_LOCAL_DB === "true";
}

export class PersistenceNotConfiguredError extends Error {
  readonly userMessage =
    "This deployment isn't connected to its database yet. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.";
  constructor() {
    super(
      "Supabase is not configured, and the local JSON store is not usable in a deployed build. " +
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set ALLOW_LOCAL_DB=true to override.",
    );
    this.name = "PersistenceNotConfiguredError";
  }
}

/**
 * Supabase when configured, the local file store otherwise.
 *
 * A deployed build refuses to fall back. The local store writes to /tmp, which
 * on serverless is per-instance and vanishes between requests — silently using
 * it would look like the app randomly forgetting your kitchen. Failing loudly
 * is the honest behaviour, and the message names the two variables to set.
 */
export function getDb(): Database {
  if (supabaseConfigured()) return supabaseDatabase();
  if (isDeployed() && !localStoreAllowed()) throw new PersistenceNotConfiguredError();
  return localDatabase();
}

/** Which backend is live, for config displays. Never throws. */
export function persistenceKind(): "supabase" | "local" | "unconfigured" {
  if (supabaseConfigured()) return "supabase";
  if (isDeployed() && !localStoreAllowed()) return "unconfigured";
  return "local";
}
