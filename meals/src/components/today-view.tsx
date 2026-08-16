"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatLongDate } from "@/lib/date";
import { track } from "@/lib/analytics";
import type { TodayPayload } from "@/lib/views/today";
import { NutritionStat } from "@/components/progress";
import {
  AvatarLink,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  LinkButton,
  Pill,
  RecipePlate,
  SectionHeading,
} from "@/components/ui";

export function TodayView({ initial }: { initial: TodayPayload }) {
  const router = useRouter();
  const [scope, setScope] = useState<string>(initial.members[0]?.id ?? "household");
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const progress = initial.progress.find((p) => p.scope === scope) ?? initial.progress[0];
  const recommendation = initial.latest_recommendation;
  const kitchenEmpty = initial.inventory_count === 0;

  // The recommendation request itself runs on /meals, which owns the loading
  // state — navigating first means the button never sits spinning on Today.
  function findMeal() {
    setFinding(true);
    setError(null);
    track("meal_recommendation_requested", { meal_type: "dinner", source: "today" });
    router.push("/meals");
  }

  async function undo(batchId: string) {
    await fetch("/api/meals/log/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    track("meal_log_undone", { batch_id: batchId });
    startTransition(() => router.refresh());
  }

  const loggedBatches = [...new Map(initial.meals_today.map((m) => [m.batch_id, m])).values()];

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div className="min-w-0">
          <p className="text-meta text-ink-muted">{formatLongDate(initial.date)}</p>
          <div className="mt-1 flex items-center gap-2">
            <label className="sr-only" htmlFor="scope">
              Show nutrition for
            </label>
            <select
              id="scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="-ml-1 max-w-[14rem] appearance-none truncate rounded-lg bg-transparent py-0.5 pl-1 pr-6 text-display font-semibold tracking-tight text-ink"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' stroke='%236b6b66' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.25rem center",
              }}
            >
              {initial.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
              <option value="household">Household</option>
            </select>
          </div>
        </div>
        <AvatarLink initials={initial.members.map((m) => m.name.charAt(0)).join("")} />
      </header>

      <section aria-label="Nutrition today" className="flex gap-8 px-5 pb-8">
        <NutritionStat
          label="Calories"
          consumed={progress.consumed.calories}
          target={progress.target.calories}
          unit="kcal"
        />
        <NutritionStat
          label="Protein"
          consumed={progress.consumed.protein}
          target={progress.target.protein}
          unit="g"
        />
      </section>

      <Divider />

      {kitchenEmpty ? (
        <EmptyState
          title="What should we make today?"
          body="Your kitchen is empty, so there's nothing to build a meal from yet. Scan a grocery receipt and we'll fill it in automatically."
          primary={<LinkButton href="/kitchen/scan">Scan receipt</LinkButton>}
        />
      ) : recommendation ? (
        <section aria-label="Recommended meal" className="px-5 py-8">
          <p className="text-meta text-ink-muted">Dinner tonight</p>
          <Card className="mt-3 overflow-hidden">
            <Link href={`/recipes/${recommendation.recipe_id}`} className="block">
              <div className="h-36 w-full">
                <RecipePlate
                  title={recommendation.title}
                  cuisine={recommendation.cuisine}
                  imageUrl={recommendation.image_url}
                />
              </div>
              <div className="p-5">
                <h2 className="text-title font-semibold">{recommendation.title}</h2>
                <p className="tabular mt-2 text-meta text-ink-muted">
                  {recommendation.total_time_minutes} min · {recommendation.protein_per_serving} g
                  protein · {Math.round(recommendation.availability * 100)}% of ingredients on hand
                </p>
                {recommendation.recommendation_reason ? (
                  <p className="mt-3 text-body text-ink-muted">
                    {recommendation.recommendation_reason}
                  </p>
                ) : null}
              </div>
            </Link>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
              <LinkButton href={`/recipes/${recommendation.recipe_id}`}>View recipe</LinkButton>
              <Button variant="quiet" onClick={findMeal} disabled={finding}>
                {finding ? "Looking…" : "Find something else"}
              </Button>
            </div>
          </Card>
        </section>
      ) : (
        <section className="px-5 py-10 text-center">
          <h2 className="text-title font-semibold">What should we make today?</h2>
          <p className="mx-auto mt-2 max-w-sm text-body text-ink-muted">
            We&apos;ll use what&apos;s in your kitchen and your food preferences to find something
            that fits.
          </p>
          <div className="mt-7">
            <Button onClick={findMeal} disabled={finding}>
              {finding ? "Finding meals…" : "Find a meal"}
            </Button>
          </div>
        </section>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {loggedBatches.length > 0 ? (
        <>
          <Divider />
          <section className="py-8">
            <SectionHeading>Eaten today</SectionHeading>
            <ul className="px-5">
              {loggedBatches.map((meal) => (
                <li
                  key={meal.batch_id}
                  className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body">{meal.title}</p>
                    <p className="text-meta capitalize text-ink-muted">{meal.meal_type}</p>
                  </div>
                  <Button variant="quiet" size="sm" onClick={() => undo(meal.batch_id)}>
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {initial.use_soon.length > 0 ? (
        <>
          <Divider />
          <section className="py-8">
            <SectionHeading
              action={
                <Link href="/kitchen" className="text-meta text-accent hover:underline">
                  Kitchen
                </Link>
              }
            >
              Use soon
            </SectionHeading>
            <ul className="px-5">
              {initial.use_soon.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0"
                >
                  <span className="truncate text-body">{item.name}</span>
                  <Pill tone={item.days !== null && item.days <= 1 ? "danger" : "warn"}>
                    {item.days === null
                      ? "soon"
                      : item.days <= 0
                        ? "today"
                        : `${item.days} day${item.days === 1 ? "" : "s"}`}
                  </Pill>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {!kitchenEmpty && recommendation ? (
        <div className="px-5 pb-10">
          <Button full onClick={findMeal} disabled={finding} variant="secondary">
            {finding ? "Finding meals…" : "Find a meal"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
