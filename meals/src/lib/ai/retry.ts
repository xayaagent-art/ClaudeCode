import { AIFailure, classifyProviderError, isTransient } from "@/lib/ai/failure";

/**
 * Retry policy for provider calls.
 *
 * Every retry of a vision call costs real money, so the policy is narrow: only
 * failures that could plausibly succeed unchanged are retried, and only a
 * couple of times. A malformed image or a schema violation will fail identically
 * on attempt two, so retrying those would just double the bill.
 */

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** First backoff delay; each subsequent wait doubles it. */
  baseDelayMs?: number;
  /** Injectable for tests, so the suite doesn't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry, for telemetry and logs. */
  onRetry?: (info: { attempt: number; kind: string; delayMs: number }) => void;
}

export interface RetryResult<T> {
  value: T;
  /** How many times the call was actually made. */
  attempts: number;
}

function defaultAttempts(): number {
  const configured = Number(process.env.OPENAI_MAX_ATTEMPTS);
  if (Number.isFinite(configured) && configured >= 1) return Math.min(configured, 5);
  return 3;
}

function defaultBaseDelay(): number {
  const configured = Number(process.env.OPENAI_RETRY_BASE_MS);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return 1000;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying transient failures with exponential backoff.
 *
 * A provider-supplied Retry-After always wins over our own backoff — it is the
 * only party that knows when the quota actually resets.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const attempts = options.attempts ?? defaultAttempts();
  const baseDelayMs = options.baseDelayMs ?? defaultBaseDelay();
  const sleep = options.sleep ?? wait;

  let lastFailure: AIFailure | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (error) {
      const failure = classifyProviderError(error);
      failure.attempts = attempt;
      lastFailure = failure;

      const isLast = attempt === attempts;
      if (isLast || !isTransient(failure.kind)) throw failure;

      // Jitter keeps a household's two phones from retrying in lockstep.
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jittered = backoff + Math.floor(Math.random() * (baseDelayMs / 2 + 1));
      const delayMs = failure.retryAfterMs ?? jittered;

      options.onRetry?.({ attempt, kind: failure.kind, delayMs });
      await sleep(delayMs);
    }
  }

  /* c8 ignore next 2 -- unreachable: the loop either returns or throws. */
  throw lastFailure ?? new AIFailure("api_error", "retry loop exited without a result");
}
