import { NextResponse } from "next/server";

/**
 * Uniform API responses. Clients see a plain `error` string plus, where the
 * server knows one, a machine-readable `kind` and whether a retry is worth
 * offering. Stack traces and provider messages stay in the server log.
 */

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export interface FailDetail {
  kind?: string;
  title?: string;
  retryable?: boolean;
}

export function fail(message: string, status = 400, detail: FailDetail = {}): NextResponse {
  return NextResponse.json({ error: message, ...detail }, { status });
}

/** Errors that carry their own presentation. Set by the receipt/AI layers. */
interface TypedError extends Error {
  userMessage?: string;
  kind?: string;
  title?: string;
  retryable?: boolean;
  status?: number;
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return ok(await fn());
  } catch (error) {
    const err = error as TypedError;
    // eslint-disable-next-line no-console
    console.error("[api]", err.name, err.kind ?? "", err.message);

    // A missing database is a deployment problem, not a request problem.
    const status =
      err.name === "PersistenceNotConfiguredError" ? 503 : typeof err.status === "number" ? err.status : 500;

    return fail(err.userMessage ?? "Something went wrong. Please try again.", status, {
      kind: err.kind,
      title: err.title,
      retryable: err.retryable,
    });
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
