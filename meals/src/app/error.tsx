"use client";

import { useEffect } from "react";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // The message itself stays server-side; users get plain language.
  }, []);

  return (
    <div className="px-5 py-20 text-center">
      <h1 className="text-title font-semibold">Something went wrong</h1>
      <p className="mt-2 text-body text-ink-muted">
        That screen didn&apos;t load. Nothing was lost — try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-6 text-body font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
