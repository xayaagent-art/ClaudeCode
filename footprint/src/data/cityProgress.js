import { getCities } from './cities'

// City completion → fill-opacity mapping
export function getCityCompletionOpacity(iso, unlockedCities) {
  const cities = getCities(iso)
  if (cities.length === 0) return 0.7 // no city data = mid opacity
  const visited = (unlockedCities[iso] || []).length
  if (visited === 0) return 0.28
  const pct = visited / cities.length
  if (pct <= 0.25) return 0.45
  if (pct <= 0.50) return 0.62
  if (pct <= 0.75) return 0.78
  if (pct < 1.0) return 0.90
  return 1.00
}

export function isFullyExplored(iso, unlockedCities) {
  const cities = getCities(iso)
  if (cities.length === 0) return false
  return (unlockedCities[iso] || []).length >= cities.length
}
