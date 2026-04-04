export const CONTINENT_COLORS = {
  'Europe': '#E8445A',
  'Asia': '#00968A',
  'North America': '#F5A623',
  'South America': '#F5A623',
  'Africa': '#E8703A',
  'Oceania': '#4A90D9',
  'Antarctica': '#9B59B6',
}

export function getContinentColor(continent) {
  return CONTINENT_COLORS[continent] || '#717171'
}
