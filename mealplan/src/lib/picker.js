// Weighted random pick: recipes not made/suggested recently get heavier
// weights; frequently-suggested ones get a mild penalty.
function weightOf(r, now) {
  const last = Math.max(r.lastMade || 0, r.lastPicked || 0)
  const days = last ? (now - last) / 86400000 : 30
  const freshness = 1 + Math.min(Math.max(days, 0), 30) // 1..31
  return freshness / (1 + (r.timesPicked || 0) * 0.25)
}

export function weightedPick(recipes, excludeId = null) {
  let pool = recipes
  if (excludeId != null && recipes.length > 1) {
    pool = recipes.filter((r) => r.id !== excludeId)
  }
  if (!pool.length) return null
  const now = Date.now()
  const weights = pool.map((r) => weightOf(r, now))
  let t = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i]
    if (t <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}
