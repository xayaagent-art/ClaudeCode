"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { formatLongDate } from "@/lib/date";
import { track } from "@/lib/analytics";
import { postJson } from "@/lib/client-fetch";
import type { TodayPayload } from "@/lib/views/today";
import type { CurrentRecommendationSet } from "@/lib/views/recommendations";
import { AvatarLink, Button, ErrorNote, FoodImage, LinkButton, SectionLabel, StatRow } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { imageFor, useEnrichment } from "@/components/use-enrichment";

/**
 * Today.
 *
 * One question — what's for dinner — answered before anything else on the
 * screen. Everything the ranker knows stays behind that: no scores, no
 * availability percentages competing with the dish name, no eight metadata
 * pills. Time, protein and how much of it is already in the kitchen, then the
 * one sentence explaining why this dish and not another.
 */

interface Alternative {
  recipe: {
    id: string;
    title: string;
    cuisine: string;
    total_time_minutes: number;
    protein_per_serving: number;
    thumbnail_url: string | null;
    image_url: string | null;
  };
  reason: string;
  availability: number;
}

const STAGES = [
  "Looking at your kitchen",
  "Using what needs eating soon",
  "Finding meals that fit",
  "Finishing your options",
];

export function TodayView({
  initial,
  currentSet,
}: {
  initial: TodayPayload;
  currentSet: CurrentRecommendationSet;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[]>(
    currentSet.recommendations.map((entry) => ({
      recipe: entry.recipe,
      reason: entry.reason,
      availability: entry.availability,
    })),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hero = initial.latest_recommendation;
  const kitchenEmpty = initial.inventory_count === 0;
  const progress = initial.progress.find((p) => p.scope === "household") ?? initial.progress[0];

  // Every recipe visible on this screen, so one enrichment request covers the
  // hero and the sheet together rather than one per card.
  const visibleIds = useMemo(() => {
    const ids = alternatives.map((entry) => entry.recipe.id);
    if (hero) ids.unshift(hero.recipe_id);
    return [...new Set(ids)];
  }, [alternatives, hero]);
  const presentations = useEnrichment(visibleIds);

  const heroImage = hero
    ? imageFor({ id: hero.recipe_id, image_url: hero.image_url }, presentations)
    : null;

  /**
   * The only path in this component that reaches the model, and only ever from
   * a tap. The existing cards stay on screen underneath while it runs — a
   * refresh that blanks the screen loses the answer the household already had
   * if the new one fails.
   */
  const fetchAlternatives = useCallback(
    async (regenerate: boolean) => {
      setRefreshing(true);
      setError(null);
      setStage(0);
      const ticker = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2200);
      try {
        const body = await postJson<{ recommendations: Alternative[] }>("/api/meals/recommend", {
          meal_type: "dinner",
          count: 3,
          regenerate,
          exclude_recipe_ids: regenerate ? alternatives.map((entry) => entry.recipe.id) : [],
        });
        setAlternatives(body.recommendations);
        // The set that just became canonical is what Today should show on its
        // next render, so the server state and this screen do not disagree.
        startTransition(() => router.refresh());
      } catch {
        setError("Couldn't find new ideas right now.");
      } finally {
        clearInterval(ticker);
        setRefreshing(false);
      }
    },
    [alternatives, router],
  );

  function openAlternatives() {
    track("recommendation_shown", { surface: "today_sheet" });
    setSheetOpen(true);
    // Only generate when there is genuinely nothing to show. Opening the sheet
    // is browsing, not a request for new ideas.
    if (alternatives.length === 0) void fetchAlternatives(false);
  }

  async function answer(itemId: string, status: string) {
    await fetch(`/api/inventory/${itemId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    startTransition(() => router.refresh());
  }

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const firstName = initial.members[0]?.name.split(" ")[0] ?? "there";

  return (
    <>
      <header className="px-gutter pad-safe-top pb-6 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-meta text-ink-muted">{formatLongDate(initial.date)}</p>
            {/* No truncation: a long name wraps to a second line rather than
                becoming "Good morning, Ya…", which is worse than two lines. */}
            <h1 className="mt-1 text-hero font-semibold tracking-tight">
              {greeting}, {firstName}
            </h1>
          </div>
          <AvatarLink initials={initial.members.map((m) => m.name.charAt(0)).join("")} />
        </div>

        {progress && progress.target.protein > 0 ? (
          <p className="tabular mt-4 text-meta text-ink-muted">
            {Math.round(progress.consumed.protein)} of {Math.round(progress.target.protein)} g
            protein today
          </p>
        ) : null}
      </header>

      {kitchenEmpty ? (
        <section className="px-gutter py-8">
          <div className="rounded-card bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-title font-semibold">Let&apos;s fill the kitchen first</h2>
            <p className="mx-auto mt-2 max-w-xs text-body text-ink-muted">
              Start with your latest grocery receipt and we&apos;ll take it from there.
            </p>
            <div className="mt-6">
              <LinkButton href="/kitchen/scan" full>
                Scan groceries
              </LinkButton>
            </div>
          </div>
        </section>
      ) : hero ? (
        <section aria-label="Dinner tonight" className="px-gutter pt-2">
          <p className="label-cap pb-3">Dinner tonight</p>

          <article className="overflow-hidden rounded-card bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <Link href={`/recipes/${hero.recipe_id}`} className="block">
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-sunken">
                <FoodImage
                  title={hero.title}
                  cuisine={hero.cuisine}
                  imageUrl={heroImage?.url}
                  state={heroImage?.state}
                />
              </div>
              <div className="p-5">
                <h2 className="text-display font-semibold tracking-tight">{hero.title}</h2>
                <p className="mt-1 text-meta text-ink-muted">{hero.cuisine}</p>

                <div className="mt-5">
                  <StatRow
                    items={[
                      { value: `${hero.total_time_minutes} min`, label: "to cook" },
                      { value: `${hero.protein_per_serving} g`, label: "protein" },
                      {
                        value: `${Math.round(hero.availability * 100)}%`,
                        label: "you have",
                      },
                    ]}
                  />
                </div>

                {hero.recommendation_reason ? (
                  <p className="mt-5 text-body text-ink-muted">{hero.recommendation_reason}</p>
                ) : null}
              </div>
            </Link>

            <div className="flex flex-col gap-2 border-t border-line p-4">
              <LinkButton href={`/recipes/${hero.recipe_id}`} full>
                Cook this
              </LinkButton>
              <Button variant="quiet" full onClick={openAlternatives}>
                Show me something else
              </Button>
            </div>
          </article>
        </section>
      ) : (
        <section className="px-gutter py-8">
          <div className="rounded-card bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-title font-semibold">Let&apos;s figure out dinner.</h2>
            <p className="mx-auto mt-2 max-w-xs text-body text-ink-muted">
              We&apos;ll work from what&apos;s in your kitchen right now.
            </p>
            <div className="mt-6">
              <Button full onClick={openAlternatives}>
                Find a meal
              </Button>
            </div>
          </div>
        </section>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {initial.confirmations.length > 0 ? (
        <section aria-label="Quick check">
          <SectionLabel>Quick check</SectionLabel>
          <ul className="space-y-4 px-gutter">
            {initial.confirmations.map((prompt) => (
              <li key={prompt.item_id} className="rounded-card bg-surface p-4">
                <p className="text-body">{prompt.question}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {prompt.options.map((option) => (
                    <Button
                      key={option.label}
                      size="sm"
                      variant="secondary"
                      onClick={() => answer(prompt.item_id, option.status)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {initial.use_soon.length > 0 ? (
        <section>
          <SectionLabel>Use soon</SectionLabel>
          <div className="flex flex-wrap gap-2 px-gutter">
            {initial.use_soon.map((item) => (
              <Link
                key={item.id}
                href="/kitchen"
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-meta font-medium ${
                  item.past_best
                    ? "bg-danger-soft text-danger"
                    : "bg-warn-soft text-warn"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="pad-nav" />

      <Sheet
        open={sheetOpen}
        title="Something else"
        onClose={() => setSheetOpen(false)}
        footer={
          <Button variant="secondary" full onClick={() => void fetchAlternatives(true)} disabled={refreshing}>
            {refreshing ? STAGES[stage] : "Find more ideas"}
          </Button>
        }
      >
        {alternatives.length === 0 && refreshing ? (
          <ul className="space-y-3 px-gutter py-4">
            {[0, 1, 2].map((index) => (
              <li
                key={index}
                className="pulse-soft h-24 rounded-card bg-surface-sunken"
                style={{ animationDelay: `${index * 120}ms` }}
              />
            ))}
          </ul>
        ) : (
          <ul className={`space-y-3 px-gutter py-4 ${refreshing ? "is-refreshing" : ""}`}>
            {alternatives.map((entry) => {
              const image = imageFor(entry.recipe, presentations);
              return (
                <li key={entry.recipe.id}>
                  <Link
                    href={`/recipes/${entry.recipe.id}`}
                    className="flex items-center gap-4 rounded-card bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    onClick={() =>
                      track("recipe_opened", {
                        recipe_id: entry.recipe.id,
                        cuisine: entry.recipe.cuisine,
                      })
                    }
                  >
                    <div className="size-20 shrink-0 overflow-hidden rounded-tile bg-surface-sunken">
                      <FoodImage
                        title={entry.recipe.title}
                        cuisine={entry.recipe.cuisine}
                        imageUrl={image.url}
                        state={image.state}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-section font-semibold">{entry.recipe.title}</p>
                      <p className="tabular mt-1 text-meta text-ink-muted">
                        {entry.recipe.total_time_minutes} min · {entry.recipe.protein_per_serving} g
                        protein
                      </p>
                      <p className="mt-1 line-clamp-2 text-meta text-ink-muted">{entry.reason}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
