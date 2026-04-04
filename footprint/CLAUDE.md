# Footprint — Travel Map App

## Tech Stack

- React + Vite
- Mapbox GL JS (light-v11 base, globe projection)
- Framer Motion (spring physics)
- Tailwind CSS
- canvas-confetti for unlock celebrations
- html2canvas for share screenshots (lazy-loaded)
- localStorage for persistence

## Design Language — "Airbnb meets National Geographic"

- Clean white surfaces with intentional color
- Plus Jakarta Sans (UI) + Fraunces (display)
- Brand: Rausch #FF5A5F, Teal #00A699, Arches #FC642D
- Continent colors: Europe #E8445A, Asia #00968A, Americas #F5A623, Africa #E8703A, Oceania #4A90D9
- Each unlocked country fills with its continent color on the globe

## Development

```bash
npm install
npm run dev
```

Requires `VITE_MAPBOX_TOKEN` in `.env`.
