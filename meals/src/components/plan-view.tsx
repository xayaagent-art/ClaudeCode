"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { postJson } from "@/lib/client-fetch";
import { formatShortDay } from "@/lib/date";
import type { PlanDay, PlanPayload } from "@/lib/views/plan";
import { AvatarLink, Button, ErrorNote, FoodImage, LinkButton } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { imageFor, useEnrichment } from "@/components/use-enrichment";

/**
 * The week.
 *
 * Seven cards, each one a dinner you can see. Changing a day opens a sheet and
 * changes that day — the other six are never touched, which is the behaviour
 * /api/plans/day exists to provide and the reason "Regenerate week" is a quiet
 * secondary action rather than the only way to fix a Wednesday.
 */
const PLAN_STAGES = ["Building your week", "Balancing variety", "Using what you already have"];

export function PlanView({ payload }: { payload: PlanPayload }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<PlanDay | null>(null);
  const [swapping, setSwapping] = useState(false);

  const recipeIds = useMemo(
    () => payload.days.map((day) => day.recipe?.id).filter((id): id is string => Boolean(id)),
    [payload.days],
  );
  const presentations = useEnrichment(recipeIds);

  /**
   * The existing week stays on screen throughout. `router.refresh()` re-renders
   * the server component in place, so the days swap over once the new plan
   * exists rather than the list blanking while it is built.
   */
  async function regenerate() {
    setBusy(true);
    setError(null);
    setStage(0);
    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, PLAN_STAGES.length - 1)), 2500);
    try {
      await postJson("/api/plans/generate", { start_date: payload.start_date, days: 7 });
      track("plan_generated", { start_date: payload.start_date });
      router.refresh();
    } catch {
      setError("Couldn't rebuild the week just now.");
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }

  /** One day, not seven. */
  async function swapDay(date: string) {
    setSwapping(true);
    setError(null);
    try {
      await postJson("/api/plans/day", { start_date: payload.start_date, date });
      track("planned", { date });
      setChanging(null);
      router.refresh();
    } catch {
      setError("Couldn't find another dinner for that day.");
    } finally {
      setSwapping(false);
    }
  }

  const today = payload.days[0]?.date;

  return (
    <>
      <header className="px-gutter pad-safe-top pb-6 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-meta text-ink-muted">{rangeLabel(payload)}</p>
            <h1 className="mt-1 text-hero font-semibold tracking-tight">This week</h1>
          </div>
          <AvatarLink initials="YS" />
        </div>
      </header>

      {!payload.has_plan ? (
        <section className="px-gutter py-4">
          <div className="rounded-card bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-title font-semibold">This week is open.</h2>
            <p className="mx-auto mt-2 max-w-xs text-body text-ink-muted">
              {payload.kitchen_empty
                ? "Scan a receipt first and we'll build the week around what you bought."
                : "Seven dinners that share ingredients and use what needs eating first."}
            </p>
            <div className="mt-6">
              {payload.kitchen_empty ? (
                <LinkButton href="/kitchen/scan" full>
                  Scan groceries
                </LinkButton>
              ) : (
                <Button full onClick={regenerate} disabled={busy}>
                  {busy ? PLAN_STAGES[stage] : "Plan my week"}
                </Button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          <ul className={`space-y-3 px-gutter ${busy ? "is-refreshing" : ""}`}>
            {payload.days.map((day) => (
              <li key={day.date}>
                <p className="label-cap pb-2 pt-3">
                  {day.date === today ? "Today" : formatShortDay(day.date)}
                </p>
                <DayCard
                  day={day}
                  image={
                    day.recipe
                      ? imageFor(day.recipe, presentations)
                      : { url: null, state: "unavailable" as const }
                  }
                  onChange={() => setChanging(day)}
                />
              </li>
            ))}
          </ul>

          <div className="px-gutter pt-8">
            <Button variant="secondary" full onClick={regenerate} disabled={busy}>
              {busy ? PLAN_STAGES[stage] : "Regenerate week"}
            </Button>
          </div>
        </>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="pad-nav" />

      <Sheet
        open={changing !== null}
        title={changing ? `Change ${labelFor(changing.date, today)}` : "Change day"}
        onClose={() => setChanging(null)}
        footer={
          <Button
            full
            onClick={() => changing && void swapDay(changing.date)}
            disabled={swapping}
          >
            {swapping ? "Finding a dinner…" : "Find another dinner"}
          </Button>
        }
      >
        <div className="px-gutter py-4">
          {changing?.recipe ? (
            <>
              <p className="text-meta text-ink-muted">Currently</p>
              <div className="mt-2 flex items-center gap-4 rounded-card bg-surface-sunken p-3">
                <div className="size-16 shrink-0 overflow-hidden rounded-tile bg-surface">
                  <FoodImage
                    title={changing.recipe.title}
                    cuisine={changing.recipe.cuisine}
                    imageUrl={imageFor(changing.recipe, presentations).url}
                    state={imageFor(changing.recipe, presentations).state}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-section font-medium">{changing.recipe.title}</p>
                  <p className="tabular mt-1 text-meta text-ink-muted">
                    {changing.recipe.total_time_minutes} min ·{" "}
                    {changing.recipe.protein_per_serving} g protein
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-body text-ink-muted">Nothing planned for this day yet.</p>
          )}

          <p className="mt-6 text-meta text-ink-muted">
            We&apos;ll find a different dinner for this day only. The rest of your week stays as
            it is.
          </p>
        </div>
      </Sheet>
    </>
  );
}

function DayCard({
  day,
  image,
  onChange,
}: {
  day: PlanDay;
  image: { url: string | null; state: "resolved" | "pending" | "unavailable" };
  onChange: () => void;
}) {
  if (day.kind !== "recipe" || !day.recipe) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-card bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="text-body text-ink-muted">
          {day.kind === "eating_out"
            ? "Eating out"
            : day.kind === "leftovers"
              ? "Leftovers"
              : "Nothing planned"}
        </p>
        <button
          type="button"
          onClick={onChange}
          className="min-h-11 shrink-0 px-2 text-meta font-medium text-accent"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <Link href={`/recipes/${day.recipe.id}`} className="flex items-center gap-4 p-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-tile bg-surface-sunken">
          <FoodImage
            title={day.recipe.title}
            cuisine={day.recipe.cuisine}
            imageUrl={image.url}
            state={image.state}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-section font-semibold">{day.recipe.title}</p>
          <p className="tabular mt-1 text-meta text-ink-muted">
            {day.recipe.total_time_minutes} min · {day.recipe.protein_per_serving} g protein
          </p>
          {day.note ? (
            <p className="mt-1 line-clamp-1 text-meta text-ink-faint">{day.note}</p>
          ) : null}
        </div>
      </Link>
      <div className="flex justify-end border-t border-line px-3">
        <button
          type="button"
          onClick={onChange}
          className="min-h-11 px-2 text-meta font-medium text-accent"
        >
          Change
        </button>
      </div>
    </div>
  );
}

function labelFor(date: string, today: string | undefined): string {
  return date === today ? "today" : formatShortDay(date);
}

/** "Aug 17 – 23", from the first and last day actually shown. */
function rangeLabel(payload: PlanPayload): string {
  const first = payload.days[0]?.date;
  const last = payload.days[payload.days.length - 1]?.date;
  if (!first || !last) return "";
  const format = (iso: string, withMonth: boolean) => {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      month: withMonth ? "short" : undefined,
      day: "numeric",
    });
  };
  return `${format(first, true)} – ${format(last, false)}`;
}
