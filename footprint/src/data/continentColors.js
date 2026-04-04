export const CONTINENT_COLORS = {
  'Europe': '#C44B6E',
  'Asia': '#2E8B7A',
  'North America': '#C8883A',
  'South America': '#B87333',
  'Africa': '#C67B3A',
  'Oceania': '#4A7FB5',
  'Antarctica': '#8B7AB5',
}

export function getContinentColor(continent) {
  return CONTINENT_COLORS[continent] || '#717171'
}
