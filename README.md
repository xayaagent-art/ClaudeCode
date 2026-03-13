# ThetaWheel

Wheel options strategy tracker PWA. Dark-mode, mobile-first, Robinhood-inspired.

## One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fxayaagent-art%2FClaudeCode&env=VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY&envDescription=Supabase%20credentials%20(leave%20blank%20for%20demo%20mode)&project-name=thetawheel&framework=vite)

**No Supabase? No problem.** Leave the env vars blank and the app runs in demo mode with sample data stored in localStorage.

## Stack

- React 19 + TypeScript + Vite 8
- Tailwind CSS 3
- Zustand (state management)
- Supabase (auth + database) -- optional, falls back to localStorage demo mode
- vite-plugin-pwa (offline support)

## Local Development

```bash
npm install
npm run dev
```

The app works immediately in demo mode without any env vars.

## Supabase Setup (Optional)

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial_schema.sql` in the SQL Editor
3. Copy your Project URL and `anon` key from Settings > API
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
