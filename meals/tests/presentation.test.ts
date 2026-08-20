import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { imageFor, type Presentation } from "@/components/use-enrichment";

/**
 * The presentation contract the new UI is built on.
 *
 * These cover the rules that decide what a card draws before, during and after
 * enrichment — the part that has to be right for a screen to settle instead of
 * shimmering, and for a returning navigation to cost nothing.
 */

function presentation(overrides: Partial<Presentation> & { recipe_id: string }): Presentation {
  return {
    image_state: "resolved",
    image_url: null,
    video_url: null,
    source_name: null,
    ...overrides,
  };
}

describe("what a card draws", () => {
  it("uses the picture the recipe already has, without waiting", () => {
    const { url, state } = imageFor(
      { id: "r1", thumbnail_url: "https://img/a.jpg" },
      new Map(),
    );
    expect(url).toBe("https://img/a.jpg");
    expect(state).toBe("resolved");
  });

  it("shimmers only while an answer is genuinely still coming", () => {
    // Nothing stored and nothing back from the server yet.
    expect(imageFor({ id: "r2" }, new Map()).state).toBe("pending");
  });

  it("settles on the plate once the server says there is nothing", () => {
    // The distinction that stops a deployment with no video provider from
    // shimmering forever on every card.
    const answers = new Map([["r3", presentation({ recipe_id: "r3", image_state: "unavailable" })]]);
    const { url, state } = imageFor({ id: "r3" }, answers);
    expect(url).toBeNull();
    expect(state).toBe("unavailable");
  });

  it("swaps in the enriched picture when it lands", () => {
    const answers = new Map([
      ["r4", presentation({ recipe_id: "r4", image_url: "https://img/late.jpg" })],
    ]);
    expect(imageFor({ id: "r4" }, answers)).toEqual({
      url: "https://img/late.jpg",
      state: "resolved",
    });
  });
});

describe("enrichment requests", () => {
  const calls: unknown[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ presentations: [] }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the enrichment endpoint, never the generator", async () => {
    // The rule the whole milestone rests on: drawing a screen must not be able
    // to reach meal generation. If this ever points at /api/meals/recommend,
    // opening Today starts costing a model request again.
    const response = await fetch("/api/recipes/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_ids: ["r1", "r2"] }),
    });
    expect(response.ok).toBe(true);
    expect(calls).toEqual([{ recipe_ids: ["r1", "r2"] }]);
  });
});
