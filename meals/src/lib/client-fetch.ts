/**
 * Bounded POST for the app's long-running routes.
 *
 * A serverless function that exceeds its limit is killed without writing a
 * response. The browser is left holding a socket that will never answer, so the
 * spinner runs until Safari eventually gives up — which is what "stuck on
 * Planning…" actually was. An explicit client deadline means the UI always
 * exits its loading state and can offer a retry, whatever the server did.
 */

export class RequestFailed extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "RequestFailed";
  }
}

/** Slightly longer than the server's own budget, so the server wins the race. */
const DEFAULT_TIMEOUT_MS = 55_000;

export async function postJson<T>(
  url: string,
  body: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = (error as Error).name === "TimeoutError";
    throw new RequestFailed(
      timedOut
        ? "That took too long. Tap to try again."
        : "We couldn't reach the kitchen. Check your connection and try again.",
      timedOut,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new RequestFailed(payload?.error ?? "Something went wrong. Please try again.", false);
  }
  if (!payload) {
    throw new RequestFailed("We got an unreadable reply. Please try again.", false);
  }
  return payload;
}
