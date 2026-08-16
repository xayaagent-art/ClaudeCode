import "server-only";
import { z } from "zod";
import { aiEnabled, structuredResponse } from "@/lib/ai/openai";
import { canonicalName } from "@/lib/kitchen/match";
import type { HouseholdContext, Recipe } from "@/lib/types";

/**
 * Recipe discovery beyond the built-in library.
 *
 * Order of preference (see README): catalog → external/adapted → generated.
 * This module covers the last two. Web search is allowed because knowing what a
 * dish actually is beats inventing one, but nothing is reproduced verbatim: the
 * model returns ingredients, metadata and its own concise method, and the
 * source URL is kept and shown.
 */

const discoveredRecipeSchema = z.object({
  title: z.string().min(3),
  description: z.string(),
  cuisine: z.string(),
  prep_time_minutes: z.number().min(0).max(240),
  cook_time_minutes: z.number().min(0).max(240),
  servings: z.number().min(1).max(12),
  calories_per_serving: z.number().min(50).max(2000),
  protein_per_serving: z.number().min(0).max(200),
  dietary_tags: z.array(z.string()),
  source_type: z.enum(["web", "adapted", "generated"]),
  source_url: z.string().nullable(),
  ingredients: z.array(
    z.object({
      ingredient_name: z.string().min(1),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      optional: z.boolean(),
    }),
  ),
  instructions: z.array(z.string().min(4)).min(2).max(12),
});

const discoveryResultSchema = z.object({ recipes: z.array(discoveredRecipeSchema) });

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recipes"],
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title", "description", "cuisine", "prep_time_minutes", "cook_time_minutes",
          "servings", "calories_per_serving", "protein_per_serving", "dietary_tags",
          "source_type", "source_url", "ingredients", "instructions",
        ],
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "One sentence. No marketing copy." },
          cuisine: { type: "string" },
          prep_time_minutes: { type: "number" },
          cook_time_minutes: { type: "number" },
          servings: { type: "number" },
          calories_per_serving: { type: "number" },
          protein_per_serving: { type: "number" },
          dietary_tags: {
            type: "array",
            items: { type: "string" },
            description:
              "Use: vegetarian, vegan, contains_eggs, contains_chicken, gluten_free, high_protein, quick.",
          },
          source_type: { type: "string", enum: ["web", "adapted", "generated"] },
          source_url: { type: ["string", "null"] },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["ingredient_name", "quantity", "unit", "optional"],
              properties: {
                ingredient_name: { type: "string" },
                quantity: { type: ["number", "null"] },
                unit: { type: ["string", "null"] },
                optional: { type: "boolean" },
              },
            },
          },
          instructions: {
            type: "array",
            items: { type: "string" },
            description: "Between 3 and 8 short steps, written in your own words.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You find weeknight dinners for a specific two-person household.

Hard rules:
- Respect every dietary restriction given. They are not preferences.
- Build around the ingredients the household already has. A recipe needing more than two missing ingredients is not useful.
- Prioritise ingredients flagged as needing to be used soon.
- Stay within the household's cooking time where you can.
- Write instructions in your own words as concise home-cooking steps. Never reproduce a source's recipe text verbatim. If you used a source, return its URL in source_url and set source_type to "web" or "adapted".
- Calories and protein are per serving and should be a considered estimate for the ingredient amounts you list.
- Do not repeat any of the recipes listed as recently eaten or already suggested.`;

function toRecipe(input: z.infer<typeof discoveredRecipeSchema>, index: number): Recipe {
  const id = `disc-${Date.now().toString(36)}-${index}`;
  return {
    id,
    title: input.title,
    description: input.description,
    cuisine: input.cuisine,
    image_url: null,
    prep_time_minutes: Math.round(input.prep_time_minutes),
    cook_time_minutes: Math.round(input.cook_time_minutes),
    total_time_minutes: Math.round(input.prep_time_minutes + input.cook_time_minutes),
    servings: Math.round(input.servings),
    calories_per_serving: Math.round(input.calories_per_serving),
    protein_per_serving: Math.round(input.protein_per_serving),
    dietary_tags: input.dietary_tags,
    source_type: input.source_type,
    source_url: input.source_url,
    source_name: input.source_url ? hostOf(input.source_url) : null,
    // A video is attached later by the discovery service, not by the model —
    // asking a model for a video URL invites hallucinated links.
    video_url: null,
    video_platform: null,
    thumbnail_url: null,
    attribution: input.source_url ? `Adapted from ${hostOf(input.source_url)}` : null,
    source_quality: null,
    discovered_at: new Date().toISOString(),
    // Our own summary, which is what we display instead of the source's prose.
    cooking_summary: input.description,
    instructions: input.instructions,
    ingredients: input.ingredients.map((ing, i) => ({
      id: `${id}-ing-${i}`,
      recipe_id: id,
      ingredient_name: ing.ingredient_name,
      normalized_name: canonicalName(ing.ingredient_name),
      quantity: ing.quantity,
      unit: ing.unit,
      optional: ing.optional,
    })),
    created_at: new Date().toISOString(),
  };
}

/** Publisher name for attribution, derived from the URL rather than trusted from the model. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the original source";
  }
}

/**
 * Ask for `count` extra candidates. Returns [] on any failure — discovery is an
 * enhancement, and a recommendation request must never fail because of it.
 */
export async function discoverRecipes(
  context: HouseholdContext,
  count: number,
  excludeTitles: string[],
): Promise<Recipe[]> {
  if (!aiEnabled() || count <= 0) return [];

  const prompt = [
    `Find ${count} ${context.meal_type} options for this household.`,
    "",
    "Household context (JSON):",
    JSON.stringify(
      {
        household: context.household,
        preferences: context.preferences,
        inventory: context.inventory,
        use_soon: context.use_soon,
        recent_meals: context.recent_meals,
        already_suggested: excludeTitles,
      },
      null,
      2,
    ),
  ].join("\n");

  try {
    const raw = await structuredResponse<unknown>({
      system: SYSTEM,
      prompt,
      schemaName: "discovered_recipes",
      schema: jsonSchema as unknown as Record<string, unknown>,
      webSearch: process.env.RECIPE_WEB_SEARCH !== "off",
      maxOutputTokens: 6000,
    });
    const parsed = discoveryResultSchema.safeParse(raw);
    if (!parsed.success) return [];
    return parsed.data.recipes.slice(0, count).map(toRecipe);
  } catch {
    return [];
  }
}
