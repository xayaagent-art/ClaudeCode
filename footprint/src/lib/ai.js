// Poetic country descriptions via Anthropic API (claude-haiku)
// Falls back to null if API key not set or request fails

const FALLBACK_DESCRIPTIONS = {
  JP: 'Cherry blossoms falling on ancient temples where tradition dances with neon-lit tomorrows.',
  FR: 'Cobblestone streets that smell of fresh bread and centuries of art hanging in golden light.',
  IT: 'Sun-warmed stone villages where every meal is a love letter and every view a painting.',
  US: 'A continent disguised as a country, where every state holds a different dream.',
  GB: 'Misty hills and literary ghosts, where afternoon tea is a sacred ceremony.',
  BR: 'Rhythms pulse through jungle and city alike, a kaleidoscope of life in endless summer.',
  IN: 'Spice-scented chaos and quiet temple bells, a billion stories woven in silk and dust.',
  AU: 'Red earth meets turquoise reef under a sky so vast it forgets to end.',
  MX: 'Ancient pyramids guard the secrets of lands where every fiesta colors the soul.',
  TH: 'Golden spires rising from emerald jungles, where every smile is an invitation home.',
  EG: 'Sand-swept monuments stand as love letters from pharaohs to eternity.',
  GR: 'White-washed islands floating on wine-dark seas, where myths were born at sunrise.',
  ES: 'Flamenco rhythms echo through sun-baked plazas where life begins after midnight.',
  DE: 'Forest paths and fairy-tale castles beside cities that reinvent themselves with every decade.',
  CA: 'Endless wilderness kissed by northern lights, where kindness is a national language.',
  NZ: 'Emerald valleys carved by glaciers, where adventure waits behind every mountain turn.',
  PE: 'Cloud-wrapped ruins perched above sacred valleys where the Andes touch the sky.',
  MA: 'Labyrinthine souks filled with saffron and stories, under mosaics that hold the desert sun.',
  IS: 'Fire and ice dance together on an island where waterfalls outnumber traffic lights.',
  KR: 'Neon-bright cities with ancient palace hearts, where K-pop meets temple morning bells.',
  TR: 'Where two continents embrace across a strait, and every bazaar tells a thousand-year tale.',
  PT: 'Fado melodies drift from tiled alleyways to sun-drenched coasts where explorers once sailed.',
  VN: 'Lantern-lit rivers and misty limestone peaks, where motorbike symphonies score every dawn.',
  AR: 'Tango-haunted streets leading to the wild edge of the world, where glaciers calve into silence.',
  ZA: 'Rainbow nation where savannas meet coastlines and Table Mountain guards a city of dreams.',
  CO: 'Emerald mountains and Caribbean coasts, where salsa rhythms heal everything.',
  HR: 'Medieval walls rising from sapphire seas, a storybook backdrop that feels impossibly real.',
  CH: 'Clockwork precision meets alpine wildness, where chocolate rivers could actually exist.',
  SE: 'Midnight sun and northern lights bookend seasons of crystalline lakes and forest calm.',
  NO: 'Fjords carved by giants, where the aurora dances over fishing villages frozen in time.',
}

export async function getCountryDescription(countryName, iso) {
  // Check fallback first
  if (FALLBACK_DESCRIPTIONS[iso]) {
    return FALLBACK_DESCRIPTIONS[iso]
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: 'You write beautiful, poetic one-sentence descriptions of countries for a travel app. Warm, evocative, 20 words max. No quotes.',
        messages: [{ role: 'user', content: `Write a poetic one-line description for ${countryName}` }],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    return data.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}
