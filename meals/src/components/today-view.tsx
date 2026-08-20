"use client";

import Link from "next/link";
import { useMemo } from "react";
import { track } from "@/lib/analytics";
import type { TodayPayload } from "@/lib/views/today";
import type { CurrentRecommendationSet } from "@/lib/views/recommendations";
import { FoodImage } from "@/components/food-image";
import { imageFor, useEnrichment } from "@/components/use-enrichment";

/**
 * Today — the household's decision surface for tonight.
 *
 * One question, answered before anything else on the screen: what are we
 * eating. The dish photograph and its name are the largest things here, and
 * the second largest is the number that only this product can tell you —
 * how much of the meal is already in the kitchen. Everything the ranker knows
 * beyond that stays behind the recipe.
 *
 * Nothing on this screen reaches the model. It renders persisted state, and the
 * only network call is presentation enrichment, which never blocks a card.
 */
export function TodayView({
  initial,
  currentSet,
}: {
  initial: TodayPayload;
  currentSet: CurrentRecommendationSet;
}) {
  const hero = initial.latest_recommendation;
  const kitchenEmpty = initial.inventory_count === 0;

  // The recommendations behind tonight's pick, minus tonight's pick itself.
  const alternatives = useMemo(
    () => currentSet.recommendations.filter((entry) => entry.recipe.id !== hero?.recipe_id).slice(0, 2),
    [currentSet.recommendations, hero?.recipe_id],
  );

  const visibleIds = useMemo(() => {
    const ids = alternatives.map((entry) => entry.recipe.id);
    if (hero) ids.unshift(hero.recipe_id);
    return [...new Set(ids)];
  }, [alternatives, hero]);
  const presentations = useEnrichment(visibleIds);

  const heroImage = hero
    ? imageFor({ id: hero.recipe_id, image_url: hero.image_url }, presentations)
    : null;

  const atHome = hero ? Math.round(hero.availability * 100) : 0;

  // Read from the stored recommendation, never derived from the percentage.
  // A count computed out of the availability ratio is a fabricated number on
  // the most important line of the screen; when the row cannot be matched the
  // clause is dropped rather than guessed.
  const noPhotograph = heroImage?.state === "unavailable" && !heroImage?.url;

  const heroRow = currentSet.recommendations.find((entry) => entry.recipe.id === hero?.recipe_id);
  const missing = heroRow ? heroRow.missing.filter((item) => !item.optional).length : null;

  return (
    <>
      <header className="flex items-center justify-between gap-4 px-gutter pad-safe-top pb-5 pt-4">
        <p className="text-item font-semibold tracking-tight">Human Not Found</p>
        <Link
          href="/settings"
          aria-label="Household and settings"
          className="flex size-9 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-semibold text-ink-muted"
        >
          {initial.members.map((m) => m.name.charAt(0)).join("").slice(0, 2) || "YS"}
        </Link>
      </header>

      {kitchenEmpty ? (
        <EmptyKitchen />
      ) : hero ? (
        <>
          <section aria-label="Dinner tonight" className="px-gutter">
            <div className="flex items-baseline gap-2.5">
              <p className="label-cap">Tonight</p>
              <p className="text-meta text-ink-faint">{longDate(initial.date)}</p>
            </div>

            {/*
              The break-out card: the one object on this screen that is allowed
              to look heavier than everything around it. Its shadow and its
              width are the whole reason your eye lands here first.
            */}
            <article className="-mx-1 mt-3 overflow-hidden rounded-[20px] bg-surface shadow-[0_6px_24px_-6px_rgba(23,23,23,0.16),0_2px_6px_-2px_rgba(23,23,23,0.08)]">
              <Link
                href={`/recipes/${hero.recipe_id}`}
                className="block"
                onClick={() => track("recipe_opened", { recipe_id: hero.recipe_id, surface: "today_hero" })}
              >
                {/*
                  No band at all once we know there will never be a photograph.
                  A plate motif at photographic size was the largest thing on
                  the screen and said one word; removing it lets the dish name
                  lead the card, which is what should have been leading it. A
                  photograph — or the wait for one — still gets full 3:2.
                */}
                {noPhotograph ? null : (
                  <div className="aspect-[3/2] w-full overflow-hidden bg-surface-sunken">
                    <FoodImage
                      title={hero.title}
                      cuisine={hero.cuisine}
                      imageUrl={heroImage?.url}
                      state={heroImage?.state}
                    />
                  </div>
                )}

                <div className={`px-4 pb-4 ${noPhotograph ? "pt-5" : "pt-4"}`}>
                  <h1 className="text-dish font-semibold tracking-tight">{hero.title}</h1>
                  <p className="tabular mt-1.5 text-meta text-ink-muted">
                    {hero.cuisine} · {hero.total_time_minutes} min ·{" "}
                    {hero.protein_per_serving}g protein
                  </p>

                  {/*
                    The one number only this product can tell you, given the
                    weight the reference gives its calorie count. It owns its
                    row outright — nothing shares the baseline, which is what
                    makes it read as the answer rather than as a third statistic.
                  */}
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="tabular text-[38px] font-bold leading-none tracking-[-0.035em]">
                      {atHome}%
                    </p>
                    <p className="mt-2 text-meta text-ink-muted">
                      already in your kitchen
                      {missing !== null && missing > 0
                        ? ` · ${missing} to buy`
                        : missing === 0
                          ? " · nothing to buy"
                          : ""}
                    </p>
                  </div>

                  {hero.recommendation_reason ? (
                    <p className="mt-4 text-[15px] leading-[21px] text-ink-muted">
                      {hero.recommendation_reason}
                    </p>
                  ) : null}
                </div>
              </Link>
            </article>

            <Link
              href={`/recipes/${hero.recipe_id}`}
              className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-white active:opacity-90"
              onClick={() => track("recipe_opened", { recipe_id: hero.recipe_id, surface: "today_cta" })}
            >
              Cook this
            </Link>
          </section>

          {initial.use_soon.length > 0 ? (
            <section className="px-gutter pt-9">
              <p className="text-item font-semibold tracking-tight">Use soon</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {initial.use_soon.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href="/kitchen"
                    className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-meta font-medium ${
                      item.past_best ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                    }`}
                  >
                    {titleCase(item.name)}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {alternatives.length > 0 ? (
            <section className="px-gutter pt-9">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-item font-semibold tracking-tight">Not feeling it?</p>
                <Link href="/meals" className="text-meta font-medium text-ink-muted">
                  See more
                </Link>
              </div>
              <ul className="mt-3 space-y-2.5">
                {alternatives.map((entry) => {
                  const image = imageFor(entry.recipe, presentations);
                  return (
                    <li key={entry.recipe.id}>
                      <Link
                        href={`/recipes/${entry.recipe.id}`}
                        className="flex items-center gap-3.5 rounded-[16px] bg-surface p-2.5 shadow-[0_1px_3px_rgba(23,23,23,0.06)]"
                        onClick={() =>
                          track("recipe_opened", {
                            recipe_id: entry.recipe.id,
                            surface: "today_alternative",
                          })
                        }
                      >
                        <div className="size-[62px] shrink-0 overflow-hidden rounded-[11px] bg-surface-sunken">
                          <FoodImage
                            title={entry.recipe.title}
                            cuisine={entry.recipe.cuisine}
                            imageUrl={image.url}
                            state={image.state}
                            compact
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold leading-tight">
                            {entry.recipe.title}
                          </p>
                          <p className="tabular mt-1 text-meta text-ink-muted">
                            {entry.recipe.total_time_minutes} min ·{" "}
                            {Math.round(entry.availability * 100)}% at home
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <NoRecommendation />
      )}

      <div className="pad-nav" />
    </>
  );
}

function EmptyKitchen() {
  return (
    <section className="px-gutter pt-2">
      <p className="label-cap">Tonight</p>
      <h1 className="mt-2 text-title font-semibold tracking-tight">
        Let&apos;s fill the kitchen first
      </h1>
      <p className="mt-2 max-w-[19rem] text-[15px] leading-[21px] text-ink-muted">
        Scan a grocery receipt and we&apos;ll work out dinner from what you actually bought.
      </p>
      <Link
        href="/kitchen/scan"
        className="mt-6 flex min-h-[54px] w-full items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-white"
      >
        Scan groceries
      </Link>
    </section>
  );
}

function NoRecommendation() {
  return (
    <section className="px-gutter pt-2">
      <p className="label-cap">Tonight</p>
      <h1 className="mt-2 text-title font-semibold tracking-tight">Let&apos;s figure out dinner.</h1>
      <p className="mt-2 max-w-[19rem] text-[15px] leading-[21px] text-ink-muted">
        We&apos;ll work from what&apos;s in your kitchen right now.
      </p>
      <Link
        href="/meals"
        className="mt-6 flex min-h-[54px] w-full items-center justify-center rounded-full bg-ink text-[17px] font-semibold text-white"
      >
        Find a meal
      </Link>
    </section>
  );
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

/** "Thursday, Aug 20" — the date is context, never a headline. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
