"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import type { RecipeDetail } from "@/lib/views/recipe";
import { Button, Divider, ErrorNote, Pill, RecipePlate, SectionHeading } from "@/components/ui";

type Phase = "idle" | "logging" | "logged";

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
  // Steps stay collapsed when there is a video to cook along with, so the page
  // reads as "watch this" rather than as a recipe blog.
  const [stepsOpen, setStepsOpen] = useState(!recipe.video_url);

  useEffect(() => {
    track("recipe_viewed", {
      recipe_id: recipe.id,
      cuisine: recipe.cuisine,
      source_type: recipe.source_type,
      has_video: Boolean(recipe.video_url),
    });
  }, [recipe.id, recipe.cuisine, recipe.source_type, recipe.video_url]);

  function openedVideo() {
    track("recipe_video_opened", {
      recipe_id: recipe.id,
      cuisine: recipe.cuisine,
      platform: recipe.video_platform,
    });
  }

  function openedSource() {
    track("external_source_opened", {
      recipe_id: recipe.id,
      cuisine: recipe.cuisine,
      source: recipe.source_name,
    });
  }

  async function ateThis() {
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
      if (!response.ok || !body.batch_id) throw new Error(body.error ?? "We couldn't log that.");
      setBatchId(body.batch_id);
      setPhase("logged");
      track("meal_logged", { recipe_id: recipe.id, cuisine: recipe.cuisine });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
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
    track("meal_log_undone", { recipe_id: recipe.id });
    setPhase("idle");
    setBatchId(null);
    setFeedbackGiven(null);
    router.refresh();
  }

  async function sendFeedback(rating: "love" | "fine" | "never") {
    setFeedbackGiven(rating);
    track("meal_feedback_submitted", { recipe_id: recipe.id, rating });
    if (rating === "never") {
      track("meal_disliked", { recipe_id: recipe.id, cuisine: recipe.cuisine });
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
      <div className="relative h-52 w-full md:h-64">
        <RecipePlate
          title={recipe.title}
          cuisine={recipe.cuisine}
          imageUrl={recipe.thumbnail_url ?? recipe.image_url}
        />
        <Link
          href="/meals"
          className="absolute left-4 top-4 inline-flex min-h-11 items-center rounded-full bg-ground/90 px-4 text-meta font-medium text-ink backdrop-blur"
        >
          Back
        </Link>
      </div>

      <header className="px-5 pt-6">
        <h1 className="text-display font-semibold tracking-tight">{recipe.title}</h1>
        <p className="mt-2 text-meta text-ink-muted">
          {recipe.cuisine} · {recipe.total_time_minutes} min ·{" "}
          {Math.round(availability.ratio * 100)}% of ingredients on hand
        </p>
        {detail.reason ? (
          <p className="mt-3 text-body">{detail.reason}</p>
        ) : recipe.description ? (
          <p className="mt-3 text-body text-ink-muted">{recipe.description}</p>
        ) : null}
      </header>

      <section className="px-5 py-8" aria-label="Portions">
        <h2 className="pb-3 text-section font-semibold">Portions</h2>
        <ul className="divide-y divide-line">
          {detail.portions.map((portion) => {
            const chosen = servings[portion.member_id] ?? portion.servings;
            return (
              <li key={portion.member_id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-body font-medium">{portion.member_name}</p>
                  <p className="tabular mt-0.5 text-meta text-ink-muted">
                    {Math.round(recipe.calories_per_serving * chosen)} kcal ·{" "}
                    {Math.round(recipe.protein_per_serving * chosen)} g protein
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjust(portion.member_id, -0.25)}
                    aria-label={`Decrease ${portion.member_name}'s serving`}
                    className="flex size-11 items-center justify-center rounded-full border border-line text-ink-muted hover:bg-surface-sunken"
                  >
                    −
                  </button>
                  <span className="tabular w-16 text-center text-meta">
                    {chosen} serving{chosen === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjust(portion.member_id, 0.25)}
                    aria-label={`Increase ${portion.member_name}'s serving`}
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

      <Divider />

      <section className="py-8" aria-label="Ingredients">
        <SectionHeading>You have</SectionHeading>
        <ul className="px-5">
          {availability.have.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="text-body">{entry.name}</span>
              {entry.use_soon ? (
                <Pill tone="warn">
                  use soon
                  {entry.days_to_expiry !== null ? ` · ${entry.days_to_expiry}d` : ""}
                </Pill>
              ) : entry.status === "low" ? (
                <Pill tone="neutral">running low</Pill>
              ) : null}
            </li>
          ))}
          {availability.have.length === 0 ? (
            <li className="text-body text-ink-muted">Nothing for this recipe is in the kitchen yet.</li>
          ) : null}
        </ul>

        {availability.missing.length > 0 ? (
          <div className="pt-7">
            <SectionHeading>Missing</SectionHeading>
            <ul className="px-5">
              {availability.missing.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="text-body text-ink-muted">{entry.name}</span>
                  {entry.optional ? <Pill tone="neutral">optional</Pill> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <Divider />

      {recipe.video_url ? (
        <section className="py-8" aria-label="Watch">
          <SectionHeading>Watch</SectionHeading>
          <div className="px-5">
            <a
              href={recipe.video_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={openedVideo}
              className="block overflow-hidden rounded-[18px] border border-line bg-surface"
            >
              <span className="relative block h-44 w-full">
                <RecipePlate
                  title={recipe.title}
                  cuisine={recipe.cuisine}
                  imageUrl={recipe.thumbnail_url}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex size-14 items-center justify-center rounded-full bg-ink/70 backdrop-blur-sm">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="white" />
                    </svg>
                  </span>
                </span>
              </span>
              {recipe.attribution ? (
                <span className="block px-4 py-3 text-meta text-ink-muted">
                  {recipe.attribution}
                </span>
              ) : null}
            </a>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href={recipe.video_url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={openedVideo}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 text-body font-medium text-white transition-colors hover:bg-accent-ink"
              >
                Watch recipe
              </a>
              <Button variant="secondary" onClick={() => setStepsOpen((v) => !v)}>
                {stepsOpen ? "Hide steps" : "View steps"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {recipe.source_url && recipe.source_url !== recipe.video_url ? (
        <p className="px-5 pb-6 text-meta text-ink-faint">
          {recipe.attribution ?? "Adapted from"}{" "}
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={openedSource}
            className="underline"
          >
            {recipe.source_name ?? "the original recipe"}
          </a>
        </p>
      ) : null}

      {recipe.video_url ? <Divider /> : null}

      {stepsOpen ? (
        <section className="py-8" aria-label="Steps">
          <SectionHeading>Steps</SectionHeading>
          <ol className="space-y-4 px-5">
            {recipe.instructions.map((step, index) => (
              <li key={index} className="flex gap-4">
                <span className="tabular mt-0.5 w-5 shrink-0 text-meta text-ink-faint">
                  {index + 1}
                </span>
                <p className="text-body">{step}</p>
              </li>
            ))}
          </ol>
          {recipe.source_url ? (
            <p className="px-5 pt-5 text-meta text-ink-faint">
              Summarised in our own words. Follow the link above for the full original.
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {phase === "logged" ? (
        <section className="stage-enter px-5 pb-12 pt-4">
          <p className="text-body font-medium">Logged. Nutrition and the kitchen are updated.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-meta text-ink-muted">How was it?</span>
            {(["love", "fine", "never"] as const).map((rating) => (
              <Button
                key={rating}
                size="sm"
                variant={feedbackGiven === rating ? "primary" : "secondary"}
                onClick={() => sendFeedback(rating)}
              >
                {rating === "love" ? "Love it" : rating === "fine" ? "Fine" : "Don't recommend"}
              </Button>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button variant="quiet" onClick={undo}>
              Undo
            </Button>
            <Link href="/today" className="text-meta text-accent hover:underline">
              Back to Today
            </Link>
          </div>
        </section>
      ) : (
        <div className="sticky bottom-20 z-30 px-5 pb-6 pt-2 md:bottom-4">
          <Button full onClick={ateThis} disabled={phase === "logging"}>
            {phase === "logging" ? "Logging…" : "Ate this"}
          </Button>
        </div>
      )}
    </>
  );
}
