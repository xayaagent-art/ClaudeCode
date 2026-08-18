import { tokenize } from "@/lib/kitchen/match";
import type { Recipe } from "@/lib/types";

/**
 * Ingredient-level dietary detection.
 *
 * Dietary tags are a claim, not evidence. Catalog recipes are tagged by hand
 * and generated ones are tagged by a model, and a model that omits
 * `contains_chicken` from a chicken dish would — if tags were the only check —
 * put chicken in front of a household that does not eat it. So eligibility
 * reads both: the tag if it is there, and the ingredient list always.
 *
 * The matching is token equality, never substring. "Eggplant" is not an egg,
 * "chickpea" is not chicken, "beefsteak tomato" is not beef, and a filter that
 * cannot tell the difference would quietly delete half the vegetarian recipes
 * it exists to protect.
 */

export type AnimalProduct = "chicken" | "red_meat" | "seafood" | "egg";

/**
 * Words that mean the *imitation* of a thing. "Beyond beef" and "vegan chorizo"
 * carry meat words for a product with no meat in it, so a name carrying one of
 * these is never treated as animal-derived.
 */
const IMITATION = new Set([
  "vegan", "vegetarian", "veggie", "plant", "based", "meatless", "mock", "faux",
  "beyond", "impossible", "tofu", "tempeh", "seitan", "soy", "substitute", "alternative",
]);

const TOKENS: Record<AnimalProduct, Set<string>> = {
  chicken: new Set(["chicken", "poultry", "turkey", "duck", "hen", "drumstick"]),
  red_meat: new Set([
    "beef", "pork", "lamb", "mutton", "veal", "venison", "goat", "bacon", "ham",
    "prosciutto", "pancetta", "chorizo", "salami", "pepperoni", "brisket",
    "steak", "meatball", "lard", "gelatin", "keema", "mince",
  ]),
  seafood: new Set([
    "fish", "salmon", "tuna", "cod", "haddock", "tilapia", "trout", "halibut",
    "sardine", "anchovy", "mackerel", "shrimp", "prawn", "crab", "lobster",
    "scallop", "mussel", "oyster", "clam", "squid", "calamari", "octopus", "seafood",
  ]),
  egg: new Set(["egg", "mayonnaise", "mayo", "meringue"]),
};

/**
 * Phrases where a flagged token names something else entirely. Checked against
 * the whole ingredient name, so only these exact products are exempted.
 */
const NOT_ANIMAL = new Set([
  "oyster mushroom", "duck sauce", "crab apple", "lamb lettuce", "lamb ear",
  "fish mint", "beefsteak tomato", "chicken of the wood",
]);

/** Tags a recipe may carry, and what each one actually asserts. */
const TAG_MEANING: Record<string, AnimalProduct> = {
  contains_chicken: "chicken",
  contains_poultry: "chicken",
  contains_beef: "red_meat",
  contains_pork: "red_meat",
  contains_meat: "red_meat",
  contains_fish: "seafood",
  contains_seafood: "seafood",
  contains_eggs: "egg",
  contains_egg: "egg",
};

/** What one ingredient name contains, judged on its words alone. */
export function animalProductsInName(name: string): Set<AnimalProduct> {
  const found = new Set<AnimalProduct>();
  const tokens = tokenize(name);
  if (tokens.length === 0) return found;

  // An imitation product carries the word but not the thing.
  if (tokens.some((token) => IMITATION.has(token))) return found;
  if (NOT_ANIMAL.has(tokens.join(" "))) return found;

  for (const [product, words] of Object.entries(TOKENS) as [AnimalProduct, Set<string>][]) {
    if (tokens.some((token) => words.has(token))) found.add(product);
  }
  return found;
}

/**
 * Everything animal-derived this recipe contains, from its tags and from its
 * ingredients. Either source is enough — they are corroborating evidence, not
 * a vote.
 */
export function animalProductsIn(recipe: Recipe): Set<AnimalProduct> {
  const found = new Set<AnimalProduct>();

  for (const tag of recipe.dietary_tags) {
    const product = TAG_MEANING[tag.toLowerCase().trim()];
    if (product) found.add(product);
  }
  for (const ingredient of recipe.ingredients) {
    for (const product of animalProductsInName(ingredient.ingredient_name)) {
      found.add(product);
    }
  }

  return found;
}
