import { normalize } from './store'

export const pantrySetOf = (pantry) => new Set(pantry.map(normalize))

// { total, have, missing: [names] } for a recipe against the pantry
export function matchRecipe(recipe, pantrySet) {
  const ingredients = recipe.ingredients.filter((i) => normalize(i.name))
  const missing = ingredients
    .filter((i) => !pantrySet.has(normalize(i.name)))
    .map((i) => i.name.trim())
  return {
    total: ingredients.length,
    have: ingredients.length - missing.length,
    missing,
  }
}
