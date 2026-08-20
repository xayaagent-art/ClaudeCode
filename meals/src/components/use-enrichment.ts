"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Fill in food imagery after the meal has already been shown.
 *
 * The rule from Milestone 2 is that generation never waits on YouTube, so a
 * recommendation arrives with whatever picture the dish already had — for a
 * brand-new dish, none. This closes that gap from the client: the cards render
 * immediately, one request goes out for the ids on screen, and the thumbnails
 * fade in when it answers.
 *
 * Two things keep it from becoming the synchronous work it replaced:
 *
 *  - Ids already asked about in this session are never asked about again, so a
 *    re-render, a returning navigation or a sheet opening twice costs nothing.
 *  - The server only searches for recipes that have never been looked up
 *    (`pendingEnrichment`), so even a genuinely new request is free for dishes
 *    that already have a source.
 *
 * Failure is silent on purpose. A missing thumbnail is a cosmetic outcome and
 * the card is already readable without it; surfacing an error for it would be
 * louder than the problem.
 */

export interface Presentation {
  recipe_id: string;
  image_state: "resolved" | "pending" | "unavailable";
  image_url: string | null;
  video_url: string | null;
  source_name: string | null;
}

/**
 * How many times a screen will go back for the ids the server had to defer.
 *
 * The endpoint looks up a bounded number of dishes per call so one screenful
 * of new recipes cannot spend a daily search quota in a single request; the
 * rest come back still marked pending. Without a second round, a seven-day
 * plan would show three pictures and four permanent shimmers. Capped so a
 * genuinely unresolvable screen stops asking instead of polling forever.
 */
const MAX_ROUNDS = 4;

export function useEnrichment(recipeIds: string[]): Map<string, Presentation> {
  const [presentations, setPresentations] = useState<Map<string, Presentation>>(new Map());
  const settled = useRef(new Set<string>());
  const inFlight = useRef(false);
  const [round, setRound] = useState(0);

  // A stable key, so the effect re-runs when the *set* of ids changes rather
  // than on every render that rebuilds the array.
  const key = recipeIds.join(",");

  useEffect(() => {
    if (inFlight.current || round >= MAX_ROUNDS) return;
    const outstanding = recipeIds.filter((id) => !settled.current.has(id));
    if (outstanding.length === 0) return;

    inFlight.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/recipes/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe_ids: outstanding }),
        });
        if (!response.ok) return;
        const body = (await response.json()) as { presentations?: Presentation[] };
        if (cancelled || !body.presentations) return;

        for (const presentation of body.presentations) {
          // "pending" means the server deferred this one, so it stays on the
          // list for the next round. Anything else is a final answer.
          if (presentation.image_state !== "pending") settled.current.add(presentation.recipe_id);
        }

        setPresentations((current) => {
          const next = new Map(current);
          for (const presentation of body.presentations!) {
            next.set(presentation.recipe_id, presentation);
          }
          return next;
        });
      } catch {
        // Cosmetic. The card stands on its own without a photograph.
      } finally {
        inFlight.current = false;
        if (!cancelled) setRound((value) => value + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round]);

  return presentations;
}

/**
 * What to draw for one recipe right now: the enriched picture if it has
 * arrived, the one the recipe was already carrying otherwise.
 */
export function imageFor(
  recipe: { id: string; thumbnail_url?: string | null; image_url?: string | null },
  presentations: Map<string, Presentation>,
): { url: string | null; state: "resolved" | "pending" | "unavailable" } {
  const stored = recipe.thumbnail_url ?? recipe.image_url ?? null;
  if (stored) return { url: stored, state: "resolved" };

  const enriched = presentations.get(recipe.id);
  if (enriched?.image_url) return { url: enriched.image_url, state: "resolved" };
  // No answer yet means a lookup is still in flight, which is a shimmer rather
  // than a verdict. Only the server saying "unavailable" ends the wait.
  return { url: null, state: enriched?.image_state === "unavailable" ? "unavailable" : "pending" };
}
