// Country illustration data: emojis + region gradient
// Top 50 travel countries + fallback

const ILLUSTRATIONS = {
  JP: { emojis: ['\u{1F5FC}','\u{1F338}','\u{1F35C}','\u26E9\uFE0F','\u{1F38E}','\u{1F5FE}'], gradient: 'linear-gradient(135deg, #FF416C, #FF4B2B)' },
  FR: { emojis: ['\u{1F5FC}','\u{1F950}','\u{1F377}','\u{1F3A8}','\u{1F339}','\u{1F956}'], gradient: 'linear-gradient(135deg, #003087, #FFFFFF, #ED2939)' },
  IT: { emojis: ['\u{1F355}','\u{1F6F5}','\u{1F3DB}','\u{1F377}','\u{1F3A8}','\u2693'], gradient: 'linear-gradient(135deg, #009246, #FFFFFF, #CE2B37)' },
  US: { emojis: ['\u{1F5FD}','\u{1F354}','\u{1F3C8}','\u{1F3AC}','\u{1F680}','\u{1F3B8}'], gradient: 'linear-gradient(135deg, #3C3B6E, #B22234)' },
  GB: { emojis: ['\u{1F451}','\u2615','\u{1F3F0}','\u{1F4D6}','\u{1F327}\uFE0F','\u{1F3B5}'], gradient: 'linear-gradient(135deg, #003078, #C8102E)' },
  ES: { emojis: ['\u{1F4C3}','\u{1F1EA}\u{1F1F8}','\u{1F57A}','\u{1F334}','\u2600\uFE0F','\u{1F37A}'], gradient: 'linear-gradient(135deg, #AA151B, #F1BF00)' },
  DE: { emojis: ['\u{1F3F0}','\u{1F37A}','\u{1F697}','\u{1F956}','\u{1F3B6}','\u26BD'], gradient: 'linear-gradient(135deg, #000000, #DD0000, #FFCC00)' },
  BR: { emojis: ['\u{1F3D6}\uFE0F','\u26BD','\u{1F483}','\u{1F99C}','\u2615','\u{1F3B6}'], gradient: 'linear-gradient(135deg, #009C3B, #FFDF00)' },
  AU: { emojis: ['\u{1F998}','\u{1F3C4}','\u{1F40A}','\u{1F3D6}\uFE0F','\u{1F3B8}','\u2600\uFE0F'], gradient: 'linear-gradient(135deg, #002868, #FFD100)' },
  TH: { emojis: ['\u{1F6D5}','\u{1F334}','\u{1F418}','\u{1F35C}','\u{1F3D6}\uFE0F','\u{1F64F}'], gradient: 'linear-gradient(135deg, #A51931, #F4F5F8, #2D2A4A)' },
  MX: { emojis: ['\u{1F336}\uFE0F','\u{1F3DC}\uFE0F','\u{1F32E}','\u{1F480}','\u{1F3B8}','\u{1F334}'], gradient: 'linear-gradient(135deg, #006847, #CE1126)' },
  IN: { emojis: ['\u{1F54C}','\u{1F418}','\u{1F336}\uFE0F','\u{1F3CF}','\u{1FA94}','\u{1F3A8}'], gradient: 'linear-gradient(135deg, #FF9933, #FFFFFF, #138808)' },
  CN: { emojis: ['\u{1F409}','\u{1F962}','\u{1F3EF}','\u{1F3D4}\uFE0F','\u{1F9E7}','\u{1F375}'], gradient: 'linear-gradient(135deg, #DE2910, #FFDE00)' },
  GR: { emojis: ['\u{1F3DB}','\u2600\uFE0F','\u{1F3D6}\uFE0F','\u{1F347}','\u26F5','\u{1F95A}'], gradient: 'linear-gradient(135deg, #0D5EAF, #FFFFFF)' },
  TR: { emojis: ['\u{1F54C}','\u{1F9CB}','\u{1F388}','\u{1F3DC}\uFE0F','\u{1F95F}','\u{1F48E}'], gradient: 'linear-gradient(135deg, #E30A17, #FFFFFF)' },
  EG: { emojis: ['\u{1F3DC}\uFE0F','\u{1F42A}','\u{1F3DB}','\u2600\uFE0F','\u{1F4D6}','\u{1FA94}'], gradient: 'linear-gradient(135deg, #C09300, #CE1126, #000000)' },
  KR: { emojis: ['\u{1F3AE}','\u{1F35C}','\u{1F3B6}','\u{1F338}','\u{1F3EF}','\u{1F4F1}'], gradient: 'linear-gradient(135deg, #003478, #C60C30)' },
  PT: { emojis: ['\u{1F6A2}','\u{1F377}','\u{1F3D6}\uFE0F','\u{1F3B6}','\u2600\uFE0F','\u{1F370}'], gradient: 'linear-gradient(135deg, #006600, #FF0000)' },
  NZ: { emojis: ['\u{1F40F}','\u{1F3D4}\uFE0F','\u{1F3C4}','\u{1F33F}','\u{1F419}','\u{1F30B}'], gradient: 'linear-gradient(135deg, #00247D, #FFFFFF)' },
  MA: { emojis: ['\u{1F3DC}\uFE0F','\u{1F375}','\u{1F54C}','\u{1F42A}','\u{1F48E}','\u{1F3A8}'], gradient: 'linear-gradient(135deg, #C1272D, #006233)' },
  VN: { emojis: ['\u{1F35C}','\u{1F6F5}','\u{1F33E}','\u{1F3EE}','\u26F5','\u{1F334}'], gradient: 'linear-gradient(135deg, #DA251D, #FFCD00)' },
  PE: { emojis: ['\u{1F3D4}\uFE0F','\u{1F999}','\u{1F3DB}','\u{1F33D}','\u{1F3B6}','\u2600\uFE0F'], gradient: 'linear-gradient(135deg, #D91023, #FFFFFF)' },
  AR: { emojis: ['\u{1F57A}','\u{1F969}','\u26BD','\u{1F377}','\u{1F3D4}\uFE0F','\u{1F9C9}'], gradient: 'linear-gradient(135deg, #74ACDF, #FFFFFF, #F6B40E)' },
  ZA: { emojis: ['\u{1F981}','\u{1F3D6}\uFE0F','\u{1F418}','\u{1F304}','\u{1F347}','\u{1F30D}'], gradient: 'linear-gradient(135deg, #007749, #FFB81C, #DE3831)' },
  CO: { emojis: ['\u2615','\u{1F483}','\u{1F3D6}\uFE0F','\u{1F99C}','\u{1F3B6}','\u{1F30B}'], gradient: 'linear-gradient(135deg, #FCD116, #003893, #CE1126)' },
  HR: { emojis: ['\u{1F3F0}','\u26F5','\u{1F3D6}\uFE0F','\u{1F377}','\u2600\uFE0F','\u{1F41A}'], gradient: 'linear-gradient(135deg, #FF0000, #FFFFFF, #171796)' },
  ID: { emojis: ['\u{1F334}','\u{1F3D6}\uFE0F','\u{1F30B}','\u{1F412}','\u{1F3B6}','\u{1F33E}'], gradient: 'linear-gradient(135deg, #FF0000, #FFFFFF)' },
  CR: { emojis: ['\u{1F99C}','\u{1F334}','\u{1F30B}','\u{1F3D6}\uFE0F','\u{1F438}','\u2615'], gradient: 'linear-gradient(135deg, #002B7F, #CE1126, #FFFFFF)' },
  IS: { emojis: ['\u{1F30B}','\u{1F40B}','\u2744\uFE0F','\u{1F3D4}\uFE0F','\u{1F30A}','\u2668\uFE0F'], gradient: 'linear-gradient(135deg, #003897, #D72828)' },
  CL: { emojis: ['\u{1F3D4}\uFE0F','\u{1F377}','\u{1F3DC}\uFE0F','\u{1F427}','\u{1F30B}','\u2600\uFE0F'], gradient: 'linear-gradient(135deg, #D52B1E, #FFFFFF, #0039A6)' },
  CA: { emojis: ['\u{1F341}','\u{1F3D4}\uFE0F','\u{1F43B}','\u{1F3D2}','\u2744\uFE0F','\u{1F95E}'], gradient: 'linear-gradient(135deg, #FF0000, #FFFFFF)' },
  IE: { emojis: ['\u2618\uFE0F','\u{1F37A}','\u{1F3F0}','\u{1F411}','\u{1F3B6}','\u{1F327}\uFE0F'], gradient: 'linear-gradient(135deg, #169B62, #FFFFFF, #FF883E)' },
  SE: { emojis: ['\u{1F3D4}\uFE0F','\u{1F9CA}','\u{1F3B6}','\u{1F33F}','\u{1F3A8}','\u2600\uFE0F'], gradient: 'linear-gradient(135deg, #006AA7, #FECC00)' },
  NO: { emojis: ['\u{1F3D4}\uFE0F','\u{1F40B}','\u{1F30A}','\u{1F3BF}','\u{1F41F}','\u2744\uFE0F'], gradient: 'linear-gradient(135deg, #EF2B2D, #002868)' },
  NL: { emojis: ['\u{1F337}','\u{1F6B2}','\u{1F9C0}','\u{1F3A8}','\u{1F32C}\uFE0F','\u26F5'], gradient: 'linear-gradient(135deg, #AE1C28, #FFFFFF, #21468B)' },
  AT: { emojis: ['\u{1F3B6}','\u{1F3D4}\uFE0F','\u{1F370}','\u{1F3F0}','\u{1F3BF}','\u{1F3BB}'], gradient: 'linear-gradient(135deg, #ED2939, #FFFFFF)' },
  CH: { emojis: ['\u{1F3D4}\uFE0F','\u{1F36B}','\u{1F9C0}','\u23F0','\u{1F3BF}','\u{1F6A0}'], gradient: 'linear-gradient(135deg, #FF0000, #FFFFFF)' },
  CZ: { emojis: ['\u{1F37A}','\u{1F3F0}','\u{1F3AD}','\u{1F3B6}','\u{1F3D7}\uFE0F','\u{1F956}'], gradient: 'linear-gradient(135deg, #D7141A, #11457E)' },
  PL: { emojis: ['\u{1F3F0}','\u{1F95F}','\u{1F3B6}','\u{1F4D6}','\u{1F3AD}','\u{1F33F}'], gradient: 'linear-gradient(135deg, #FFFFFF, #DC143C)' },
  HU: { emojis: ['\u2668\uFE0F','\u{1F336}\uFE0F','\u{1F3DB}','\u{1F3B6}','\u{1F377}','\u{1F370}'], gradient: 'linear-gradient(135deg, #CE2939, #FFFFFF, #477050)' },
  RU: { emojis: ['\u{1F3F0}','\u2744\uFE0F','\u{1FA86}','\u{1F3B6}','\u{1F43B}','\u{1F375}'], gradient: 'linear-gradient(135deg, #FFFFFF, #0039A6, #D52B1E)' },
  KE: { emojis: ['\u{1F981}','\u{1F418}','\u{1F304}','\u{1F33F}','\u{1F3C3}','\u2615'], gradient: 'linear-gradient(135deg, #006600, #BB0000, #000000)' },
  TZ: { emojis: ['\u{1F3D4}\uFE0F','\u{1F981}','\u{1F3D6}\uFE0F','\u{1F992}','\u{1F304}','\u{1F33F}'], gradient: 'linear-gradient(135deg, #1EB53A, #00A3DD, #FCD116)' },
  SG: { emojis: ['\u{1F3D9}\uFE0F','\u{1F35C}','\u{1F334}','\u{1F6F3}\uFE0F','\u{1F3AE}','\u{1F3ED}'], gradient: 'linear-gradient(135deg, #EE2536, #FFFFFF)' },
  AE: { emojis: ['\u{1F3D9}\uFE0F','\u{1F3DC}\uFE0F','\u{1F42A}','\u{1F6CD}\uFE0F','\u{1F30D}','\u2600\uFE0F'], gradient: 'linear-gradient(135deg, #00732F, #FF0000, #000000)' },
  IL: { emojis: ['\u{1F54D}','\u{1F3D6}\uFE0F','\u{1F4D6}','\u{1F954}','\u2600\uFE0F','\u{1F4BB}'], gradient: 'linear-gradient(135deg, #003399, #FFFFFF)' },
  JO: { emojis: ['\u{1F3DC}\uFE0F','\u{1F3DB}','\u{1F375}','\u{1F42A}','\u{1F54C}','\u2B50'], gradient: 'linear-gradient(135deg, #007A3D, #CE1126, #000000)' },
  CU: { emojis: ['\u{1F3B6}','\u{1F697}','\u{1F483}','\u{1F370}','\u{1F3D6}\uFE0F','\u{1F37A}'], gradient: 'linear-gradient(135deg, #002A8F, #CB1515)' },
  PH: { emojis: ['\u{1F3D6}\uFE0F','\u{1F334}','\u{1F3A4}','\u{1F35A}','\u{1F6F6}','\u{1F31E}'], gradient: 'linear-gradient(135deg, #0038A8, #CE1126, #FCD116)' },
  MY: { emojis: ['\u{1F3D9}\uFE0F','\u{1F334}','\u{1F35C}','\u{1F54C}','\u{1F412}','\u{1F3D6}\uFE0F'], gradient: 'linear-gradient(135deg, #CC0000, #003478)' },
}

const REGION_GRADIENTS = {
  Asia: 'linear-gradient(135deg, #FF6B6B 0%, #FFA500 50%, #FFD700 100%)',
  Europe: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'North America': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  'South America': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  Africa: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  Oceania: 'linear-gradient(135deg, #2196F3 0%, #00BCD4 100%)',
}

export function getIllustration(iso, continent) {
  const data = ILLUSTRATIONS[iso]
  return {
    emojis: data?.emojis || ['\u{1F30D}', '\u2708\uFE0F', '\u{1F9F3}', '\u{1F4F7}'],
    gradient: data?.gradient || REGION_GRADIENTS[continent] || REGION_GRADIENTS.Asia,
  }
}

export { REGION_GRADIENTS }
