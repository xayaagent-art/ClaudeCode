import { describe, expect, it } from "vitest";
import {
  behaviorAdjustment,
  normalizeEvent,
  summarizeBehavior,
} from "@/lib/meals/behavior";
import { dishAxes, mealFormat, proteinSource, selectDiverse } from "@/lib/meals/taxonomy";
import {
  buildVideoQueries,
  durationFit,
  reachScore,
  selectBestVideo,
} from "@/lib/meals/source-quality";
import { presentationFor, pendingEnrichment } from "@/lib/meals/enrichment";
import type { HouseholdContext, PreferenceSignal, Recipe } from "@/lib/types";
import type { VideoCandidate } from "@/lib/video/provider";

/**
 * The intelligence contracts.
 *
 * Everything here is a pure function of persisted state, which is the point:
 * variety, suppression and video choice all have to be explainable from the
 * same inputs twice running, or a bad suggestion cannot be argued with.
 */

function recipe(overrides: Partial<Recipe> & { title: string }): Recipe {
  const id = overrides.id ?? `r-${overrides.title.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    description: overrides.description ?? "",
    cuisine: overrides.cuisine ?? "Indian",
    image_url: null,
    prep_time_minutes: 5,
    cook_time_minutes: 20,
    total_time_minutes: 25,
    servings: 2,
    calories_per_serving: 500,
    protein_per_serving: 25,
    dietary_tags: ["vegetarian"],
    source_type: "generated",
    source_url: null,
    source_name: null,
    video_url: null,
    video_platform: null,
    thumbnail_url: null,
    attribution: null,
    source_quality: null,
    discovered_at: null,
    cooking_summary: null,
    instructions: [],
    ingredients: (overrides.ingredients ?? []) as Recipe["ingredients"],
    canonical_key: null,
    times_cooked: 0,
    last_cooked_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
    // After the spread so an explicit override cannot desynchronise the two.
    id,
    title: overrides.title,
  };
}

function ingredients(names: string[], recipeId: string): Recipe["ingredients"] {
  return names.map((name, index) => ({
    id: `${recipeId}-${index}`,
    recipe_id: recipeId,
    ingredient_name: name,
    normalized_name: name.toLowerCase(),
    quantity: null,
    unit: null,
    optional: false,
  }));
}

function signal(overrides: Partial<PreferenceSignal> & { event: string }): PreferenceSignal {
  return {
    id: `s-${Math.random()}`,
    household_id: "h",
    member_id: null,
    recipe_id: overrides.recipe_id ?? null,
    cuisine: overrides.cuisine ?? null,
    detail: {},
    created_at: overrides.created_at ?? "2026-08-19T00:00:00.000Z",
    ...overrides,
    event: overrides.event as PreferenceSignal["event"],
  } as PreferenceSignal;
}

describe("dish taxonomy", () => {
  it("separates dinners that share their ingredients but not their shape", () => {
    // The exact complaint: same protein, same greens, three "different" meals.
    const curry = recipe({ title: "Palak Paneer Curry", description: "A creamy curry." });
    const tacos = recipe({ title: "Paneer Tikka Tacos", description: "Spiced tacos." });
    const salad = recipe({ title: "Paneer Spinach Salad", description: "A fresh salad." });

    expect(mealFormat(curry)).toBe("curry");
    expect(mealFormat(tacos)).toBe("tacos");
    expect(mealFormat(salad)).toBe("salad");
    // Protein is shared — which is exactly why format has to carry the weight.
    expect(proteinSource(curry)).toBe("paneer");
    expect(proteinSource(tacos)).toBe("paneer");
  });

  it("reads the protein off the ingredients when the title is coy", () => {
    const id = "r-weeknight-bowl";
    const dish = recipe({
      id,
      title: "Weeknight Bowl",
      ingredients: ingredients(["red lentils", "rice"], id),
    });
    expect(proteinSource(dish)).toBe("lentil");
  });
});

describe("diverse selection", () => {
  const pool = [
    recipe({ title: "Palak Paneer Curry", description: "curry", cuisine: "Indian" }),
    recipe({ title: "Paneer Butter Masala Curry", description: "curry", cuisine: "Indian" }),
    recipe({ title: "Chana Masala Curry", description: "curry", cuisine: "Indian" }),
    recipe({ title: "Black Bean Tacos", description: "tacos", cuisine: "Mexican" }),
    recipe({ title: "Greek Feta Salad", description: "salad", cuisine: "Greek" }),
  ].map((r) => ({ recipe: r }));

  it("does not return three versions of the same dinner", () => {
    const picked = selectDiverse(pool, 3);
    const formats = new Set(picked.map((entry) => dishAxes(entry.recipe).format));
    const cuisines = new Set(picked.map((entry) => dishAxes(entry.recipe).cuisine));

    expect(picked).toHaveLength(3);
    // Three curries would be one format and one cuisine; variety means more.
    expect(formats.size).toBeGreaterThanOrEqual(3);
    expect(cuisines.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — the same ranked pool gives the same set", () => {
    expect(selectDiverse(pool, 3).map((e) => e.recipe.id)).toEqual(
      selectDiverse(pool, 3).map((e) => e.recipe.id),
    );
  });

  it("degrades to the best available rather than returning short", () => {
    // A pool with nowhere to go still has to fill the screen.
    const monotonous = [
      recipe({ id: "a", title: "Curry A", description: "curry" }),
      recipe({ id: "b", title: "Curry B", description: "curry" }),
      recipe({ id: "c", title: "Curry C", description: "curry" }),
    ].map((r) => ({ recipe: r }));
    expect(selectDiverse(monotonous, 3)).toHaveLength(3);
  });
});

describe("behaviour memory", () => {
  const dish = recipe({ id: "d1", title: "Chana Masala", canonical_key: "indian:chana-masala" });

  it("maps the older event names onto the current vocabulary", () => {
    expect(normalizeEvent("meal_logged")).toBe("cooked");
    expect(normalizeEvent("recipe_viewed")).toBe("recipe_opened");
    expect(normalizeEvent("recommendation_shown")).toBe("recommendation_shown");
    expect(normalizeEvent("nonsense")).toBeNull();
  });

  it("downranks a dish the household keeps dismissing", () => {
    const memory = summarizeBehavior(
      [
        signal({ event: "recommendation_dismissed", recipe_id: "d1" }),
        signal({ event: "recommendation_dismissed", recipe_id: "d1" }),
      ],
      [dish],
    );
    expect(behaviorAdjustment(dish, memory).delta).toBeLessThan(-0.2);
  });

  it("suppresses something cooked two days ago and forgives it later", () => {
    const now = Date.parse("2026-08-20T00:00:00.000Z");
    const recent = summarizeBehavior(
      [signal({ event: "cooked", recipe_id: "d1", created_at: "2026-08-18T00:00:00.000Z" })],
      [dish],
    );
    const old = summarizeBehavior(
      [signal({ event: "cooked", recipe_id: "d1", created_at: "2026-06-01T00:00:00.000Z" })],
      [dish],
    );

    expect(behaviorAdjustment(dish, recent, { now }).delta).toBeLessThan(-0.1);
    // Long after, the same dish is a proven favourite rather than a repeat.
    expect(behaviorAdjustment(dish, old, { now }).delta).toBeGreaterThan(0);
  });

  it("treats opening a recipe as mild interest, not a promotion", () => {
    const memory = summarizeBehavior([signal({ event: "recipe_opened", recipe_id: "d1" })], [dish]);
    const { delta } = behaviorAdjustment(dish, memory);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(0.1);
  });

  it("keeps this week's committed dinners out of the casual alternatives", () => {
    const memory = summarizeBehavior([], [dish], {
      id: "p",
      household_id: "h",
      start_date: "2026-08-20",
      created_at: "2026-08-20T00:00:00.000Z",
      entries: [
        {
          date: "2026-08-21",
          meal_type: "dinner",
          kind: "recipe",
          recipe_id: "d1",
          recipe_title: "Chana Masala",
          note: null,
        },
      ],
    });

    expect(behaviorAdjustment(dish, memory, { casualAlternative: true }).delta).toBeLessThan(-0.2);
    // Asked about in any other context, being planned is not a mark against it.
    expect(behaviorAdjustment(dish, memory, { casualAlternative: false }).delta).toBe(0);
  });
});

describe("video quality", () => {
  const dish = recipe({ id: "v1", title: "Chicken Saag", cuisine: "Indian" });
  const context = {
    preferences: {
      vegetarian: false,
      eggs_allowed: true,
      chicken_allowed: true,
      allergies: [],
      dislikes: [],
    },
  } as unknown as HouseholdContext;

  function video(overrides: Partial<VideoCandidate>): VideoCandidate {
    return {
      platform: "youtube",
      video_id: overrides.video_id ?? `v-${Math.random()}`,
      url: "https://youtube.com/watch?v=x",
      title: "Chicken Saag Recipe",
      channel: "Cook Along",
      description: "How to make chicken saag at home",
      thumbnail_url: "https://img/x.jpg",
      duration_seconds: 420,
      published_at: "2026-01-01T00:00:00.000Z",
      view_count: 200_000,
      like_count: 6_000,
      comment_count: 400,
      channel_id: "c1",
      channel_subscribers: 500_000,
      channel_video_count: 300,
      channel_is_culinary: true,
      ...overrides,
    };
  }

  it("rates a real cook-along above a clip and far above a lecture", () => {
    expect(durationFit(360)).toBe(1);
    expect(durationFit(1800)).toBeLessThan(durationFit(700));
    expect(durationFit(30)).toBeLessThan(durationFit(360));
  });

  it("treats a few hundred views as an absence of evidence", () => {
    expect(reachScore(300)).toBeLessThan(reachScore(60_000));
    expect(reachScore(2_000_000)).toBeGreaterThan(reachScore(60_000));
  });

  it("asks for the dish more than one way", () => {
    const queries = buildVideoQueries(dish, "chicken saag recipe");
    expect(queries.length).toBeGreaterThan(1);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it("prefers a credible video over a barely-watched one", () => {
    const best = selectBestVideo(
      [
        video({ video_id: "obscure", view_count: 400 }),
        video({ video_id: "credible", view_count: 250_000 }),
      ],
      dish,
      context,
    );
    expect(best?.candidate.video_id).toBe("credible");
  });

  it("prefers a short cook-along over a 25-minute one", () => {
    const best = selectBestVideo(
      [
        video({ video_id: "long", duration_seconds: 1_500 }),
        video({ video_id: "tight", duration_seconds: 420 }),
      ],
      dish,
      context,
    );
    expect(best?.candidate.video_id).toBe("tight");
  });

  it("still uses a compromised video when it is the only one", () => {
    // "Prefer" is not "reject": one obscure video beats no video at all.
    const best = selectBestVideo([video({ video_id: "only", view_count: 300 })], dish, context);
    expect(best?.candidate.video_id).toBe("only");
  });

  it("lets an instructional Short win when it genuinely teaches the dish", () => {
    const best = selectBestVideo(
      [
        video({
          video_id: "short",
          title: "Chicken Saag Recipe #shorts",
          duration_seconds: 55,
          view_count: 900_000,
        }),
      ],
      dish,
      context,
    );
    expect(best?.candidate.video_id).toBe("short");
  });

  it("rejects a popular Short that is not about the dish", () => {
    const best = selectBestVideo(
      [
        video({
          video_id: "viral",
          title: "I ate at a restaurant tour mukbang",
          description: "vlog",
          duration_seconds: 40,
          view_count: 8_000_000,
        }),
      ],
      dish,
      context,
    );
    // Popularity must never buy a place ahead of relevance.
    expect(best).toBeNull();
  });
});

describe("presentation contract", () => {
  it("distinguishes never-looked-up from looked-up-and-found-nothing", () => {
    const fresh = recipe({ id: "p1", title: "New Dish" });
    const searched = recipe({
      id: "p2",
      title: "Searched Dish",
      discovered_at: "2026-08-19T00:00:00.000Z",
    });
    const resolved = recipe({
      id: "p3",
      title: "Resolved Dish",
      thumbnail_url: "https://img/y.jpg",
      video_url: "https://youtube.com/watch?v=y",
      discovered_at: "2026-08-19T00:00:00.000Z",
    });

    expect(presentationFor(fresh).image_state).toBe("pending");
    expect(presentationFor(searched).image_state).toBe("unavailable");
    expect(presentationFor(resolved).image_state).toBe("resolved");
    // Only the never-searched one is worth spending a search on.
    expect(pendingEnrichment([fresh, searched, resolved]).map((r) => r.id)).toEqual(["p1"]);
  });

  it("reports whether a dish can be cooked without a video", () => {
    const withSteps = recipe({ id: "p4", title: "Steps", instructions: ["Chop.", "Cook."] });
    expect(presentationFor(withSteps).has_instructions).toBe(true);
    expect(presentationFor(recipe({ id: "p5", title: "None" })).has_instructions).toBe(false);
  });
});
