import type { Recipe } from "@/lib/types";

/**
 * What kind of dinner a dish is, along the axes a person actually notices.
 *
 * "Three different meals" that are all a bowl of spinach and paneer over rice
 * is the complaint this exists to answer, and cuisine alone cannot catch it:
 * a Palak Paneer, a paneer rice bowl and a spinach-paneer curry are three
 * cuisines' worth of naming over one dinner. Format, protein and flavour are
 * the axes that separate them.
 *
 * Everything here is derived deterministically from the recipe itself rather
 * than asked of the model, so the same dish always classifies the same way and
 * a diversity rule can be tested without a network call. The model is *also*
 * asked to declare these (see candidates.ts) — the declaration is a hint for
 * generation, this is the arbiter for selection.
 */

export type MealFormat =
  | "bowl" | "wrap" | "curry" | "pasta" | "tacos" | "stir-fry" | "salad"
  | "sandwich" | "skillet" | "sheet-pan" | "rice dish" | "soup/stew"
  | "bake" | "pizza" | "other";

export type ProteinSource =
  | "paneer" | "chickpea" | "lentil" | "bean" | "tofu" | "egg" | "chicken"
  | "fish" | "yogurt" | "cheese" | "nut" | "grain" | "vegetable";

export type FlavorProfile =
  | "indian-spiced" | "mediterranean" | "east-asian" | "latin" | "middle-eastern"
  | "creamy" | "fresh-herby" | "smoky" | "other";

/**
 * Ordered most specific first: a "chana masala curry" is a curry, and a
 * "burrito bowl" is a bowl rather than a wrap. First match wins, so the
 * sequence encodes the precedence rather than a pile of special cases.
 */
const FORMAT_PATTERNS: [MealFormat, RegExp][] = [
  ["sheet-pan", /\b(sheet[- ]?pan|tray[- ]?bake|roasting tin)s?\b/],
  ["stir-fry", /\b(stir[- ]?fr(y|ied)|fried rice|chow mein|lo mein|noodle stir)s?\b/],
  ["tacos", /\b(taco|tostada|quesadilla|enchilada|chilaquile)s?\b/],
  ["wrap", /\b(wrap|burrito|roll[- ]?up|shawarma|kathi|frankie|gyro)s?\b/],
  ["sandwich", /\b(sandwich|burger|sub|panini|toastie|bruschetta|toast)s?\b/],
  ["pizza", /\b(pizza|flatbread|focaccia)s?\b/],
  ["pasta", /\b(pasta|penne|spaghetti|linguine|fusilli|macaroni|lasagne|lasagna|orzo|gnocchi|noodle soup)s?\b/],
  ["soup/stew", /\b(soup|stew|chowder|broth|ramen|pho|chili|chilli|cassoulet)s?\b/],
  ["curry", /\b(curry|masala|korma|tikka|dal|daal|dhal|saag|sabzi|kadai|vindaloo|rogan|tagine)s?\b/],
  ["salad", /\b(salad|slaw|tabbouleh|panzanella)s?\b/],
  ["bowl", /\b(bowl|buddha|poke)s?\b/],
  ["rice dish", /\b(rice|biryani|pilaf|pulao|risotto|paella|jollof|congee|mujadara|gallo pinto)s?\b/],
  ["bake", /\b(bake|baked|gratin|casserole|lasagne|pie|frittata|quiche|shakshuka)s?\b/],
  ["skillet", /\b(skillet|pan[- ]?fried|saut[eé]|hash|scramble|omelette|omelet)s?\b/],
];

/** Protein sources, most defining first — paneer beats the yogurt beside it. */
const PROTEIN_PATTERNS: [ProteinSource, RegExp][] = [
  ["paneer", /\bpaneer\b/],
  ["tofu", /\b(tofu|tempeh|edamame)s?\b/],
  ["chicken", /\bchicken\b/],
  ["fish", /\b(fish|salmon|tuna|cod|prawn|shrimp)s?\b/],
  ["chickpea", /\b(chickpea|chana|garbanzo|hummus|falafel)s?\b/],
  ["lentil", /\b(lentil|dal|daal|dhal|masoor|toor|moong)s?\b/],
  ["bean", /\b(bean|rajma|kidney|black bean|pinto|cannellini)s?\b/],
  ["egg", /\b(egg|omelette|omelet|shakshuka|frittata)s?\b/],
  ["cheese", /\b(cheese|feta|halloumi|mozzarella|ricotta|cheddar)s?\b/],
  ["yogurt", /\b(yogurt|yoghurt|raita|tzatziki|curd)s?\b/],
  ["nut", /\b(peanut|cashew|almond|walnut|tahini|sesame)s?\b/],
  ["grain", /\b(quinoa|farro|barley|couscous|bulgur|oat)s?\b/],
];

const FLAVOR_PATTERNS: [FlavorProfile, RegExp][] = [
  ["indian-spiced", /\b(indian|masala|tikka|curry|dal|daal|saag|tandoori|biryani|garam|paneer|punjabi|south indian)s?\b/],
  ["middle-eastern", /\b(shawarma|falafel|tahini|harissa|zaatar|za'atar|tagine|lebanese|turkish|persian|mujadara|hummus)s?\b/],
  ["east-asian", /\b(chinese|japanese|korean|thai|vietnamese|teriyaki|miso|gochujang|soy|sesame|ramen|pho|stir[- ]?fry)s?\b/],
  ["latin", /\b(mexican|taco|burrito|enchilada|chipotle|salsa|cilantro|peruvian|brazilian|chilaquile|gallo pinto)s?\b/],
  ["mediterranean", /\b(greek|italian|spanish|mediterranean|feta|olive|pesto|caprese|tzatziki)s?\b/],
  ["smoky", /\b(smok|charred|grilled|barbecue|bbq|paprika)s?\b/],
  ["creamy", /\b(cream|creamy|alfredo|korma|coconut milk|cheesy)s?\b/],
  ["fresh-herby", /\b(herb|lemon|fresh|mint|basil|coriander|parsley|citrus)s?\b/],
];

function haystackFor(recipe: Recipe): string {
  const ingredients = recipe.ingredients.map((i) => i.normalized_name).join(" ");
  return `${recipe.title} ${recipe.description} ${recipe.cuisine} ${ingredients}`.toLowerCase();
}

export function mealFormat(recipe: Recipe): MealFormat {
  // Title and description decide the format — an ingredient list mentioning
  // rice does not make a curry a rice dish.
  const stated = `${recipe.title} ${recipe.description}`.toLowerCase();
  for (const [format, pattern] of FORMAT_PATTERNS) {
    if (pattern.test(stated)) return format;
  }
  return "other";
}

export function proteinSource(recipe: Recipe): ProteinSource {
  const haystack = haystackFor(recipe);
  for (const [protein, pattern] of PROTEIN_PATTERNS) {
    if (pattern.test(haystack)) return protein;
  }
  return "vegetable";
}

export function flavorProfile(recipe: Recipe): FlavorProfile {
  const haystack = haystackFor(recipe);
  for (const [flavor, pattern] of FLAVOR_PATTERNS) {
    if (pattern.test(haystack)) return flavor;
  }
  return "other";
}

export interface DishAxes {
  format: MealFormat;
  protein: ProteinSource;
  flavor: FlavorProfile;
  cuisine: string;
}

export function dishAxes(recipe: Recipe): DishAxes {
  return {
    format: mealFormat(recipe),
    protein: proteinSource(recipe),
    flavor: flavorProfile(recipe),
    cuisine: recipe.cuisine.toLowerCase().trim(),
  };
}

/**
 * How many axes two dishes share, 0-4. Four means the same kind of dinner in
 * every respect that matters, whatever the titles say.
 */
export function sharedAxes(a: DishAxes, b: DishAxes): number {
  return (
    (a.format === b.format ? 1 : 0) +
    (a.protein === b.protein ? 1 : 0) +
    (a.flavor === b.flavor ? 1 : 0) +
    (a.cuisine === b.cuisine ? 1 : 0)
  );
}

/**
 * Choose a set that is varied along all four axes, without shuffling.
 *
 * Walks candidates in ranked order and takes the best one that does not
 * over-repeat an axis already used. Given the same ranked input this always
 * returns the same set, which is what keeps a regeneration explainable — the
 * variety comes from the ordering rules, never from randomness.
 *
 * `maxPerAxis` is the number of picks allowed to share any single axis value.
 * The caps loosen only if the pool cannot fill the set, because showing two
 * similar dinners beats showing two.
 */
export function selectDiverse<T extends { recipe: Recipe }>(
  entries: T[],
  count: number,
  maxPerAxis = 2,
): T[] {
  if (entries.length <= count) return entries.slice(0, count);

  const chosen: T[] = [];
  const used = {
    format: new Map<string, number>(),
    protein: new Map<string, number>(),
    flavor: new Map<string, number>(),
    cuisine: new Map<string, number>(),
  };

  const fits = (axes: DishAxes, cap: number): boolean =>
    (used.format.get(axes.format) ?? 0) < cap &&
    (used.protein.get(axes.protein) ?? 0) < cap &&
    (used.flavor.get(axes.flavor) ?? 0) < cap &&
    (used.cuisine.get(axes.cuisine) ?? 0) < cap;

  const take = (entry: T, axes: DishAxes) => {
    chosen.push(entry);
    used.format.set(axes.format, (used.format.get(axes.format) ?? 0) + 1);
    used.protein.set(axes.protein, (used.protein.get(axes.protein) ?? 0) + 1);
    used.flavor.set(axes.flavor, (used.flavor.get(axes.flavor) ?? 0) + 1);
    used.cuisine.set(axes.cuisine, (used.cuisine.get(axes.cuisine) ?? 0) + 1);
  };

  // Strictest pass first: at most one dish per axis value. Then loosen, so a
  // thin pool degrades to "as varied as it can be" rather than to nothing.
  for (let cap = 1; cap <= Math.max(maxPerAxis, 1) && chosen.length < count; cap += 1) {
    for (const entry of entries) {
      if (chosen.length >= count) break;
      if (chosen.includes(entry)) continue;
      const axes = dishAxes(entry.recipe);
      if (!fits(axes, cap)) continue;
      take(entry, axes);
    }
  }

  // Backfill strictly by rank if the caps could not fill the set.
  for (const entry of entries) {
    if (chosen.length >= count) break;
    if (!chosen.includes(entry)) chosen.push(entry);
  }

  return chosen.slice(0, count);
}
