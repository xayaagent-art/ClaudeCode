# Footprint — Travel Map App

## Roadmap

- **Phase 1** (current): Core map, unlock animation, localStorage, share screenshot
- **Phase 2**: Supabase auth, persistent map, user profiles
- **Phase 3**: Friends map, social comparison ("you've both been to X")
- **Phase 4**: Atlas Wrapped annual card, unlock history timeline
- **Phase 5**: Pro tier (map skins, photo pins, region granularity) + Stripe

## Tech Stack

- React + Vite
- Mapbox GL JS (dark-v11 base style)
- Framer Motion (spring physics only)
- Tailwind CSS
- html2canvas for share screenshots
- Supabase (Phase 2)

## Design Language — "Spatial Dark Cartography"

- Spring physics only (stiffness: 280, damping: 26)
- Frosted glass panels (backdrop-blur, rgba backgrounds)
- Vignette + grain texture overlays
- Gold unlock palette (#C9A84C / #E8C97A)
- Fonts: Cormorant Garamond (display) + DM Sans (body)

## Development

```bash
npm install
npm run dev
```

Requires `VITE_MAPBOX_TOKEN` in `.env`.
