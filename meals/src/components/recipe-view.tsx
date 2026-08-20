"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { RecipeDetail } from "@/lib/views/recipe";
import { Button, ErrorNote, FoodImage, SectionLabel, StatRow, StickyBar } from "@/components/ui";
import { imageFor, useEnrichment } from "@/components/use-enrichment";

type Phase = "idle" | "logging" | "logged";

/**
 * The recipe.
 *
 * Built so it is complete without a video: the steps persisted at generation
 * time are always on the page, and the video sits below them as the companion
 * it is. When YouTube has nothing, or has not been asked yet, nothing here
 * breaks or waits — which is the whole point of resolving sources out of band.
 */
export function RecipeView({ detail }: { detail: RecipeDetail }) {
  const router = useRouter();
  const { recipe, availability } = detail;
  const [servings, setServings] = useState<Record<string, number>>(
    Object.fromEntries(detail.portions.map((p) => [p.member_id, p.servings])),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);

  // If this dish has never been looked up, the hero fills in while the page is
  // being read rather than blocking it from rendering.
  const presentations = useEnrichment([recipe.id]);
  const hero = imageFor(recipe, presentations);
  const enriched = presentations.get(recipe.id);
  const videoUrl = recipe.video_url ?? enriched?.video_url ?? null;
  const creator = recipe.source_name ?? enriched?.source_name ?? null;

  useEffect(() => {
    track("recipe_opened", {
      recipe_id: recipe.id,
      cuisine: recipe.cuisine,
      source_type: recipe.source_type,
    });
  }, [recipe.id, recipe.cuisine, recipe.source_type]);

  async function cookedThis() {
    setPhase("logging");
    setError(null);
    try {
      const response = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipe.id,
          meal_type: "dinner",
          servings_by_member: servings,
        }),
      });
      const body = (await response.json()) as { batch_id?: string; error?: string };
      if (!response.ok || !body.batch_id) throw new Error("That didn't save.");
      setBatchId(body.batch_id);
      setPhase("logged");
      track("cooked", { recipe_id: recipe.id, cuisine: recipe.cuisine });
      router.refresh();
    } catch {
      setError("We couldn't save that just now.");
      setPhase("idle");
    }
  }

  async function undo() {
    if (!batchId) return;
    await fetch("/api/meals/log/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    setPhase("idle");
    setBatchId(null);
    setFeedbackGiven(null);
    router.refresh();
  }

  async function sendFeedback(rating: "love" | "fine" | "never") {
    setFeedbackGiven(rating);
    if (rating === "never") {
      track("recommendation_dismissed", { recipe_id: recipe.id, cuisine: recipe.cuisine });
    }
    await fetch("/api/meals/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: recipe.id, rating }),
    });
  }

  function adjust(memberId: string, delta: number) {
    setServings((current) => {
      const next = Math.min(4, Math.max(0.25, (current[memberId] ?? 1) + delta));
      return { ...current, [memberId]: Math.round(next * 4) / 4 };
    });
  }

  return (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-sunken md:aspect-[21/9]">
        <FoodImage
          title={recipe.title}
          cuisine={recipe.cuisine}
          imageUrl={hero.url}
          state={hero.state}
        />
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="absolute left-4 flex size-11 items-center justify-center rounded-full bg-ground/90 text-ink shadow-sm backdrop-blur"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M12.5 4L6.5 10l6 6"
              stroke="currentColor"
              strokeWidth="1.9"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <header className="px-gutter pt-6">
        <h1 className="text-display font-semibold tracking-tight">{recipe.title}</h1>
        <p className="mt-1 text-meta text-ink-muted">{recipe.cuisine}</p>

        <div className="mt-6">
          <StatRow
            items={[
              { value: `${recipe.total_time_minutes} min`, label: "to cook" },
              { value: `${recipe.calories_per_serving}`, label: "kcal each" },
              { value: `${recipe.protein_per_serving} g`, label: "protein" },
            ]}
          />
        </div>

        {detail.reason ? (
          <p className="mt-6 text-body text-ink-muted">{detail.reason}</p>
        ) : recipe.description ? (
          <p className="mt-6 text-body text-ink-muted">{recipe.description}</p>
        ) : null}
      </header>

      <section aria-label="Ingredients">
        <SectionLabel>You have</SectionLabel>
        <ul className="px-gutter">
          {availability.have.map((entry) => (
            <li key={entry.name} className="flex items-center gap-3 py-2.5">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-good">
                <path
                  d="M4 10.5l4 4 8-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="flex-1 text-body capitalize">{entry.name}</span>
              {entry.use_soon ? <span className="text-meta text-warn">use soon</span> : null}
            </li>
          ))}
          {availability.have.length === 0 ? (
            <li className="text-body text-ink-muted">Nothing for this is in the kitchen yet.</li>
          ) : null}
        </ul>

        {availability.missing.length > 0 ? (
          <>
            <SectionLabel>You need</SectionLabel>
            <ul className="px-gutter">
              {availability.missing.map((entry) => (
                <li key={entry.name} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="size-[18px] shrink-0 rounded-full border-[1.5px] border-line-strong"
                  />
                  <span className="flex-1 text-body capitalize text-ink-muted">{entry.name}</span>
                  {entry.optional ? <span className="text-meta text-ink-faint">optional</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {recipe.instructions.length > 0 ? (
        <section aria-label="How to make it">
          <SectionLabel>How to make it</SectionLabel>
          <ol className="space-y-5 px-gutter">
            {recipe.instructions.map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-meta font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <p className="flex-1 pt-0.5 text-body">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {videoUrl ? (
        <section aria-label="Watch">
          <SectionLabel>Watch</SectionLabel>
          <div className="px-gutter">
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() =>
                track("video_opened", { recipe_id: recipe.id, cuisine: recipe.cuisine })
              }
              className="block overflow-hidden rounded-card bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <span className="relative block aspect-video w-full overflow-hidden bg-surface-sunken">
                <FoodImage
                  title={recipe.title}
                  cuisine={recipe.cuisine}
                  imageUrl={hero.url}
                  state={hero.state}
                />
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-14 items-center justify-center rounded-full bg-ink/65 backdrop-blur-sm">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="white" />
                    </svg>
                  </span>
                </span>
              </span>
              <span className="block p-4">
                <span className="block text-section font-medium">{creator ?? "Cooking video"}</span>
                <span className="tabular mt-1 block text-meta text-ink-muted">
                  {describeVideo(recipe.video_duration_seconds, recipe.video_view_count)}
                </span>
              </span>
            </a>
          </div>
        </section>
      ) : null}

      <section aria-label="Portions">
        <SectionLabel>Portions</SectionLabel>
        <ul className="px-gutter">
          {detail.portions.map((portion) => {
            const chosen = servings[portion.member_id] ?? portion.servings;
            return (
              <li key={portion.member_id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium">{portion.member_name}</p>
                  <p className="tabular mt-0.5 text-meta text-ink-muted">
                    {Math.round(recipe.calories_per_serving * chosen)} kcal ·{" "}
                    {Math.round(recipe.protein_per_serving * chosen)} g protein
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjust(portion.member_id, -0.25)}
                    aria-label={`Smaller portion for ${portion.member_name}`}
                    className="flex size-11 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface-sunken"
                  >
                    −
                  </button>
                  <span className="tabular w-12 text-center text-meta">{chosen}</span>
                  <button
                    type="button"
                    onClick={() => adjust(portion.member_id, 0.25)}
                    aria-label={`Bigger portion for ${portion.member_name}`}
                    className="flex size-11 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface-sunken"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {phase === "logged" ? (
        <section className="stage-enter px-gutter pt-8">
          <div className="rounded-card bg-surface p-5">
            <p className="text-section font-semibold">Nice one — that&apos;s logged.</p>
            <p className="mt-1 text-meta text-ink-muted">Your kitchen has been updated.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {(["love", "fine", "never"] as const).map((rating) => (
                <Button
                  key={rating}
                  size="sm"
                  variant={feedbackGiven === rating ? "primary" : "secondary"}
                  onClick={() => sendFeedback(rating)}
                >
                  {rating === "love" ? "Loved it" : rating === "fine" ? "It was fine" : "Not again"}
                </Button>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-4">
              <Button variant="quiet" size="sm" onClick={undo}>
                Undo
              </Button>
              <Link href="/today" className="text-meta text-accent hover:underline">
                Back to Today
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <div className="pad-nav" />

      {phase !== "logged" ? (
        <StickyBar>
          <Button full onClick={cookedThis} disabled={phase === "logging"}>
            {phase === "logging" ? "Saving…" : "Cooked this"}
          </Button>
        </StickyBar>
      ) : null}
    </>
  );
}

/**
 * The one line under a video: how long it is and how many people watched.
 *
 * Both are omitted rather than guessed when the recipe predates them being
 * recorded — an empty line is honest, an invented one is not. Short-form is
 * named because it changes what you are about to get, not to editorialise.
 */
function describeVideo(seconds: number | null, views: number | null): string {
  const parts: string[] = [];
  if (seconds !== null) {
    parts.push(seconds < 90 ? "Short" : `${Math.round(seconds / 60)} min`);
  }
  if (views !== null && views > 0) {
    parts.push(
      views >= 1_000_000
        ? `${(views / 1_000_000).toFixed(1).replace(/\.0$/, "")}M views`
        : views >= 1_000
          ? `${Math.round(views / 1_000)}K views`
          : `${views} views`,
    );
  }
  return parts.join(" · ");
}
