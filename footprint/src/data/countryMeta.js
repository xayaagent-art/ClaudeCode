const continentMap = {
  'AF': 'Asia', 'DZ': 'Africa', 'AO': 'Africa', 'BJ': 'Africa', 'BW': 'Africa',
  'BF': 'Africa', 'BI': 'Africa', 'CV': 'Africa', 'CM': 'Africa', 'CF': 'Africa',
  'TD': 'Africa', 'KM': 'Africa', 'CG': 'Africa', 'CD': 'Africa', 'CI': 'Africa',
  'DJ': 'Africa', 'EG': 'Africa', 'GQ': 'Africa', 'ER': 'Africa', 'SZ': 'Africa',
  'ET': 'Africa', 'GA': 'Africa', 'GM': 'Africa', 'GH': 'Africa', 'GN': 'Africa',
  'GW': 'Africa', 'KE': 'Africa', 'LS': 'Africa', 'LR': 'Africa', 'LY': 'Africa',
  'MG': 'Africa', 'MW': 'Africa', 'ML': 'Africa', 'MR': 'Africa', 'MU': 'Africa',
  'MA': 'Africa', 'MZ': 'Africa', 'NA': 'Africa', 'NE': 'Africa', 'NG': 'Africa',
  'RW': 'Africa', 'ST': 'Africa', 'SN': 'Africa', 'SC': 'Africa', 'SL': 'Africa',
  'SO': 'Africa', 'ZA': 'Africa', 'SS': 'Africa', 'SD': 'Africa', 'TZ': 'Africa',
  'TG': 'Africa', 'TN': 'Africa', 'UG': 'Africa', 'ZM': 'Africa', 'ZW': 'Africa',
  'EH': 'Africa',
  'CN': 'Asia', 'JP': 'Asia', 'KR': 'Asia', 'KP': 'Asia', 'MN': 'Asia',
  'IN': 'Asia', 'PK': 'Asia', 'BD': 'Asia', 'LK': 'Asia', 'NP': 'Asia',
  'BT': 'Asia', 'MM': 'Asia', 'TH': 'Asia', 'VN': 'Asia', 'LA': 'Asia',
  'KH': 'Asia', 'MY': 'Asia', 'SG': 'Asia', 'ID': 'Asia', 'PH': 'Asia',
  'BN': 'Asia', 'TL': 'Asia', 'TW': 'Asia', 'IR': 'Asia',
  'IQ': 'Asia', 'SY': 'Asia', 'JO': 'Asia', 'LB': 'Asia', 'IL': 'Asia',
  'PS': 'Asia', 'SA': 'Asia', 'YE': 'Asia', 'OM': 'Asia', 'AE': 'Asia',
  'QA': 'Asia', 'BH': 'Asia', 'KW': 'Asia', 'TR': 'Asia', 'GE': 'Asia',
  'AM': 'Asia', 'AZ': 'Asia', 'KZ': 'Asia', 'UZ': 'Asia', 'TM': 'Asia',
  'TJ': 'Asia', 'KG': 'Asia', 'CY': 'Asia',
  'AL': 'Europe', 'AD': 'Europe', 'AT': 'Europe', 'BY': 'Europe',
  'BE': 'Europe', 'BA': 'Europe', 'BG': 'Europe', 'HR': 'Europe', 'CZ': 'Europe',
  'DK': 'Europe', 'EE': 'Europe', 'FI': 'Europe', 'FR': 'Europe', 'DE': 'Europe',
  'GR': 'Europe', 'HU': 'Europe', 'IS': 'Europe', 'IE': 'Europe', 'IT': 'Europe',
  'XK': 'Europe', 'LV': 'Europe', 'LT': 'Europe', 'LU': 'Europe', 'MT': 'Europe',
  'MD': 'Europe', 'ME': 'Europe', 'NL': 'Europe', 'MK': 'Europe', 'NO': 'Europe',
  'PL': 'Europe', 'PT': 'Europe', 'RO': 'Europe', 'RU': 'Europe', 'RS': 'Europe',
  'SK': 'Europe', 'SI': 'Europe', 'ES': 'Europe', 'SE': 'Europe', 'CH': 'Europe',
  'UA': 'Europe', 'GB': 'Europe',
  'US': 'North America', 'CA': 'North America', 'MX': 'North America',
  'GT': 'North America', 'BZ': 'North America', 'HN': 'North America',
  'SV': 'North America', 'NI': 'North America', 'CR': 'North America',
  'PA': 'North America', 'CU': 'North America', 'JM': 'North America',
  'HT': 'North America', 'DO': 'North America', 'PR': 'North America',
  'TT': 'North America', 'BS': 'North America', 'BB': 'North America',
  'GL': 'North America',
  'AU': 'Oceania', 'NZ': 'Oceania', 'PG': 'Oceania', 'FJ': 'Oceania',
  'SB': 'Oceania', 'VU': 'Oceania', 'NC': 'Oceania',
  'BR': 'South America', 'AR': 'South America', 'CL': 'South America',
  'CO': 'South America', 'PE': 'South America', 'VE': 'South America',
  'EC': 'South America', 'BO': 'South America', 'PY': 'South America',
  'UY': 'South America', 'GY': 'South America', 'SR': 'South America',
  'GF': 'South America', 'FK': 'South America',
}

export const CONTINENT_TOTALS = {
  'Africa': 54, 'Asia': 48, 'Europe': 44,
  'North America': 23, 'South America': 12, 'Oceania': 14,
}

export function getContinent(iso) {
  return continentMap[iso] || 'Unknown'
}

export function getUniqueContinents(isoCodes) {
  const continents = new Set()
  isoCodes.forEach(code => {
    const c = continentMap[code]
    if (c && c !== 'Unknown') continents.add(c)
  })
  return continents.size
}

export function getContinentBreakdown(isoCodes) {
  const counts = {}
  for (const cont of Object.keys(CONTINENT_TOTALS)) counts[cont] = 0
  isoCodes.forEach(code => {
    const c = continentMap[code]
    if (c && counts[c] !== undefined) counts[c]++
  })
  return counts
}

export function isoToFlag(iso) {
  if (!iso || iso.length !== 2) return '\u{1F3F3}\uFE0F'
  const codePoints = [...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...codePoints)
}

export const TOTAL_COUNTRIES = 195

export const RANKS = [
  { name: 'Homebody', min: 0, emoji: '\u{1F3E0}' },
  { name: 'Wanderer', min: 5, emoji: '\u{1F392}' },
  { name: 'Explorer', min: 15, emoji: '\u{1F5FA}\uFE0F' },
  { name: 'Globetrotter', min: 30, emoji: '\u2708\uFE0F' },
  { name: 'World Citizen', min: 60, emoji: '\u{1F30D}' },
  { name: 'Legend', min: 100, emoji: '\u2B50' },
]

export function getRank(count) {
  let rank = RANKS[0]
  for (const r of RANKS) {
    if (count >= r.min) rank = r
  }
  return rank
}

export function getNextRank(count) {
  for (const r of RANKS) {
    if (count < r.min) return r
  }
  return null
}
