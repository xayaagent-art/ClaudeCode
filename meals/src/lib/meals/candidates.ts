import "server-only";
import { z } from "zod";
import { generateContent, geminiConfigured, toGeminiSchema } from "@/lib/ai/gemini";
import { AIFailure, classifyProviderError, type AIFailureKind } from "@/lib/ai/failure";
import { modelFor, thinkingLevelFor } from "@/lib/ai/models";
import { openAIConfigured, structuredCall } from "@/lib/ai/openai-call";
import { openAIModelFor, reasoningFor } from "@/lib/ai/openai-models";
import { activeProviderName } from "@/lib/ai/provider";
import { canonicalName } from "@/lib/kitchen/match";
import { canonicalRecipeKey } from "@/lib/meals/memory";
import { estimateRecipeNutrition } from "@/lib/nutrition/estimate";
import type { AIUsage } from "@/lib/ai/provider";
import type { HouseholdContext, Recipe } from "@/lib/types";

/**
 * Dynamic meal candidate generation.
 *
 * The catalog used to be the universe of possible dinners, which made the app a
 * lookup table with a ranker bolted on. It is now memory: proven dishes the
 * household has actually cooked, plus discoveries worth keeping. The universe
 * comes from here.
 *
 * The division of labour is strict and deliberate. The model proposes concepts
 * — what to cook, roughly what goes in it, roughly how long. The code decides:
 * every hard dietary filter, every score, and all nutrition arithmetic stay
 * deterministic. A candidate is a suggestion until the ranker agrees with it.
 *
 * Which model proposes them is a deployment decision, not an architectural one.
 * Both providers answer the same schema and return the same `Recipe` shape, so
 * everything downstream — ranking, memory, video resolution, persistence — is
 * identical whichever one ran.
 */

const candidateSchema = z.object({
  title: z.string().min(3).max(80),
  cuisine: z.string().min(2).max(40),
  description: z.string().min(8).max(240),
  likely_ingredients: z.array(z.string().min(1)).min(2).max(16),
  estimated_cook_minutes: z.number().min(5).max(180),
  dietary_tags: z.array(z.string()),
  /** The model's intent, not a nutrition claim. The engine computes real numbers. */
  protein_intent: z.enum(["low", "moderate", "high"]),
  /** What to type into a video search to find someone cooking this. */
  search_query: z.string().min(3).max(120),
  fit_reason: z.string().min(8).max(200),
  /**
   * Declared diversity axes. These are the model's own labels and are used to
   * spread one generated batch; selection is arbitrated by taxonomy.ts, which
   * derives the same axes from the dish itself and cannot be talked into a
   * label. Asking for them anyway measurably widens what comes back.
   */
  meal_format: z.string().min(2).max(40),
  protein_source: z.string().min(2).max(40),
  flavor_profile: z.string().min(2).max(40),
  /**
   * Enough to cook from without a video. Generated once, at generation time —
   * a recipe whose steps are fetched on every view is a recipe that breaks when
   * the provider does, and pays for the same words repeatedly.
   */
  instructions: z.array(z.string().min(4).max(400)).min(2).max(12),
  ingredient_quantities: z.array(z.string().min(1).max(80)).max(16).default([]),
});

const resultSchema = z.object({ candidates: z.array(candidateSchema) });

export type MealConcept = z.infer<typeof candidateSchema>;

/**
 * The contract, written once in OpenAI's strict Structured Outputs dialect —
 * every property required, `additionalProperties: false` throughout — and
 * converted for Gemini at the call site. Two hand-maintained copies of a schema
 * drift, and the drift shows up as a validation failure in production rather
 * than as a diff.
 */
const candidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title", "cuisine", "description", "likely_ingredients",
          "estimated_cook_minutes", "dietary_tags", "protein_intent",
          "search_query", "fit_reason", "meal_format", "protein_source",
          "flavor_profile", "instructions", "ingredient_quantities",
        ],
        properties: {
          title: { type: "string", description: "The dish, as a cook would name it." },
          cuisine: { type: "string" },
          description: { type: "string", description: "One sentence. No marketing copy." },
          likely_ingredients: {
            type: "array",
            items: { type: "string" },
            description: "Plain ingredient names, e.g. 'paneer', 'baby spinach'. No quantities.",
          },
          estimated_cook_minutes: { type: "number" },
          dietary_tags: {
            type: "array",
            items: { type: "string" },
            description: "From: vegetarian, vegan, contains_eggs, contains_chicken, gluten_free, high_protein, quick.",
          },
          protein_intent: { type: "string", enum: ["low", "moderate", "high"] },
          search_query: { type: "string", description: "A YouTube search that finds this dish being cooked." },
          fit_reason: { type: "string", description: "Why this suits THIS household and THIS kitchen." },
          meal_format: {
            type: "string",
            description:
              "One of: bowl, wrap, curry, pasta, tacos, stir-fry, salad, sandwich, skillet, sheet-pan, rice dish, soup/stew, bake, pizza.",
          },
          protein_source: {
            type: "string",
            description: "The main protein, e.g. paneer, chickpea, lentil, tofu, egg, bean, yogurt, cheese.",
          },
          flavor_profile: {
            type: "string",
            description:
              "One of: indian-spiced, mediterranean, east-asian, latin, middle-eastern, creamy, fresh-herby, smoky.",
          },
          instructions: {
            type: "array",
            items: { type: "string" },
            description:
              "3-8 numbered-in-order steps a competent home cook can follow without a video. No step numbers in the text.",
          },
          ingredient_quantities: {
            type: "array",
            items: { type: "string" },
            description:
              "Approximate quantity for each entry in likely_ingredients, same order, e.g. '200 g' or '2 tbsp'. Use an empty string where a quantity makes no sense.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You propose weeknight meal ideas for one specific two-person household.

You are a source of ideas, not the decision-maker. Downstream code does the
ranking, the dietary enforcement and all nutrition arithmetic — so propose
broadly and honestly rather than trying to guess what will win.

Rules:
- Respect every dietary restriction. They are constraints, not preferences.
- Build around what is already in the kitchen, especially anything flagged use-soon.
- Vary the set: different cuisines, different preparations, different effort levels.
  Ten variations on one dish is a bad answer.
- Include some genuinely unfamiliar ideas alongside safe ones.
- Never repeat anything listed as recently eaten or recently suggested.
- Spread the set across all four axes: cuisine, meal_format, protein_source and
  flavor_profile. No more than two ideas may share any one of them. Three
  variations on spinach + paneer/chickpea over rice is the failure this rule
  exists to prevent, however differently they are named.
- instructions must be enough to cook the dish with no video: real steps, real
  order, real technique. Not a summary of the dish.
- likely_ingredients should be what the dish actually needs, including items the
  household may not have. Do not pretend a recipe needs only what is in stock.
- estimated_cook_minutes is active cooking time, honestly estimated.`;

/**
 * Behavioural context for one generation. All optional: a household with no
 * history still generates, it just has less to steer with.
 */
export interface GenerationContext {
  /** Dish titles already committed to on this week's plan. */
  planned?: string[];
  /** Titles the household has dismissed before. */
  dismissed?: string[];
  /** Titles opened recently — mild positive interest. */
  opened?: string[];
  /** Titles cooked recently, which should not come straight back. */
  cooked?: string[];
  /** Counts by axis, e.g. { cuisine: { indian: 6 }, format: { curry: 5 } }. */
  distribution?: Record<string, Record<string, number>>;
}

export type CandidateOutcome =
  /** The model answered and the concepts validated. */
  | "generated"
  /** Not configured for dynamic meals at all — an expected, quiet state. */
  | "disabled"
  /** The model was asked and did not deliver. Never quiet. */
  | "failed";

export interface CandidateGeneration {
  recipes: Recipe[];
  /** Model-supplied video search terms, keyed by recipe id. */
  searchQueries: Map<string, string>;
  model: string;
  usage: AIUsage | null;
  outcome: CandidateOutcome;
  /** Typed failure kind when outcome is "failed". */
  failureKind: AIFailureKind | null;
  /** Operator-facing detail. Never rendered raw to the user. */
  error: string | null;
}

function empty(
  outcome: CandidateOutcome,
  model = "none",
  failureKind: AIFailureKind | null = null,
  error: string | null = null,
): CandidateGeneration {
  return { recipes: [], searchQueries: new Map(), model, usage: null, outcome, failureKind, error };
}

/**
 * How many concepts to ask for. Enough for the ranker to be selective, few
 * enough that one request covers a refresh — the whole point of generating in
 * a single call is that the cost per refresh is one call, not a dozen.
 */
const TARGET = 14;

/** Whether the active provider can generate, and whether it is switched on. */
export function candidateGenerationEnabled(): boolean {
  if (process.env.DYNAMIC_MEALS === "off") return false;
  switch (activeProviderName()) {
    case "openai":
      return openAIConfigured();
    case "gemini":
      return geminiConfigured();
    default:
      // Mock mode never generates. Fixture recipes are the demo, and blending
      // them with real ones is exactly the confusion the provider split exists
      // to prevent.
      return false;
  }
}

/** What one provider call returns, before it becomes recipes. */
interface RawGeneration {
  text: string;
  model: string;
  usage: AIUsage;
  attempts: number;
}

/**
 * Ask for a spread of meal concepts for this household, right now.
 *
 * One request per refresh, no tool loops, no follow-ups. Returns [] on any
 * failure: a recommendation must still work from memory alone if the model is
 * unreachable, and a broken idea generator should degrade the product rather
 * than break it.
 */
export async function generateMealCandidates(
  context: HouseholdContext,
  options: { exclude?: string[]; count?: number } & GenerationContext = {},
): Promise<CandidateGeneration> {
  if (!candidateGenerationEnabled()) return empty("disabled");

  const provider = activeProviderName();
  const prompt = buildPrompt(context, options.exclude ?? [], options.count ?? TARGET, options);
  let model = provider === "openai" ? "pending" : modelFor("meal_candidate_generation");

  try {
    const raw =
      provider === "openai"
        ? await generateWithOpenAI(prompt)
        : await generateWithGemini(prompt, model);
    model = raw.model;

    const parsed = resultSchema.safeParse(JSON.parse(raw.text));
    if (!parsed.success) {
      const paths = parsed.error.issues.slice(0, 5).map((issue) => issue.path.join("."));
      // eslint-disable-next-line no-console
      console.error(
        "[candidates] output failed validation",
        JSON.stringify({ provider, model, paths, chars: raw.text.length }),
      );
      return empty("failed", model, "schema_invalid", `candidate output failed validation: ${paths.join(", ")}`);
    }

    const searchQueries = new Map<string, string>();
    const recipes = parsed.data.candidates.map((concept) => {
      const recipe = toRecipe(concept);
      searchQueries.set(recipe.id, concept.search_query);
      return recipe;
    });

    // eslint-disable-next-line no-console
    console.info(
      "[candidates]",
      JSON.stringify({ provider, model, count: recipes.length, attempts: raw.attempts }),
    );

    return {
      recipes,
      searchQueries,
      model,
      usage: raw.usage,
      outcome: "generated",
      failureKind: null,
      error: null,
    };
  } catch (error) {
    // A provider failure used to be swallowed into an empty result, which the
    // rest of the pipeline could not tell apart from "the model had no ideas".
    // Production then looked like stale static recommendations while the
    // provider was failing on every call. It is now typed, logged, and carried
    // to the route.
    const failure = error instanceof AIFailure ? error : classifyProviderError(error);
    // eslint-disable-next-line no-console
    console.error(
      "[candidates] generation failed",
      JSON.stringify({ provider, model, kind: failure.kind, detail: failure.message }),
    );
    return empty("failed", model, failure.kind, failure.message);
  }
}

async function generateWithOpenAI(prompt: string): Promise<RawGeneration> {
  const model = await openAIModelFor("meal_generation");
  const result = await structuredCall({
    model,
    system: SYSTEM,
    prompt,
    schemaName: "meal_candidates",
    schema: candidateJsonSchema as unknown as Record<string, unknown>,
    // Sized from the schema: each candidate is nine fields, roughly 120-160
    // output tokens once the ingredient list and the two prose fields are
    // counted. Fourteen of those is ~2.5k, so 8k leaves room for a long set
    // plus the reasoning allowance without inviting a truncated reply.
    maxOutputTokens: 8000,
    // Proposing a varied set that respects constraints benefits from a little
    // planning. More than "low" buys rumination, not better dinners.
    reasoning: reasoningFor("meal_generation"),
  });
  return { text: result.text, model: result.model, usage: result.usage, attempts: result.attempts };
}

async function generateWithGemini(prompt: string, model: string): Promise<RawGeneration> {
  const response = await generateContent({
    model,
    system: SYSTEM,
    prompt,
    responseSchema: toGeminiSchema(candidateJsonSchema),
    maxOutputTokens: 8000,
    thinkingLevel: thinkingLevelFor("meal_candidate_generation"),
  });
  return {
    text: response.text,
    model: response.model,
    usage: response.usage,
    attempts: response.attempts,
  };
}

/**
 * Compact context. Only what changes the answer goes in the prompt — this runs
 * on every refresh, and every token is billed.
 */
function buildPrompt(
  context: HouseholdContext,
  exclude: string[],
  count: number,
  extra: GenerationContext = {},
): string {
  const payload = {
    meal: context.meal_type,
    kitchen: context.inventory.map((item) => ({
      name: item.name,
      // Status matters: "low" spinach cannot carry a dish built around spinach.
      have: item.status,
      days_left: item.days_to_expiry,
    })),
    use_first: context.use_soon.map((item) => `${item.name} (${item.days_to_expiry}d)`),
    must_respect: {
      vegetarian: context.preferences.vegetarian,
      eggs_ok: context.preferences.eggs_allowed,
      chicken_ok: context.preferences.chicken_allowed,
      allergies: context.preferences.allergies,
      never_include: context.preferences.dislikes,
    },
    tastes: {
      cuisines: context.preferences.preferred_cuisines,
      spice: context.preferences.spice_preference,
      max_minutes: context.preferences.max_cooking_time_minutes,
    },
    targets_remaining_today: context.household.members.map((m) => ({
      name: m.name,
      calories: Math.max(0, Math.round(m.calories_remaining)),
      protein_g: Math.max(0, Math.round(m.protein_remaining)),
    })),
    recently_eaten: context.recent_meals.map((meal) => meal.title),
    do_not_repeat: exclude,
    // What the household has actually done, so the model stops re-proposing
    // dishes it has already been told about and can lean into what landed.
    on_the_plan_this_week: extra.planned ?? [],
    dismissed_before: extra.dismissed ?? [],
    opened_recently: extra.opened ?? [],
    cooked_recently: extra.cooked ?? [],
    // Distributions rather than a list: "you have proposed six Indian curries
    // this week" is actionable in a way that six titles are not.
    recent_mix: extra.distribution ?? {},
    disliked_before: context.feedback
      .filter((entry) => entry.rating === "never")
      .map((entry) => entry.cuisine)
      .filter(Boolean),
  };

  return [
    `Propose ${count} distinct ${context.meal_type} ideas for tonight.`,
    "",
    "Spread them across cuisine, meal_format, protein_source and flavor_profile —",
    "at most two may share any single one of those. Look at recent_mix and",
    "deliberately go where it is thin.",
    "",
    "Household and kitchen:",
    JSON.stringify(payload),
  ].join("\n");
}

/**
 * Turn a concept into the Recipe shape the ranker already understands.
 *
 * Nutrition is computed here, deterministically, from the ingredient list —
 * never taken from the model. The ranker reads calories and protein, so a
 * fabricated number would quietly become a ranking signal; but leaving them at
 * zero is not neutral either, because it guarantees every generated dish loses
 * on nutrition fit and the dynamic layer can never surface anything.
 */
function toRecipe(concept: MealConcept): Recipe {
  const id = `gen-${canonicalRecipeKey(concept.title, concept.cuisine)}`;
  const now = new Date().toISOString();
  const tags = [...new Set(concept.dietary_tags.map((tag) => tag.toLowerCase().trim()))];
  if (concept.protein_intent === "high" && !tags.includes("high_protein")) {
    tags.push("high_protein");
  }

  // Quantities arrive as free text in the same order as the names ("200 g").
  // Stored as the unit string with a parsed amount where one is legible, so a
  // recipe page can show "200 g paneer" rather than "paneer".
  const ingredients = concept.likely_ingredients.map((name, index) => {
    const measure = concept.ingredient_quantities[index]?.trim() ?? "";
    const amount = /^([\d.\/]+)\s*(.*)$/.exec(measure);
    return {
      id: `${id}-ing-${index}`,
      recipe_id: id,
      ingredient_name: name,
      normalized_name: canonicalName(name),
      quantity: amount ? Number(amount[1]) || null : null,
      unit: amount ? (amount[2] || null) : (measure || null),
      optional: false,
    };
  });
  const nutrition = estimateRecipeNutrition(ingredients);

  return {
    id,
    title: concept.title,
    description: concept.description,
    cuisine: concept.cuisine,
    image_url: null,
    prep_time_minutes: 0,
    cook_time_minutes: Math.round(concept.estimated_cook_minutes),
    total_time_minutes: Math.round(concept.estimated_cook_minutes),
    servings: 2,
    calories_per_serving: nutrition.calories_per_serving,
    protein_per_serving: nutrition.protein_per_serving,
    dietary_tags: tags,
    source_type: "generated",
    source_url: null,
    source_name: null,
    video_url: null,
    video_platform: null,
    video_duration_seconds: null,
    video_view_count: null,
    thumbnail_url: null,
    attribution: null,
    source_quality: null,
    discovered_at: null,
    cooking_summary: concept.fit_reason,
    // Written once, here. Nothing downstream regenerates them on view.
    instructions: concept.instructions.map((step) => step.trim()).filter(Boolean),
    ingredients,
    canonical_key: canonicalRecipeKey(concept.title, concept.cuisine),
    times_cooked: 0,
    last_cooked_at: null,
    created_at: now,
  };
}
