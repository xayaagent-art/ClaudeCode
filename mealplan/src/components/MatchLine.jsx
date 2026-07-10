import { matchRecipe } from '../lib/match'

// "8/9 ON HAND — MISSING: HEAVY CREAM" indicator; hidden until the
// pantry has at least one item (no data, no noise).
export default function MatchLine({ recipe, pantrySet, pantryCount }) {
  if (!pantryCount) return null
  const { total, have, missing } = matchRecipe(recipe, pantrySet)
  if (!total) return null
  if (!missing.length) {
    return <p className="micro">✓ {have}/{total} — All on hand</p>
  }
  return (
    <p className="micro text-ink/55">
      {have}/{total} on hand — missing: {missing.join(', ')}
    </p>
  )
}
