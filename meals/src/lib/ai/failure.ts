/**
 * Failure taxonomy for AI calls.
 *
 * A receipt scan can fail in ways that call for genuinely different responses:
 * "wait a moment and try again" is not the same advice as "that photo isn't
 * readable, take another one". Collapsing them into one generic message trains
 * people to retry things that will never succeed, so every failure carries a
 * kind, whether a retry is worth offering, and a message written for the person
 * holding the phone.
 */

export type AIFailureKind =
  | "not_configured"
  /** The upload isn't a decodable image at all. Detected before any model call. */
  | "invalid_image"
  /** A real image, but the model found nothing purchasable on it. */
  | "unreadable"
  /** The model's reply was cut off before the JSON was complete. */
  | "truncated"
  /** Reply was not valid JSON, or did not satisfy the receipt contract. */
  | "schema_invalid"
  /** Some lines were dropped but the receipt is still usable. Never thrown. */
  | "partial"
  | "rate_limit"
  | "timeout"
  /** Anything else from the provider: 5xx, auth, connection reset. */
  | "api_error";

interface KindCopy {
  /** Short heading for the failure card. */
  title: string;
  /** What the user should do next. */
  userMessage: string;
  /** Whether retrying the same photo could plausibly work. */
  retryable: boolean;
  /** HTTP status the API route should answer with. */
  status: number;
}

const COPY: Record<AIFailureKind, KindCopy> = {
  not_configured: {
    title: "Receipt scanning isn't set up",
    userMessage: "Receipt scanning isn't configured on the server yet.",
    retryable: false,
    status: 503,
  },
  invalid_image: {
    title: "That file isn't a photo",
    userMessage: "We couldn't open that as an image. Try a JPEG, PNG or HEIC photo of the receipt.",
    retryable: false,
    status: 415,
  },
  unreadable: {
    title: "Nothing readable on this receipt",
    userMessage:
      "We couldn't find any items on this photo. Lay the receipt flat, fill the frame, and try again in better light.",
    retryable: false,
    status: 422,
  },
  truncated: {
    title: "This receipt is very long",
    userMessage:
      "This receipt was too long to read in one pass. Try photographing it in two halves.",
    retryable: false,
    status: 422,
  },
  schema_invalid: {
    title: "We couldn't read this receipt",
    userMessage: "We couldn't read this receipt. Try again, or choose another photo.",
    retryable: true,
    status: 502,
  },
  partial: {
    title: "Some lines couldn't be read",
    userMessage: "Some lines on this receipt couldn't be read. Check the ones flagged for review.",
    retryable: false,
    status: 200,
  },
  rate_limit: {
    title: "Too many receipts at once",
    userMessage: "Receipt scanning is busy right now. Wait about a minute and try again.",
    retryable: true,
    status: 429,
  },
  timeout: {
    title: "That took too long",
    userMessage: "Reading this receipt took too long. Try again, or use a smaller photo.",
    retryable: true,
    status: 504,
  },
  api_error: {
    title: "We couldn't read this receipt",
    userMessage: "We couldn't read this receipt right now. Please try again in a moment.",
    retryable: true,
    status: 502,
  },
};

export function copyForKind(kind: AIFailureKind): KindCopy {
  return COPY[kind];
}

/** Kinds where trying the identical request again is worth the spend. */
export function isTransient(kind: AIFailureKind): boolean {
  return kind === "rate_limit" || kind === "timeout" || kind === "api_error";
}

export class AIFailure extends Error {
  readonly kind: AIFailureKind;
  readonly userMessage: string;
  readonly title: string;
  readonly retryable: boolean;
  readonly status: number;
  /** Provider-supplied hint from a Retry-After header, in ms. */
  readonly retryAfterMs: number | null;
  /** Provider calls made before giving up. Set by the retry loop. */
  attempts = 1;

  constructor(
    kind: AIFailureKind,
    /** Operator-facing detail. Must never contain image bytes or prompt text. */
    detail: string,
    options: { retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    const copy = COPY[kind];
    super(`${kind}: ${detail}`);
    this.name = "AIFailure";
    this.kind = kind;
    this.title = copy.title;
    this.userMessage = copy.userMessage;
    this.retryable = copy.retryable;
    this.status = copy.status;
    this.retryAfterMs = options.retryAfterMs ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function retryAfterMs(headers: unknown): number | null {
  if (!headers || typeof headers !== "object") return null;
  const get = (headers as { get?: (name: string) => string | null }).get;
  if (typeof get !== "function") return null;
  const raw = get.call(headers, "retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Map an arbitrary provider error onto the taxonomy.
 *
 * We read the SDK's shape (`status`, error class name) rather than matching on
 * message text, because message wording is not a stable contract. Anything we
 * genuinely cannot place becomes `api_error`, which is retryable — an unknown
 * failure is more often transient than permanent.
 */
export function classifyProviderError(error: unknown): AIFailure {
  if (error instanceof AIFailure) return error;

  const err = error as {
    name?: string;
    status?: number;
    code?: string;
    message?: string;
    headers?: unknown;
  };
  const name = err?.name ?? "";
  const status = typeof err?.status === "number" ? err.status : null;

  // Aborts are how both our own timeout and the SDK's surface.
  if (
    name === "APIConnectionTimeoutError" ||
    name === "TimeoutError" ||
    name === "AbortError" ||
    name === "APIUserAbortError" ||
    err?.code === "ETIMEDOUT"
  ) {
    return new AIFailure("timeout", name || "request aborted", { cause: error });
  }

  if (status === 429 || name === "RateLimitError") {
    return new AIFailure("rate_limit", "provider returned 429", {
      retryAfterMs: retryAfterMs(err?.headers),
      cause: error,
    });
  }

  if (status === 400 || status === 422) {
    // The commonest 400 on a vision call is an image the provider can't decode.
    const message = (err?.message ?? "").toLowerCase();
    if (message.includes("image")) {
      return new AIFailure("invalid_image", `provider rejected the image (${status})`, {
        cause: error,
      });
    }
  }

  return new AIFailure(
    "api_error",
    status ? `provider returned ${status}` : name || "provider call failed",
    { cause: error },
  );
}

/** Shape returned to the client. Deliberately free of provider internals. */
export interface FailurePayload {
  error: string;
  kind: AIFailureKind;
  title: string;
  retryable: boolean;
}

export function failurePayload(failure: AIFailure): FailurePayload {
  return {
    error: failure.userMessage,
    kind: failure.kind,
    title: failure.title,
    retryable: failure.retryable,
  };
}
