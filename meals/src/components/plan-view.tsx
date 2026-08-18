"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { postJson } from "@/lib/client-fetch";
import { addDays, formatShortDay } from "@/lib/date";
import type { PlanEntry } from "@/lib/types";
import { AvatarLink, Button, EmptyState, ErrorNote, LinkButton, Pill } from "@/components/ui";

export function PlanView({
  startDate,
  entries,
  kitchenEmpty,
}: {
  startDate: string;
  entries: PlanEntry[];
  kitchenEmpty: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/plans/generate", { start_date: startDate, days: 7 });
      track("plan_generated", { start_date: startDate });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function replaceEntries(next: PlanEntry[]) {
    setError(null);
    const response = await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: startDate, entries: next }),
    });
    if (!response.ok) {
      setError("That change didn't save.");
      return;
    }
    setOpenDay(null);
    router.refresh();
  }

  function setKind(date: string, kind: PlanEntry["kind"]) {
    const next = entries.map((entry) =>
      entry.date === date && entry.meal_type === "dinner"
        ? {
            ...entry,
            kind,
            recipe_id: kind === "recipe" ? entry.recipe_id : null,
            recipe_title: kind === "recipe" ? entry.recipe_title : null,
            note: kind === "eating_out" ? "Eating out" : kind === "leftovers" ? "Leftovers" : entry.note,
          }
        : entry,
    );
    void replaceEntries(next);
  }

  const dinnerByDate = new Map(
    entries.filter((e) => e.meal_type === "dinner").map((e) => [e.date, e]),
  );
  const lunchByDate = new Map(
    entries.filter((e) => e.meal_type === "lunch").map((e) => [e.date, e]),
  );

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">Dinners</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">This week</h1>
        </div>
        <AvatarLink initials="YS" />
      </header>

      {entries.length === 0 ? (
        kitchenEmpty ? (
          <EmptyState
            title="Nothing to plan around yet"
            body="A week plan works from what's already in the kitchen. Scan a receipt first and we'll build the week around it."
            primary={<LinkButton href="/kitchen/scan">Scan receipt</LinkButton>}
          />
        ) : (
          <EmptyState
            title="What are we eating this week?"
            body="We'll lay out seven dinners that share ingredients, use what needs eating first, and leave room for leftovers."
            primary={
              <Button onClick={generate} disabled={busy}>
                {busy ? "Planning…" : "Plan my week"}
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="px-5">
            {days.map((date) => {
              const dinner = dinnerByDate.get(date);
              const lunch = lunchByDate.get(date);
              return (
                <li key={date} className="border-b border-line py-4 last:border-b-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-meta text-ink-muted">
                        {formatShortDay(date)} · {date.slice(5).replace("-", "/")}
                      </p>
                      {dinner?.kind === "recipe" && dinner.recipe_id ? (
                        <Link
                          href={`/recipes/${dinner.recipe_id}`}
                          className="mt-1 block truncate text-body font-medium hover:underline"
                        >
                          {dinner.recipe_title}
                        </Link>
                      ) : (
                        <p className="mt-1 text-body font-medium text-ink-muted">
                          {dinner?.kind === "eating_out"
                            ? "Eating out"
                            : dinner?.kind === "leftovers"
                              ? "Leftovers"
                              : "Nothing planned"}
                        </p>
                      )}
                      {lunch ? (
                        <p className="mt-1 text-meta text-ink-muted">Lunch: {lunch.note}</p>
                      ) : null}
                      {dinner?.kind === "recipe" && dinner.note ? (
                        <p className="mt-1 text-meta text-ink-faint">{dinner.note}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenDay(openDay === date ? null : date)}
                      aria-expanded={openDay === date}
                      className="min-h-11 shrink-0 px-2 text-meta text-ink-muted hover:text-ink"
                    >
                      Change
                    </button>
                  </div>

                  {openDay === date ? (
                    <div className="stage-enter mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setKind(date, "eating_out")}>
                        Eating out
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setKind(date, "leftovers")}>
                        Leftovers
                      </Button>
                      <Link
                        href="/meals"
                        className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-4 text-meta font-medium hover:bg-surface-sunken"
                      >
                        Pick something else
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3 px-5 py-8">
            <Button onClick={generate} disabled={busy} variant="secondary">
              {busy ? "Planning…" : "Regenerate week"}
            </Button>
            <Pill tone="neutral">Dinners only for now</Pill>
          </div>
        </>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </>
  );
}
