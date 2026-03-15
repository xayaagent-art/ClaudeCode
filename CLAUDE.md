# CLAUDE.md — ThetaWheel

ThetaWheel is a Progressive Web App (PWA) for tracking wheel options trading strategies. It is a mobile-first, dark-mode finance tracker with optional Supabase backend and localStorage-based demo mode.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict) |
| Build tool | Vite 8 |
| Routing | React Router v7 |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 (utility-first, dark only) |
| Backend | Supabase (optional) |
| PWA | vite-plugin-pwa (service workers, offline) |
| Deployment | Vercel (SPA rewrite via vercel.json) |

## Development Commands

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server with hot refresh
npm run build     # tsc -b && vite build → outputs dist/
npm run lint      # ESLint (flat config, ESLint 9)
npm run preview   # Serve production build locally
```

No test framework is configured. There are no `.test.tsx` files or test runners in devDependencies.

## Project Structure

```
src/
├── App.tsx              # Router: protected routes requiring auth
├── main.tsx             # React root, PWA service worker registration
├── index.css            # Tailwind directives + component layer (.card, .btn-*)
├── components/          # Reusable UI components
│   ├── Layout.tsx       # Main layout wrapper + bottom navigation
│   ├── BottomNav.tsx    # Mobile bottom nav (5 tabs)
│   ├── PositionCard.tsx # Summary card for a position
│   ├── IncomeProgressBar.tsx
│   ├── RuleAlerts.tsx   # Risk management alerts
│   └── StatusBadge.tsx
├── hooks/               # Data access hooks (sliced from store)
│   ├── useAuth.ts
│   ├── usePositions.ts
│   └── useMonthlyIncome.ts
├── pages/               # Route-level page components
│   ├── Dashboard.tsx    # Greeting, monthly progress, position summary
│   ├── Positions.tsx    # Filtered list of all positions
│   ├── PositionDetail.tsx
│   ├── LogTrade.tsx     # Multi-step form (open/roll/close)
│   ├── Scan.tsx         # Watchlist (stub)
│   ├── Analytics.tsx    # P&L analytics
│   └── Login.tsx        # Email auth via Supabase
├── store/
│   └── store.ts         # Zustand store (auth + positions + monthly income)
└── lib/
    ├── types.ts         # All TypeScript interfaces
    ├── utils.ts         # Financial + formatting utilities (20+ functions)
    ├── supabase.ts      # Supabase client initialization
    └── demo-store.ts    # Demo mode with localStorage + seeded data
supabase/
└── migrations/          # Database schema (SQL)
public/                  # PWA icons and manifest assets
```

## Architecture Decisions

### Demo vs. Production Mode

The app detects at runtime whether Supabase credentials are configured:

- **Demo mode** (no `.env` credentials): Uses `src/lib/demo-store.ts` with localStorage key `thetawheel_demo`. Ships with 6 seeded sample positions (AAPL, AMD, MSFT, NVDA, TSLA, SPY). IDs are prefixed `demo-`.
- **Production mode**: Uses Supabase client from `src/lib/supabase.ts`. All data operations go through row-level security policies.

The store (`src/store/store.ts`) is the only place this distinction is handled — hooks and components are unaware of which backend is active.

### State Management

- Single Zustand store accessed via `useStore()`
- Custom hooks (`useAuth`, `usePositions`, `useMonthlyIncome`) provide sliced, memoized access
- No React Context or Redux
- Store actions: `initAuth`, `signIn`, `signOut`, `fetchPositions`, `addPosition`, `addLeg`, `closePosition`, `logRoll`, `fetchMonthlyIncome`

### Routing

- Unauthenticated → `/login`
- Authenticated → `Layout` wrapper with bottom nav
- Position detail uses dynamic param: `/positions/:id`

## Styling Conventions

Tailwind utility-first, **dark theme only**. No light mode. No CSS modules or styled-components.

### Custom Color Tokens (defined in `tailwind.config.js`)

| Token | Hex | Usage |
|---|---|---|
| `rh-bg` | `#0D0D0D` | Page background |
| `rh-surface` | `#1A1A1A` | Cards and panels |
| `rh-green` | `#00C805` | Profit, positive, primary CTA |
| `rh-red` | `#EB5D2A` | Loss, negative, danger actions |
| `rh-yellow` | `#F6C86A` | Warning, neutral |
| `rh-lime` | `#D5FD51` | Accent highlight |
| `rh-subtext` | `#9B9B9B` | Secondary/muted text |

### Component Layer Classes (defined in `src/index.css`)

- `.card` — surface card with `rh-surface` background
- `.btn-primary` — green primary button (min 44px height)
- `.btn-secondary` — muted secondary button
- `.btn-danger` — red destructive button

All interactive elements must have **minimum 44px tap targets** (mobile accessibility requirement).

## TypeScript Conventions

- Strict mode enabled (`tsconfig.json`): `strict: true`, `noUnusedLocals`, `noUnusedParameters`
- All type definitions live in `src/lib/types.ts`
- No `any` types
- File extensions: `.tsx` for components/pages, `.ts` for utilities/store/hooks

### Key Types

```ts
type PositionType = 'CSP' | 'CC' | 'shares'
type LegType = 'open' | 'roll_close' | 'roll_open' | 'close'
type ConvictionLevel = 'high' | 'medium' | 'low'
type PositionStatus = 'open' | 'assigned' | 'closed'
```

## Financial Domain Logic

All calculation utilities are in `src/lib/utils.ts`:

- `calculateChainPnL(legs)` — Net P&L across all legs of a position
- `calculateROC(premium, collateral)` — Return on collateral %
- `calculateAnnualizedROC(roc, dte)` — Annualized return
- `getDTE(expiration)` — Days to expiration from today
- `getPositionStatus(legs)` — Derives `open | assigned | closed` from leg types
- `getActionHint(position)` — Returns `CLOSE | HOLD | WATCH | ACT | ROLL` based on P&L and DTE
- `getPaceStatus(earned, target, daysLeft)` — Monthly income pace tracking

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Components | PascalCase | `PositionCard.tsx` |
| Pages | PascalCase | `Dashboard.tsx` |
| Hooks | camelCase with `use` prefix | `usePositions.ts` |
| Utilities | camelCase functions | `formatCurrency()` |
| Zustand store | `useStore` | `useStore()` |
| CSS classes | Tailwind utilities + `.card`/`.btn-*` |  |
| Git commits | Conventional commits | `feat:`, `fix:`, `chore:` |

## Environment Variables

Copy `.env.example` to `.env` and fill in optionally:

```
VITE_SUPABASE_URL=       # Leave empty to run in demo mode
VITE_SUPABASE_ANON_KEY=  # Leave empty to run in demo mode
```

Without these, the app runs fully offline in demo mode with seeded data.

## Key Files to Know

| File | Purpose |
|---|---|
| `src/store/store.ts` | All application state and actions |
| `src/lib/types.ts` | All TypeScript interfaces — start here for domain model |
| `src/lib/utils.ts` | All financial calculations and formatters |
| `src/lib/demo-store.ts` | Demo mode implementation and seeded data |
| `tailwind.config.js` | Custom color tokens (`rh-*`) |
| `src/index.css` | Tailwind directives and component-layer classes |
| `vite.config.ts` | PWA manifest, service worker, caching strategy |
| `vercel.json` | SPA rewrite rule for Vercel deployment |
| `supabase/migrations/` | Database schema SQL |

## PWA Behavior

- Service worker auto-updates (no manual refresh prompt)
- Runtime caching configured for Supabase API calls
- App manifest sets `theme_color: #0D0D0D` and `background_color: #0D0D0D`
- Works offline in demo mode; production mode requires network for Supabase

## What Does Not Exist (Do Not Add Without Discussion)

- No test framework — do not add Jest/Vitest unless explicitly asked
- No Prettier — ESLint only for linting
- No pre-commit hooks (no husky/lint-staged)
- No CI/CD pipelines (no `.github/workflows/`)
- No light mode — dark only by design
- No Redux or React Context for state
