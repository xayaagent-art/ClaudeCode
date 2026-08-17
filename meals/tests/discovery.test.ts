import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "meals-discovery-"));
process.env.LOCAL_DB_PATH = join(scratch, "db.json");
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.YOUTUBE_API_KEY;

const { catalogRecipes } = await import("@/lib/meals/catalog");
const {
  assessVideo,
  buildVideoQuery,
  dishRelevance,
  durationFit,
  selectBestVideo,
  MIN_SOURCE_QUALITY,
} = await import("@/lib/meals/source-quality");
const { parseIsoDuration, YouTubeProvider } = await import("@/lib/video/youtube");
const { resolveRecipeSource, hasUsableSource } = await import("@/lib/meals/discovery-service");
const { resetLocalDatabase, localDatabase } = await import("@/lib/db/local");
const { householdContext } = await import("./helpers");
import type { VideoCandidate, VideoProvider } from "@/lib/video/provider";

const palak = catalogRecipes.find((r) => r.id === "cat-palak-paneer-bowls")!;
const context = householdContext();

function candidate(overrides: Partial<VideoCandidate> = {}): VideoCandidate {
  return {
    platform: "youtube",
    video_id: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Palak Paneer Bowls Recipe",
    channel: "Home Kitchen",
    description: "An Indian spinach and paneer curry",
    thumbnail_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    duration_seconds: 480,
    published_at: "2025-04-02T10:00:00Z",
    view_count: 250_000,
    ...overrides,
  };
}

/** Records calls so cache behaviour is observable. */
function stubProvider(results: VideoCandidate[]): VideoProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    name: "StubTube",
    platform: "youtube",
    enabled: () => true,
    unavailableReason: () => null,
    async search(query: string) {
      calls.push(query);
      return results;
    },
  };
}

beforeEach(async () => {
  await resetLocalDatabase();
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("duration parsing", () => {
  it("reads ISO-8601 durations", () => {
    expect(parseIsoDuration("PT12M34S")).toBe(754);
    expect(parseIsoDuration("PT1H2M")).toBe(3720);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("garbage")).toBeNull();
  });
});

describe("source quality heuristic", () => {
  it("scores a well-matched cook-along highly", () => {
    const quality = assessVideo(candidate(), palak, context);
    expect(quality.disqualified).toBe(false);
    expect(quality.score).toBeGreaterThan(MIN_SOURCE_QUALITY);
    expect(quality.reasons.length).toBeGreaterThan(0);
  });

  it("disqualifies a video for a different dish", () => {
    const quality = assessVideo(
      candidate({ title: "The Best Chocolate Brownies" }),
      palak,
      context,
    );
    expect(quality.disqualified).toBe(true);
    expect(quality.score).toBe(0);
  });

  it("disqualifies content that conflicts with the household's diet", () => {
    const quality = assessVideo(
      candidate({ title: "Palak Paneer Bowls with Chicken Recipe" }),
      palak,
      context, // chicken_allowed is false
    );
    expect(quality.disqualified).toBe(true);
    expect(quality.reasons[0]).toMatch(/chicken/i);
  });

  it("penalises non-recipe formats", () => {
    const normal = assessVideo(candidate(), palak, context);
    const reaction = assessVideo(
      candidate({ title: "Palak Paneer Bowls Recipe taste test reaction" }),
      palak,
      context,
    );
    expect(reaction.score).toBeLessThan(normal.score);
  });

  it("prefers a cookable length over a clip or a vlog", () => {
    expect(durationFit(45)).toBeLessThan(durationFit(480));
    expect(durationFit(3600)).toBeLessThan(durationFit(480));
    expect(durationFit(480)).toBe(1);
    expect(durationFit(null)).toBe(0.5);
  });

  it("measures dish relevance from the title", () => {
    expect(dishRelevance("Palak Paneer Bowls", "Palak Paneer Bowls Recipe")).toBe(1);
    expect(dishRelevance("Palak Paneer Bowls", "Chocolate Cake")).toBe(0);
  });

  it("picks the best candidate and rejects a weak field", () => {
    const best = selectBestVideo(
      [
        candidate({ video_id: "weak", title: "Palak Paneer Bowls", duration_seconds: 40 }),
        candidate({ video_id: "strong", title: "Palak Paneer Bowls Recipe step by step" }),
      ],
      palak,
      context,
    );
    expect(best?.candidate.video_id).toBe("strong");

    expect(selectBestVideo([candidate({ title: "Unrelated Pasta Bake" })], palak, context)).toBeNull();
  });

  it("builds a search query that names the dish and cuisine", () => {
    const query = buildVideoQuery(palak);
    expect(query).toContain("Palak Paneer Bowls");
    expect(query).toContain("Indian");
    expect(query).toContain("recipe");
  });
});

describe("discovery service", () => {
  it("attaches a real video and persists it", async () => {
    const provider = stubProvider([candidate()]);
    const outcome = await resolveRecipeSource(palak, context, { provider });

    expect(outcome.outcome).toBe("resolved");
    expect(outcome.recipe.video_url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(outcome.recipe.video_platform).toBe("youtube");
    expect(outcome.recipe.thumbnail_url).toContain("ytimg.com");
    expect(outcome.recipe.attribution).toContain("Home Kitchen");
    expect(outcome.recipe.source_quality?.reasons.length).toBeGreaterThan(0);

    const saved = await localDatabase().getRecipe(palak.id);
    expect(saved?.video_url).toBe(outcome.recipe.video_url);
  });

  it("serves a resolved source from cache without searching again", async () => {
    const provider = stubProvider([candidate()]);
    const first = await resolveRecipeSource(palak, context, { provider });
    expect(provider.calls).toHaveLength(1);

    const second = await resolveRecipeSource(first.recipe, context, { provider });
    expect(second.outcome).toBe("cached");
    expect(provider.calls).toHaveLength(1); // no second external call
  });

  it("searches again only when forced", async () => {
    const provider = stubProvider([candidate()]);
    const first = await resolveRecipeSource(palak, context, { provider });
    await resolveRecipeSource(first.recipe, context, { provider, force: true });
    expect(provider.calls).toHaveLength(2);
  });

  it("degrades to no video rather than inventing one when nothing is good enough", async () => {
    const provider = stubProvider([candidate({ title: "Completely Unrelated Dish" })]);
    const outcome = await resolveRecipeSource(palak, context, { provider });

    expect(outcome.outcome).toBe("no_match");
    expect(outcome.recipe.video_url).toBeNull();
    expect(outcome.recipe.thumbnail_url).toBeNull();
  });

  it("does not re-search a dish that recently found nothing", async () => {
    const provider = stubProvider([candidate({ title: "Completely Unrelated Dish" })]);
    const first = await resolveRecipeSource(palak, context, { provider });
    await resolveRecipeSource(first.recipe, context, { provider });
    // The failed attempt is stamped, but a recipe without a video is still
    // retried — one call per attempt, never a loop within a single request.
    expect(provider.calls.length).toBeLessThanOrEqual(2);
  });

  it("reports provider unavailability instead of faking a source", async () => {
    const disabled: VideoProvider = {
      name: "YouTube",
      platform: "youtube",
      enabled: () => false,
      unavailableReason: () => "YOUTUBE_API_KEY is not set, so no cooking videos can be looked up.",
      async search() {
        throw new Error("should not be called");
      },
    };

    const outcome = await resolveRecipeSource(palak, context, { provider: disabled });
    expect(outcome.outcome).toBe("provider_unavailable");
    expect(outcome.reason).toMatch(/YOUTUBE_API_KEY/);
    expect(outcome.recipe.video_url).toBeNull();
  });

  it("survives a provider that throws", async () => {
    const broken: VideoProvider = {
      name: "StubTube",
      platform: "youtube",
      enabled: () => true,
      unavailableReason: () => null,
      async search() {
        throw new Error("network down");
      },
    };
    const outcome = await resolveRecipeSource(palak, context, { provider: broken });
    expect(outcome.outcome).toBe("provider_unavailable");
    expect(outcome.recipe.video_url).toBeNull();
  });

  it("treats a recipe with video and thumbnail as already sourced", () => {
    expect(hasUsableSource(palak)).toBe(false);
    expect(
      hasUsableSource({
        ...palak,
        video_url: "https://youtube.com/watch?v=x",
        thumbnail_url: "https://i.ytimg.com/x.jpg",
        discovered_at: new Date().toISOString(),
      }),
    ).toBe(true);
  });
});

describe("youtube provider", () => {
  it("is disabled and silent without an API key", async () => {
    const provider = new YouTubeProvider();
    expect(provider.enabled()).toBe(false);
    expect(provider.unavailableReason()).toMatch(/YOUTUBE_API_KEY/);
    await expect(provider.search("anything")).resolves.toEqual([]);
  });

  it("requests embeddable, medium-length videos and reads the largest thumbnail", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/search")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: { videoId: "vid1" },
                snippet: {
                  title: "Palak Paneer Bowls Recipe",
                  description: "Indian",
                  channelTitle: "Home Kitchen",
                  publishedAt: "2025-01-01T00:00:00Z",
                  thumbnails: {
                    default: { url: "small.jpg", width: 120 },
                    high: { url: "large.jpg", width: 480 },
                  },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "vid1",
              contentDetails: { duration: "PT8M10S" },
              statistics: { viewCount: "12345" },
              status: { privacyStatus: "public" },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await new YouTubeProvider().search("palak paneer recipe");

    expect(results).toHaveLength(1);
    expect(results[0].thumbnail_url).toBe("large.jpg");
    expect(results[0].duration_seconds).toBe(490);
    expect(results[0].view_count).toBe(12345);
    expect(results[0].url).toBe("https://www.youtube.com/watch?v=vid1");
    expect(calls[0]).toContain("videoEmbeddable=true");
    expect(calls[0]).toContain("videoDuration=medium");
    expect(calls[0]).toContain("key=test-key");

    vi.unstubAllGlobals();
    delete process.env.YOUTUBE_API_KEY;
  });
});

/**
 * The checklist a live run has to satisfy, driven by payloads shaped like real
 * YouTube results for the household's own catalog dishes. These are stubs, not
 * network calls — but they exercise the same selection, caching and attribution
 * code that a live key runs, so a regression here is a regression in production.
 */
describe("live-shaped results for real catalog dishes", () => {
  const chana = catalogRecipes.find((r) => r.id === "cat-chana-masala")!;

  it("keeps 'restaurant style' cook-alongs, which is how Indian recipes are titled", () => {
    // Regression: "restaurant" was both a title-noise word and an off-format
    // signal, so the best-matched result for an Indian dish took a 0.25 penalty.
    const restaurantStyle = candidate({
      title: "Palak Paneer Recipe | Restaurant Style Palak Paneer",
      view_count: 1_400_000,
    });
    const assessment = assessVideo(restaurantStyle, palak, context);

    expect(assessment.disqualified).toBe(false);
    expect(assessment.score).toBeGreaterThanOrEqual(MIN_SOURCE_QUALITY);
    expect(assessment.reasons.join(" ")).not.toMatch(/non-recipe/i);
  });

  it("still rejects a video about visiting a restaurant", () => {
    const tour = candidate({ title: "Palak Paneer at a Delhi Restaurant Tour" });
    expect(assessVideo(tour, palak, context).reasons.join(" ")).toMatch(/non-recipe/i);
  });

  it("picks the cook-along over a taste test for the same dish", () => {
    const best = selectBestVideo(
      [
        candidate({
          video_id: "taste",
          url: "https://www.youtube.com/watch?v=taste",
          title: "Palak Paneer Taste Test — is it worth it?",
        }),
        candidate({
          video_id: "cook",
          url: "https://www.youtube.com/watch?v=cook",
          title: "Palak Paneer Recipe | Restaurant Style",
          channel: "Ranveer Brar",
        }),
      ],
      palak,
      context,
    );

    expect(best?.candidate.video_id).toBe("cook");
  });

  it("matches a dish the household names differently from the video", () => {
    // Our catalog says "Chana Masala with Basmati"; YouTube says "Chole".
    expect(dishRelevance(chana.title, "Chana Masala Recipe | Punjabi Chole Masala")).toBeGreaterThan(
      0.34,
    );
  });

  it("rejects a chicken video for a household that does not eat chicken", () => {
    const chicken = candidate({ title: "Chicken Palak Recipe | Saag Chicken" });
    const assessment = assessVideo(chicken, palak, context);

    expect(assessment.disqualified).toBe(true);
    expect(assessment.score).toBe(0);
    expect(assessment.reasons.join(" ")).toMatch(/chicken/i);
  });

  it("carries thumbnail, watch URL and attribution onto the recipe", async () => {
    const provider = stubProvider([
      candidate({
        video_id: "kQ7x",
        url: "https://www.youtube.com/watch?v=kQ7x",
        title: "Palak Paneer Recipe | Restaurant Style",
        channel: "Ranveer Brar",
        thumbnail_url: "https://i.ytimg.com/vi/kQ7x/maxresdefault.jpg",
      }),
    ]);

    const { recipe, outcome } = await resolveRecipeSource(palak, context, { provider });

    expect(outcome).toBe("resolved");
    // "Watch recipe" opens exactly the video that was selected.
    expect(recipe.video_url).toBe("https://www.youtube.com/watch?v=kQ7x");
    expect(recipe.video_platform).toBe("youtube");
    // The thumbnail the card and hero render.
    expect(recipe.thumbnail_url).toBe("https://i.ytimg.com/vi/kQ7x/maxresdefault.jpg");
    // Attribution names the creator, not us.
    expect(recipe.attribution).toBe("Video by Ranveer Brar on StubTube");
    expect(recipe.source_name).toBe("Ranveer Brar");
    expect(recipe.source_quality?.score).toBeGreaterThanOrEqual(MIN_SOURCE_QUALITY);
  });

  it("spends one search per dish no matter how often it is viewed", async () => {
    const provider = stubProvider([candidate({ title: "Palak Paneer Recipe" })]);
    const db = localDatabase();

    await resolveRecipeSource(palak, context, { provider });
    // Every later view reads the persisted recipe, exactly as a page load does.
    for (let view = 0; view < 5; view += 1) {
      const stored = (await db.getRecipe(palak.id))!;
      const again = await resolveRecipeSource(stored, context, { provider });
      expect(again.outcome).toBe("cached");
    }

    expect(provider.calls).toHaveLength(1);
  });

  it("costs nothing at all when the key is absent", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await new YouTubeProvider().search("palak paneer recipe");

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
