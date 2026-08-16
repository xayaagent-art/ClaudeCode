import { NextResponse } from "next/server";

/**
 * Uniform API responses. Clients only ever see a plain `error` string — stack
 * traces and provider messages stay in the server log.
 */

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, init);
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return ok(await fn());
  } catch (error) {
    const err = error as Error & { userMessage?: string };
    // eslint-disable-next-line no-console
    console.error("[api]", err.name, err.message);
    return fail(err.userMessage ?? "Something went wrong. Please try again.", 500);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}
