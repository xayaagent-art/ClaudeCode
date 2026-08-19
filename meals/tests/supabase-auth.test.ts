import { describe, expect, it } from "vitest";
import { adminFetch } from "@/lib/db/supabase";

/**
 * The credential contract for the server client.
 *
 * A new-format Supabase secret is an opaque 41-character string, not a signed
 * token, and supabase-js sends it as `Authorization: Bearer …` on every
 * PostgREST request anyway. Production rejected reads made that way with
 * "JWT issued at future" — the gateway being asked to parse a secret as a JWT.
 * These pin the header shape, because the failure it caused was invisible from
 * inside the app: the adapter reported a database that would not answer.
 */
describe("supabase admin credential", () => {
  function headersSentBy(key: string): Headers {
    let seen: Headers | null = null;
    const wrapped = adminFetch(key);
    // The wrapper's only job is the headers, so a fetch that records and
    // resolves is enough — no network, no server to stand up.
    const original = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init: RequestInit | undefined) => {
      seen = new Headers(init?.headers);
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    try {
      void wrapped("https://example.supabase.co/rest/v1/inventory_items", {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    } finally {
      globalThis.fetch = original;
    }
    if (!seen) throw new Error("fetch was never called");
    return seen;
  }

  it("never sends a new-format secret as a Bearer token", () => {
    const key = `sb_secret_${"A".repeat(31)}`;
    const headers = headersSentBy(key);

    expect(headers.get("Authorization")).toBeNull();
    // The key still has to travel, or every request is anonymous.
    expect(headers.get("apikey")).toBe(key);
  });

  it("leaves a legacy JWT key in Authorization, where it belongs", () => {
    // For these the Bearer *is* the credential, so stripping it would break
    // every deployment still on a legacy service-role key.
    const key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
    const headers = headersSentBy(key);

    expect(headers.get("Authorization")).toBe(`Bearer ${key}`);
    expect(headers.get("apikey")).toBe(key);
  });

  it("treats a publishable key the same way as a secret one", () => {
    const key = `sb_publishable_${"B".repeat(24)}`;
    expect(headersSentBy(key).get("Authorization")).toBeNull();
  });
});
