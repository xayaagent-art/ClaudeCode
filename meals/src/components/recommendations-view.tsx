"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { Button, Card, ErrorNote, Pill, RecipePlate } from "@/components/ui";

interface Recommendation {
  recipe: {
    id: string;
    title: string;
    cuisine: string;
    total_time_minutes: number;
    calories_per_serving: number;
    protein_per_serving: number;
    image_url: string | null;
    source_type: string;
    source_url: string | null;
    thumbnail_url: string | null;
    video_url: string | null;
    source_name: string | null;
  };
  reason: string;
  availability: number;
  missing: { name: string; optional: boolean }[];
  uses_soon: string[];
}

interface RecommendResponse {
  recommendations: Recommendation[];
  weak_match: boolean;
  discovery_used: boolean;
  /** Set when videos could not be looked up, e.g. no YouTube key configured. */
  source_note: string | null;
}

export function RecommendationsView() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  const load = useCallback(async (excludeIds: string[]) => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/meals/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal_type: "dinner", count: 3, exclude_recipe_ids: excludeIds }),
      });
      const body = (await response.json()) as RecommendResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "We couldn't put together suggestions.");
      setData(body);
      setState("ready");
      // One "seen" signal per recommendation actually shown.
      for (const [index, rec] of body.recommendations.entries()) {
        track("recommendation_seen", {
          recipe_id: rec.recipe.id,
          cuisine: rec.recipe.cuisine,
          rank: index + 1,
          availability: rec.availability,
          has_video: Boolean(rec.recipe.video_url),
        });
      }
    } catch (caught) {
      setError((caught as Error).message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void load([]);
  }, [load]);

  function regenerate() {
    track("recommendation_regenerated", { count: data?.recommendations.length ?? 0 });
    void load(data?.recommendations.map((r) => r.recipe.id) ?? []);
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">Dinner</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">What to cook</h1>
        </div>
        <Link
          href="/today"
          className="min-h-11 self-center px-2 text-meta text-ink-muted hover:text-ink"
        >
          Close
        </Link>
      </header>

      {state === "loading" ? <LoadingList /> : null}

      {state === "error" ? (
        <>
          <ErrorNote>{error}</ErrorNote>
          <div className="px-5 pt-5">
            <Button onClick={() => void load([])}>Try again</Button>
          </div>
        </>
      ) : null}

      {state === "ready" && data ? (
        <>
          {data.recommendations.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <h2 className="text-title font-semibold">Nothing quite fits yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-body text-ink-muted">
                There isn&apos;t enough in the kitchen to build a meal we&apos;d stand behind. Add a
                receipt or a few staples and try again.
              </p>
            </div>
          ) : (
            <>
              {data.source_note ? (
                <p className="mx-5 mb-5 rounded-xl border border-line bg-surface-sunken px-4 py-3 text-meta text-ink-muted">
                  Cooking videos aren&apos;t set up yet, so these show written steps only.
                </p>
              ) : null}
              {data.weak_match ? (
                <p className="mx-5 mb-5 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-meta text-warn">
                  These are the closest matches, but each one needs a few things you don&apos;t have.
                </p>
              ) : null}
              <ul className="space-y-4 px-5">
                {data.recommendations.map((rec, index) => (
                  <RecommendationCard key={rec.recipe.id} rec={rec} rank={index + 1} />
                ))}
              </ul>
            </>
          )}
          <div className="px-5 py-8">
            <Button variant="secondary" full onClick={regenerate}>
              Show me three others
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}

function RecommendationCard({ rec, rank }: { rec: Recommendation; rank: number }) {
  const availability = Math.round(rec.availability * 100);
  return (
    <Card as="li" className="fade-rise overflow-hidden" >
      <Link
        href={`/recipes/${rec.recipe.id}`}
        className="block"
        onClick={() =>
          track("meal_recommendation_selected", {
            recipe_id: rec.recipe.id,
            cuisine: rec.recipe.cuisine,
            rank,
            has_video: Boolean(rec.recipe.video_url),
          })
        }
      >
        <div className="h-32 w-full">
          <RecipePlate
            title={rec.recipe.title}
            cuisine={rec.recipe.cuisine}
            imageUrl={rec.recipe.thumbnail_url ?? rec.recipe.image_url}
          />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-section font-semibold">{rec.recipe.title}</h2>
            <Pill tone={availability >= 85 ? "good" : availability >= 60 ? "warn" : "neutral"}>
              {availability}% available
            </Pill>
          </div>
          <p className="tabular mt-2 text-meta text-ink-muted">
            {rec.recipe.total_time_minutes} min · {rec.recipe.calories_per_serving} kcal ·{" "}
            {rec.recipe.protein_per_serving} g protein
          </p>
          <p className="mt-3 text-body text-ink-muted">{rec.reason}</p>
          {rec.missing.length > 0 ? (
            <p className="mt-3 text-meta text-ink-muted">
              <span className="text-ink-faint">Missing:</span>{" "}
              {rec.missing.map((m) => m.name.toLowerCase()).join(", ")}
            </p>
          ) : null}
          {rec.recipe.video_url ? (
            <p className="mt-2 text-meta text-ink-faint">
              Video · {rec.recipe.source_name ?? hostOf(rec.recipe.video_url)}
            </p>
          ) : rec.recipe.source_type !== "catalog" && rec.recipe.source_url ? (
            <p className="mt-2 text-meta text-ink-faint">Adapted from {hostOf(rec.recipe.source_url)}</p>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "a recipe source";
  }
}

function LoadingList() {
  return (
    <div className="px-5" aria-live="polite" aria-busy="true">
      <p className="pb-4 text-meta text-ink-muted">Matching recipes to your kitchen…</p>
      <ul className="space-y-4">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="pulse-soft h-48 rounded-[18px] border border-line bg-surface"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </ul>
      <span className="sr-only">Finding meals</span>
    </div>
  );
}
