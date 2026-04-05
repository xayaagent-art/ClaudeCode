# Footprint — Travel Map App

## Tech Stack

- React + Vite
- Mapbox GL JS (light-v11 base, globe projection)
- Framer Motion (spring physics)
- Tailwind CSS
- canvas-confetti for unlock celebrations
- html2canvas for share screenshots (lazy-loaded)
- localStorage for persistence

## Design Language — "Tactile Cartography"

Premium travel journal. Warm, human, editorial.

- OKLCH color space for all CSS variables
- Warm white surfaces (oklch(97% 0.008 60))
- Plus Jakarta Sans (UI) + Fraunces (display)
- Brand: oklch(62% 0.22 25) (rausch), oklch(55% 0.15 185) (teal)
- Continent colors in OKLCH for perceptual uniformity
- Reusable component library: BottomSheet, PillButton, ContinentBadge, ProgressRing
- CSS keyframe animations: slide-up, slide-down, scale-in, float, shimmer, pop, ring-fill

## Development

```bash
npm install
npm run dev
```

Requires `VITE_MAPBOX_TOKEN` in `.env`.
