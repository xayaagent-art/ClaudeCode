const continentMap = {
  'AF': 'Africa', 'DZ': 'Africa', 'AO': 'Africa', 'BJ': 'Africa', 'BW': 'Africa',
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

  'AQ': 'Antarctica',

  'CN': 'Asia', 'JP': 'Asia', 'KR': 'Asia', 'KP': 'Asia', 'MN': 'Asia',
  'IN': 'Asia', 'PK': 'Asia', 'BD': 'Asia', 'LK': 'Asia', 'NP': 'Asia',
  'BT': 'Asia', 'MM': 'Asia', 'TH': 'Asia', 'VN': 'Asia', 'LA': 'Asia',
  'KH': 'Asia', 'MY': 'Asia', 'SG': 'Asia', 'ID': 'Asia', 'PH': 'Asia',
  'BN': 'Asia', 'TL': 'Asia', 'TW': 'Asia', 'AF': 'Asia', 'IR': 'Asia',
  'IQ': 'Asia', 'SY': 'Asia', 'JO': 'Asia', 'LB': 'Asia', 'IL': 'Asia',
  'PS': 'Asia', 'SA': 'Asia', 'YE': 'Asia', 'OM': 'Asia', 'AE': 'Asia',
  'QA': 'Asia', 'BH': 'Asia', 'KW': 'Asia', 'TR': 'Asia', 'GE': 'Asia',
  'AM': 'Asia', 'AZ': 'Asia', 'KZ': 'Asia', 'UZ': 'Asia', 'TM': 'Asia',
  'TJ': 'Asia', 'KG': 'Asia', 'CY': 'Asia',

  'EU': 'Europe', 'AL': 'Europe', 'AD': 'Europe', 'AT': 'Europe', 'BY': 'Europe',
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

export function getContinent(iso) {
  return continentMap[iso] || 'Unknown'
}

export function getUniqueContinents(isoCodes) {
  const continents = new Set()
  isoCodes.forEach(code => {
    const c = continentMap[code]
    if (c && c !== 'Unknown' && c !== 'Antarctica') continents.add(c)
  })
  return continents.size
}

export const TOTAL_COUNTRIES = 195
