# CODEX_HANDOFF.md

Handoff for the next coding agent. Written 2026-08-21 by inspecting the
repository and the live deployment, not from memory. Assume you have **zero**
conversation history — everything you need is here or is marked `UNKNOWN` with
instructions for finding it.

**Repository:** `xayaagent-art/ClaudeCode` (public, GitHub)
**Application under work:** `meals/` (the other top-level directories are
unrelated projects — see §5)

---

## 0. START HERE: VISUAL EVIDENCE

Read this section before you write a line of code.

### 0.1 The design references are NOT in this repository

The target visual quality bar comes from five Cal AI screenshots that were
supplied as chat attachments in the previous session. **They were never
committed.** `design/references/` contains exactly one file:

```
design/references/CAL_AI_VISUAL_ANALYSIS.md      (448 lines, text only)
```

There are no `.png`/`.jpg` files under `design/references/`. Verified with
`find design -type f`.

**This is a blocker for design work and you must resolve it first.** Ask the
user to re-supply the Cal AI reference screenshots and commit them to
`design/references/` before attempting the Today rebuild. Working from the
written analysis alone is exactly the failure mode that produced the rejected
implementation (see §23).

### 0.2 What you CAN inspect right now

Committed screenshots of the current, **rejected** implementation:

| Path | What it shows |
|---|---|
| `design/qa/today/final.png` | The current Today at 390×844 — this is the rejected screen |
| `design/qa/today/calorie-fix-04.png` | Identical to `final.png` (copied) |
| `design/qa/today/calorie-fix-04-393.png` | Same at 393×852 |
| `design/qa/today/calorie-fix-04-430.png` | Same at 430×932 |
| `design/qa/today/calorie-fix-01.png` → `-03.png` | The three iterations before it |
| `design/qa/today/iteration-01.png` → `iteration-04.png` | The prior round (before calorie tracking was restored) |
| `design/qa/today/edge-long-title.png` | 83-character dish name |
| `design/qa/today/edge-100.png`, `edge-50.png` | 100% and 50% availability |

Every one of these was captured with **no food photography visible**, because
the sandbox that produced them could not reach any image host (see §17).

### 0.3 What you should notice

Open `design/qa/today/final.png` and compare it to a real consumer food app.
The gap the user identified:

- It reads as a web page with cards, not as a mobile product.
- Large amounts of flat empty ground colour; weak composition.
- The nutrition strip is small and timid relative to what a tracking app does
  with its primary metric.
- The meal hero is a white rounded rectangle with text in it.
- No photography in the capture at all.

**There is no committed screenshot of the deployed Today with photography.**
The deployed page does render real images (§17), but nobody has captured it.
Producing that capture is part of your first task.

---

## 1. EXECUTIVE SUMMARY

**Human Not Found** is the product/brand. Its stated positioning is *"the
intelligence layer for everyday home life."*

**Household Meal Intelligence** is the first application under that brand. It
answers, for a two-person household, "what should we eat tonight, given what is
actually in our kitchen, and how are we doing nutritionally today?"

**The core product loop:**

```
Receipt → Kitchen inventory → Intelligent meal recommendation → Recipe
       → Cook / log meal → Nutrition tracking → Inventory updates → (repeat)
```

**Current milestone: M3 — DESIGN.** M1 (state/persistence) and M2
(recommendation intelligence) are built and should be preserved. M3 exists to
establish a consumer-grade mobile visual system.

**What is already built:** receipt scanning with a real vision model, inventory
with freshness/use-soon intelligence, persisted recommendation sets with
diversity and novelty ranking, YouTube source discovery with quality ranking,
recipe detail with meal logging, weekly plan, calorie and macro aggregation, a
Supabase-backed data layer, 313 passing tests, and a working Vercel preview
pipeline.

**What is broken:** the visual design. Also `npm run lint` (no ESLint config), a
responsive-layout defect between 768px and 1023px, dead code, and an
unexplained one-off HTTP 500. See §21.

**Why implementation is moving to Codex:** the previous agent (Claude Code) ran
four measured visual iterations on Today, self-scored the result 3.9/5 against a
4.2 gate, and concluded the only remaining blocker was imagery. The user then
opened the actual deployed product and **rejected the visual result outright.**
The self-scoring was not a reliable proxy for human judgment.

### 1.1 READ THIS TWICE

> **The current M3 Today implementation is NOT approved.**
> Do not treat `src/components/today-view.tsx` or
> `src/components/day-progress.tsx` as the desired design.
> Do not assume hierarchy, spacing, typography or surface treatment are
> "already solved" — the previous agent believed all four were solved and the
> user disagreed after seeing the deployed app.
> **Human screenshot review is the final design gate, not any score you compute.**

---

## 2. PRODUCT VISION

The product combines, in one surface:

- household kitchen intelligence
- meal planning
- recipe discovery
- receipt scanning
- food inventory awareness
- calorie tracking
- macro tracking
- meal logging

**It is not just a calorie tracker. It is not just a meal planner.**

The differentiation is that the product knows:

- what the household owns
- what should be used soon
- what is running low
- what meals fit those ingredients
- what the household prefers
- what has been eaten
- nutrition progress against targets

Those household-intelligence signals are the moat. Any redesign must keep them
visible: **% of ingredients already at home**, **missing ingredients**,
**use-soon ingredients**, and **why this meal is recommended**.

---

## 3. CURRENT MILESTONE — M3 (DESIGN)

M1/M2 functionality is to be preserved. M3 establishes the consumer mobile
visual system. The quality bar is polished consumer apps of the Cal AI class.

**The existing Today redesign failed that bar and was rejected by the user
after reviewing the deployed product.**

---

## 4. REPOSITORY ORIENTATION

This is a **monorepo containing three unrelated projects**. Only `meals/` is in
scope.

```
/                                   repo root
├── CODEX_HANDOFF.md                this file
├── DESIGN.md                       design system for Human Not Found (181 lines)
├── README.md                       EMPTY (0 bytes)
├── package.json                    root — builds `footprint`, NOT meals. Ignore.
├── vercel.json                     root — static build for `footprint`. Ignore.
├── design/
│   ├── DESIGN.md                   (does not exist; DESIGN.md is at repo root)
│   ├── references/
│   │   └── CAL_AI_VISUAL_ANALYSIS.md   448 lines. NO IMAGES — see §0.1
│   └── qa/today/
│       ├── ITERATIONS.md           291 lines, the visual QA log
│       └── *.png                   27 screenshots (see §0.2)
├── meals/                          ← THE APPLICATION. All work happens here.
├── footprint/                      unrelated project. Do not touch.
├── wheelsniper/                    unrelated project. Do not touch.
├── .claude/                        Claude Code agent + command definitions
│   ├── agents/aidesigner-frontend.md
│   ├── commands/aidesigner.md
│   └── skills/aidesigner-frontend/SKILL.md
└── .agents/skills/aidesigner-frontend/SKILL.md
```

### 4.1 `meals/` structure

```
meals/
├── AGENTS.md / CLAUDE.md           Next.js 16 warning — READ IT (see §6.1)
├── README.md
├── package.json                    the real scripts
├── vercel.json                     framework + Playwright install guard
├── next.config.ts
├── tsconfig.json                   path alias "@/*" → "./src/*"
├── vitest.config.mts
├── postcss.config.mjs              Tailwind v4 via @tailwindcss/postcss
├── qa-today.mjs                    Playwright: Today at 3 viewports + route check
├── qa-edge.mjs                     Playwright: long title / 100% / 50% edge cases
├── qa-seed-day.mjs                 logs meals via the app's own API before QA
├── .env.example                    every env var, documented
├── .data/                          GITIGNORED local JSON store + receipt images
├── docs/
│   ├── decisions.md
│   └── integration-checklist.md
├── fixtures/                       receipt fixtures for mock mode
├── public/
│   ├── manifest.webmanifest
│   ├── icons/icon-192.png, icon-512.png, icon-maskable-512.png
│   └── fixtures/trader-joes-receipt.png
│   └── (NO food photography — see §17)
├── scripts/
│   ├── seed.ts                     `npm run seed`
│   └── render-receipt-fixture.mjs
├── supabase/migrations/            0001…0007 (no 0008 — see §7.4)
├── tests/                          16 files, 313 tests
└── src/
    ├── app/                        Next.js App Router — see §11
    ├── components/                 13 files — see §4.2
    └── lib/                        61 files — see §4.3
```

### 4.2 `meals/src/components/`

| File | Purpose | Design status |
|---|---|---|
| `today-view.tsx` | Today screen | **REJECTED — replace freely** |
| `day-progress.tsx` | Calorie ring + macro row | **REJECTED visually; logic contract is sound** |
| `food-image.tsx` | 3-tier image: photo → shimmer → drawn plate | Photo tier good; plate fallback rejected |
| `bottom-nav.tsx` | Floating pill nav + Scan FAB; left rail at `lg:` | **REJECTED — replace freely** |
| `recipe-view.tsx` | Recipe detail | Not yet redesigned in M3 |
| `plan-view.tsx` | Weekly plan | Not yet redesigned in M3 |
| `kitchen-view.tsx` | Inventory list | Not yet redesigned in M3 |
| `scan-view.tsx` | Receipt capture + staged progress | Not yet redesigned in M3 |
| `settings-view.tsx` | Household/settings | Not yet redesigned in M3 |
| `review-view.tsx` | Receipt item review | Not yet redesigned in M3 |
| `ui.tsx` | Shared primitives: `Button`, `Divider`, `ErrorNote`, `Pill`, `RecipePlate`, `SectionHeading` | Mixed; `RecipePlate` duplicates `food-image.tsx` |
| `use-enrichment.ts` | Client hook, bounded polling of `/api/recipes/enrich` | **Sound — preserve** |
| `progress.tsx` | **DEAD CODE — imported by nothing.** Verified by grep. | Delete |

### 4.3 `meals/src/lib/` — key modules

```
lib/db/          index.ts (backend selection), supabase.ts, local.ts,
                 plan-window.ts, types.ts
lib/views/       today.ts, recipe.ts, recommendations.ts
                 ← the server-side payload builders each screen renders
lib/meals/       recommend.ts, rank.ts, candidates.ts, catalog.ts, taxonomy.ts,
                 behavior.ts, source-quality.ts, enrichment.ts, discovery-service.ts,
                 log.ts, memory.ts, plan.ts, registry.ts, diet.ts
lib/nutrition/   engine.ts (totals + macros), estimate.ts (per-recipe estimate),
                 sources.ts (per-100g reference table), enrich.ts
lib/kitchen/     state.ts (freshness/use-soon), confirmations.ts, deduct.ts,
                 freshness.ts, match.ts, restock.ts, signals.ts
lib/receipt/     parse.ts, schema.ts, normalize.ts, validate.ts, service.ts,
                 storage.ts, image.ts, mappings.ts
lib/ai/          provider.ts (mock|openai|gemini), openai-call.ts, models.ts,
                 pricing.ts, retry.ts, failure.ts, providers/*
lib/video/       youtube.ts, provider.ts
lib/             types.ts, seed.ts, analytics.ts, date.ts, http.ts,
                 client-fetch.ts, diagnostics.ts, household/context.ts
```

---

## 5. TECH STACK

Versions read from `meals/node_modules/*/package.json` (actually installed, not
just declared):

| Thing | Version |
|---|---|
| Next.js | **16.3.1** (App Router, Turbopack bundler) |
| React / React DOM | 19.2.8 |
| TypeScript | 5.9.3 (`strict: true`) |
| Tailwind CSS | 4.3.3 (via `@tailwindcss/postcss`, `@theme` tokens) |
| `@supabase/supabase-js` | 2.112.3 |
| `openai` | 7.4.0 |
| `zod` | 4.4.3 |
| `geist` (font) | 1.7.2 |
| Vitest | 4.1.10 |
| Playwright | 1.62.1 |
| `tsx` | 4.23.12 |
| Node | v22.22.2 |
| npm | 10.9.7 |
| Package manager | **npm** (`package-lock.json`) |

Styling is **Tailwind v4 with `@theme` custom properties** defined in
`meals/src/app/globals.css`. There is no `tailwind.config.js`. Design tokens
(`--color-ink`, `--text-dish`, `--spacing-gutter`, …) live in that one file.

### 5.1 Commands — all verified by running them

Run everything from `meals/`, not the repo root.

```bash
cd meals

npm install                  # install
npm run dev                  # local dev server, http://localhost:3000
npm run build                # production build (next build)
npm run start                # serve the production build
npm run typecheck            # tsc --noEmit                → VERIFIED CLEAN
npm test                     # vitest run                  → VERIFIED 313 passing / 16 files
npm run test:watch           # vitest
npm run seed                 # tsx scripts/seed.ts
npm run fixture:render       # node scripts/render-receipt-fixture.mjs
npm run lint                 # ⚠️ BROKEN — ESLint is not installed. See §21 item 2.
```

**There is no working linter.** `npm run typecheck` and `npm test` are the only
automated quality gates that actually run.

**Running a production build locally without Supabase** — a deployed build
refuses to fall back to the JSON store, so you must opt in explicitly:

```bash
cd meals
ALLOW_LOCAL_DB=true AI_PROVIDER=mock npx next start -p 3311
```

**Visual QA harness** (Playwright, expects a server on port 3311):

```bash
cd meals
node qa-seed-day.mjs                 # logs 2 meals through POST /api/meals/log
node qa-today.mjs <name>             # writes ../design/qa/today/<name>{,-393,-430}.png
node qa-edge.mjs                     # writes edge-long-title/edge-100/edge-50 .png
```

`qa-today.mjs` also walks Today → recipe and checks `/plan`, `/kitchen`,
`/kitchen/scan`, `/settings` all return 200, printing a JSON result table.

Playwright Chromium path used by the harnesses: `/opt/pw-browsers/chromium`
(hard-coded in `qa-today.mjs` and `qa-edge.mjs`). **Change this if your
environment installs Chromium elsewhere.**

---

## 6. NEXT.JS 16 WARNING

### 6.1 Read `meals/AGENTS.md` before writing App Router code

`meals/AGENTS.md` (mirrored by `meals/CLAUDE.md`) says:

> This version has breaking changes — APIs, conventions, and file structure may
> all differ from your training data. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code.

Concretely, in this codebase: dynamic route params are a **Promise**
(`{ params }: { params: Promise<{ id: string }> }` — see
`src/app/recipes/[id]/page.tsx`). That block in `AGENTS.md` is regenerated by
`next dev`; commit it with your work rather than deleting it.

---

## 7. GIT STATE

Captured 2026-08-21.

| Field | Value |
|---|---|
| Current branch | `claude/meal-intelligence-ux-overhaul` |
| HEAD | `6b8f4ebdcd3ed2bb6c1e22865417abb62cb51e00` |
| Working tree | **clean** (`git status --short` empty) |
| Uncommitted files | none |
| Remote | `https://github.com/xayaagent-art/ClaudeCode` |
| Default branch | `main` |

### 7.1 Recent commits

```
6b8f4eb 2026-08-21  Record what the deployed preview actually shows
3518991 2026-08-21  Pin the two Today contracts that had no test behind them
0a08031 2026-08-20  Put calorie and macro tracking back on Today, and give the hero its photograph
9720770 2026-08-20  Rebuild Today around the dish, and score it honestly
cbf4103 2026-08-20  Write the design system down from the references, not from guesswork
af848fa 2026-08-20  Prove every rendered recipe link opens, and guard the write that broke them
fc517e0 2026-08-20  Make the suggestions worth reading, and the signals worth keeping
7b5b977 2026-08-20  Make persisted state the source of truth for meals and the week
9e1ce0b 2026-08-20  Stop sending the database secret as a token it is not
```

### 7.2 Checkpoint tags

| Tag | Commit | Meaning |
|---|---|---|
| `checkpoint/pre-ux-overhaul` | `9e1ce0b` | before any UX work |
| `checkpoint/ux-m1-state-working` | `7b5b977` | M1 complete: persisted state |
| `checkpoint/ux-m2-intelligence-working` | `fc517e0` | M2 complete: ranking intelligence |
| `checkpoint/ux-m3-start` | `fc517e0` | same commit as M2 |
| `checkpoint/ux-m3-ui-working` | `254515e` | first M3 attempt (**also failed**) |
| `failed/ux-m3-254515e` | `254515e` | preserved failed M3 attempt #1 |
| `checkpoint/ux-m3-restart-base` | `af848fa` | rollback point M3 attempt #2 started from |

### 7.3 The M3 commits that produced the REJECTED Today

**`9720770`, `0a08031`, `3518991`, `6b8f4eb`** — these four are the current M3
attempt. Combined diff against `meals/src`:

```
 globals.css                |   9 +      design tokens (added --text-item)
 app/today/page.tsx         |  10 +-     passes currentSet to the view
 components/bottom-nav.tsx  |  89 ++--   floating pill nav + Scan FAB + lg: rail
 components/day-progress.tsx| 154 +++    NEW: calorie ring + macro row
 components/food-image.tsx  |  79 +++    NEW: 3-tier image component
 components/today-view.tsx  | 506 ++++-- the rejected Today composition
 lib/analytics.ts           |  16 +-     new surface labels for tracking
 lib/nutrition/engine.ts    |  59 +++    macrosFor() — day macro aggregation
 lib/nutrition/estimate.ts  |  35 +-     estimator now returns carbs + fat
 lib/nutrition/sources.ts   | 107 +--    per-100g table gained carbs + fat
 lib/views/today.ts         |  32 +-     macros in payload + thumbnail_url fix
 ─────────────────────────────────────
 11 files, 791 insertions, 305 deletions
```

**Do not blind-revert these commits.** They mix rejected presentation with
genuinely good backend work in the same range:

- **Keep:** everything under `lib/nutrition/`, the `thumbnail_url` fix in
  `lib/views/today.ts`, the tests added in `3518991`.
- **Replace at will:** `today-view.tsx`, `day-progress.tsx`, `bottom-nav.tsx`,
  the fallback tier of `food-image.tsx`.

There is also an **earlier failed M3 attempt** preserved at
`failed/ux-m3-254515e` (`254515e`). It failed acceptance for a *functional*
reason — it added recipe columns that were never migrated to the live Supabase
schema, so every recipe write 400'd and recipe links 404'd on device. Do not
resurrect it. Its lesson is encoded in a regression test (§7.4).

### 7.4 Migration state

`meals/supabase/migrations/` contains `0001` … `0007`. There is deliberately no
`0008`: the failed attempt's `0008` was rolled back. The live `recipes` table has
exactly **27 columns**, and `meals/tests/recipe-routing.test.ts` pins that list as
`DEPLOYED_RECIPE_COLUMNS`.

> ⚠️ **If you add a column to the `Recipe` type you must also write and apply a
> migration.** `upsertRecipe` in `src/lib/db/supabase.ts` writes the whole row.
> Adding a field in code alone makes every recipe write fail with a 400, which
> silently drops dishes and produces 404s on recipe links. That is exactly how
> M3 attempt #1 failed. The guard test will catch it — do not skip it.

---

## 8. DEPLOYMENT

| Field | Value |
|---|---|
| Provider | Vercel |
| Team ID | `team_Co6dRlh3QDoeaG7HWo7dlciQ` (`xayaagent-7097s-projects`) |
| Project name | `household-meal-intelligence` |
| Project ID | `prj_giyooqI0DfZZ1GjXpxnbcAAXeaYF` |
| Framework preset | `nextjs` |
| Node version | 24.x |
| Bundler | turbopack |
| Root directory | **`meals`** (the app is not at repo root) |
| Deploy trigger | GitHub push to `claude/meal-intelligence-ux-overhaul` |
| Production alias | `household-meal-intelligence-xayaagent-7097s-projects.vercel.app` |

⚠️ There is a **second, unrelated Vercel project** on the same team:
`meals-mvp-preview` (`prj_5vKUlp8mReHaFk6fg5XuNQakagop`). It is stale. Do not
deploy to it, and **do not create a third project.**

⚠️ The **repo-root `vercel.json` and `package.json` belong to `footprint`**, not
to meals. The meals project has its own `meals/vercel.json`. Do not "fix" the
root config to point at meals.

### 8.1 Current deployment status

| Field | Value |
|---|---|
| Latest deployment ID | `dpl_J9xeUnEt65QgahjmgRTJwf9zQget` |
| State | `READY` |
| Commit deployed | `6b8f4ebdcd3ed2bb6c1e22865417abb62cb51e00` (**= HEAD; up to date**) |
| Target | `null` (**preview**, not production) |
| Deployment URL | `https://household-meal-intelligence-nefhtq87u-xayaagent-7097s-projects.vercel.app` |
| Stable branch alias | `https://household-meal-intelligence-git-14f2a6-xayaagent-7097s-projects.vercel.app` |

**Today route:** `/today` → `https://household-meal-intelligence-nefhtq87u-xayaagent-7097s-projects.vercel.app/today`
**Recipe route:** `/recipes/<recipe_id>` — note ids can contain a colon, e.g.
`/recipes/gen-mediterranean:and-cherry-chicken-garlic-lemon-pan-seared-spinach-tomatoes-with`

A previous deployment `dpl_6KStouSNhdrnBAKmS2iUCLXtYsx5` (commit `3518991`,
URL `household-meal-intelligence-pc9c63cf2-xayaagent-7097s-projects.vercel.app`)
was fetched and returned **HTTP 200** with fully rendered Today HTML including
real `i.ytimg.com` `<img>` tags. That is the last capture of a confirmed-working
Today. Both deployments contain the same application code; `6b8f4eb` differs
only by a Markdown file.

### 8.2 Deployment blocker: Vercel SSO

The project has **Vercel Authentication (SSO) deployment protection enabled**.
Automated `fetch`/`curl` against preview URLs frequently returns `302` to
`vercel.com/sso-api` instead of the page. A signed-in human browser reaches the
page fine.

Consequences for you:
- You may not be able to scrape the deployed HTML reliably.
- **Verify visual work locally with Playwright**, not against the deployment.
- If your tooling has a Vercel MCP `web_fetch_vercel_url`, it sometimes gets
  through and sometimes does not. Do not treat a 302 as an application failure.

### 8.3 How to deploy a preview without creating a duplicate project

**Just push to the branch.** The GitHub integration is live and working:

```bash
git push -u origin claude/meal-intelligence-ux-overhaul
```

This produces a new preview deployment on the existing project, aliased to
`household-meal-intelligence-git-14f2a6-xayaagent-7097s-projects.vercel.app`.

- Do **not** run `vercel` CLI project-creation flows.
- Do **not** use a `deploy_to_vercel`-style file-upload tool — it risks
  converting the git-linked project into a CLI-deployed one.
- Do **not** deploy to production. Both current deployments have `target: null`
  (preview) and it should stay that way unless the user asks.
- Builds have been observed to queue for ~1–4 minutes before building. One push
  on 2026-08-20 did not produce a build at all for ~16 hours, then later pushes
  built normally. Cause `UNKNOWN`. If a push does not build within ~10 minutes,
  push an empty-ish follow-up commit rather than assuming the integration is
  broken.

---

## 9. ENVIRONMENT VARIABLES

Names only — **never commit or print values.** Full documentation lives in
`meals/.env.example`. Copy it to `meals/.env.local` for local work.

| Variable | Purpose | Needed locally? | On Vercel? | Fallback if missing |
|---|---|---|---|---|
| `SUPABASE_URL` | Supabase project URL | No | **Yes** (inferred — deployed app reads live data) | Local JSON store under `.data/` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side service-role key. Bypasses RLS — never expose to browser. | No | **Yes** (inferred) | Local JSON store |
| `ALLOW_LOCAL_DB` | Escape hatch: lets a *production* build use the JSON store | Only for `next start` locally | No | Deployed build throws `PersistenceNotConfiguredError` |
| `LOCAL_DB_PATH` | Where the JSON store lives | Optional | No | `.data/meals.json` |
| `AI_PROVIDER` | `mock` \| `openai` \| `gemini` | Optional | `UNKNOWN` | `mock`, unless `GEMINI_API_KEY`/`OPENAI_API_KEY` present |
| `OPENAI_API_KEY` | Receipt vision + meal generation | Only for real mode | `UNKNOWN` | With `AI_PROVIDER=openai` and no key, scanning fails loudly — it does NOT silently use fixtures |
| `OPENAI_MODEL` | Responses-API model | Optional | `UNKNOWN` | `gpt-5` |
| `OPENAI_RECEIPT_MODEL` | Cheaper model for transcription | Optional | `UNKNOWN` | falls back to `OPENAI_MODEL` |
| `GEMINI_API_KEY` | Gemini provider | Optional | `UNKNOWN` | ⚠️ **Read by `src/lib/ai/provider.ts` but NOT documented in `.env.example`** |
| `YOUTUBE_API_KEY` | Recipe video + thumbnail discovery | Optional | `UNKNOWN` — likely yes, given 19 recipes have thumbnails | Written steps only; never invents a video link |
| `FDC_API_KEY` | USDA FoodData Central nutrition | Optional | `UNKNOWN` | Built-in generic per-100g table, values labelled as estimates |
| `MOCK_RECEIPT_FIXTURE` | Which bundled fixture mock mode replays | Optional | No | `trader-joes` |
| `AI_PRICE_INPUT_PER_MTOK` | Cost-telemetry override | Optional | No | built-in price table |
| `AI_PRICE_OUTPUT_PER_MTOK` | Cost-telemetry override | Optional | No | built-in price table |
| `RECEIPT_PARSER` | **Deprecated**, superseded by `AI_PROVIDER` | No | No | ignored unless set |
| `RECIPE_WEB_SEARCH` | Set `off` to disable web search in discovery | Optional | No | enabled |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Whether analytics events are sent anywhere | Optional | `UNKNOWN` | `false`; events fire but go nowhere |
| `CHROMIUM_PATH` | Reuse installed Chromium for fixture rendering | Optional | No | Playwright default |
| `VERCEL` | Set automatically by Vercel; used to detect deployed builds | n/a | auto | — |

**How to determine the `UNKNOWN` values:** open the Vercel dashboard →
`household-meal-intelligence` → Settings → Environment Variables, or ask the
user. Do not guess, and do not print values into logs or commits.

**Supabase project:** name `meal-intelligence`, ref `mrsnfrrpfldgayqdgesp`,
region `us-west-1`, Postgres 17, status `ACTIVE_HEALTHY`. (There is a second,
`INACTIVE` project `botanical-heritage` / `oggtnuggsddizsksydro` — unrelated.)

---

## 10. DATA MODEL + BACKEND STATUS

### 10.1 Live Supabase tables and row counts

Queried 2026-08-21 against project `mrsnfrrpfldgayqdgesp`:

| Table | Rows |
|---|---|
| `recipes` | 24 (19 with `thumbnail_url`, 0 with `image_url`, 11 with ≥1 instruction step) |
| `recipe_ingredients` | every recipe has ≥1 (verified: zero recipes with 0 ingredients) |
| `inventory_items` | **0** ⚠️ see §10.3 |
| `meal_logs` | 4 |
| `meal_recommendations` | 66 |
| `receipts` | 3 |
| `receipt_items` | 79 |
| `weekly_plans` | 4 |
| `household_members` | 2 (Yash, Surabhi) |
| `nutrition_profiles` | 2 |
| `preference_signals` | 110 |
| `meal_feedback` | 4 |
| `product_mappings` | 2 |

Full table list: `households`, `household_members`, `nutrition_profiles`,
`inventory_items`, `inventory_events`, `receipts`, `receipt_items`,
`receipt_telemetry`, `recipes`, `recipe_ingredients`, `meal_recommendations`,
`meal_logs`, `meal_feedback`, `preference_signals`, `product_mappings`,
`weekly_plans`.

### 10.2 Feature status

| Feature | Status | Where |
|---|---|---|
| Household + members + nutrition targets | **WORKING** | `lib/db/supabase.ts` `listMembers`, `lib/seed.ts` |
| Inventory model (status, freshness, storage, confidence) | **WORKING** | `lib/types.ts`, `lib/kitchen/state.ts` |
| Use-soon / past-best intelligence | **WORKING** | `lib/kitchen/state.ts`, `lib/kitchen/freshness.ts` |
| Low-stock / restock signals | **WORKING** | `lib/kitchen/restock.ts`, `lib/kitchen/signals.ts` |
| Receipt parsing (vision) | **WORKING** in real mode; **MOCKED** with `AI_PROVIDER=mock` | `lib/receipt/parse.ts`, `lib/ai/providers/*` |
| Receipt → inventory normalization + matching | **WORKING** | `lib/receipt/normalize.ts`, `lib/kitchen/match.ts` |
| Recipe catalog (18 seeded dishes) | **WORKING** | `lib/meals/catalog.ts` |
| Dynamic meal generation | **WORKING** in real mode | `lib/meals/recommend.ts`, `lib/meals/candidates.ts` |
| Availability calculation (% at home, missing list) | **WORKING** | `lib/meals/rank.ts`, `lib/views/recommendations.ts` |
| Diversity / novelty ranking | **WORKING** | `lib/meals/taxonomy.ts`, `lib/meals/rank.ts` |
| Behaviour signals / repeat suppression | **WORKING** | `lib/meals/behavior.ts` |
| Persisted recommendation sets (survive navigation) | **WORKING** | `lib/views/recommendations.ts` (`batch_id` grouping) |
| YouTube source discovery + quality ranking | **WORKING** (needs `YOUTUBE_API_KEY`) | `lib/video/youtube.ts`, `lib/meals/source-quality.ts` |
| Async presentation enrichment (thumbnails) | **WORKING** | `lib/meals/enrichment.ts`, `components/use-enrichment.ts` |
| Meal logging | **WORKING** | `lib/meals/log.ts`, `POST /api/meals/log` |
| Calorie aggregation (day totals vs targets) | **WORKING** | `lib/nutrition/engine.ts` `totalsFor` / `targetsFor` |
| Protein aggregation | **WORKING** — measured, stored per log | `lib/nutrition/engine.ts` |
| Carbohydrate + fat aggregation | **PARTIAL — DERIVED, NOT STORED** | `lib/nutrition/engine.ts` `macrosFor` + `lib/nutrition/estimate.ts` |
| Carb/fat *targets* | **NOT IMPLEMENTED — deliberately.** See §14.2 | — |
| Nutrition enrichment via USDA | **PARTIAL** (needs `FDC_API_KEY`; falls back to built-in table) | `lib/nutrition/sources.ts` |
| Weekly plan generation + targeted day swap | **WORKING** | `lib/meals/plan.ts`, `lib/db/plan-window.ts` |
| Supabase persistence | **WORKING** | `lib/db/supabase.ts` |
| Local JSON store (dev) | **WORKING** | `lib/db/local.ts` |
| Analytics event firing | **PARTIAL** — events defined and fired, **no provider connected** | `lib/analytics.ts` |
| Recipe instructions | **PARTIAL** — only 11 of 24 live recipes have steps | `recipes.instructions` |

### 10.3 ⚠️ The live kitchen is currently EMPTY

`inventory_items` had **0 rows** when queried on 2026-08-21 at ~08:45 UTC. A
fresh recommendation batch (`5bb304a5-…`) was generated at 08:43 UTC the same
morning — so the app is being used, but against an empty kitchen.

**Consequence:** `/today` will render the `EmptyKitchen` branch
("Let's fill the kitchen first") rather than the meal hero, because
`today-view.tsx` checks `initial.inventory_count === 0` first.

**This is expected behaviour, not a bug.** Before doing visual work on the
populated Today state you must repopulate inventory by one of:
- scanning a receipt through `/kitchen/scan`, or
- running against the local JSON store, which seeds a starter pantry
  automatically (`lib/seed.ts` → `seedInventorySpecs`), or
- `POST /api/inventory` with items.

`POST /api/inventory/reset` with `{scope: "demo"|"all", confirm: "<same>"}`
clears inventory; it is the likely cause of the empty table.

### 10.4 The nutrition contract — read before touching nutrition code

| Value | Source | Rendered as |
|---|---|---|
| Calories | **Measured** — stored on each `meal_logs` row when the meal is logged | `2,028 / 4,300` |
| Protein | **Measured** — stored per log | `85g / 250g` |
| Carbohydrates | **Derived** at read time from the recipe ingredient list, scaled by `log.servings` | `280g` with an `est.` marker |
| Fat | **Derived** the same way | `40g` with an `est.` marker |
| Calorie target | Sum of `nutrition_profiles.calorie_target` across scope | denominator of the ring |
| Protein target | Sum of `nutrition_profiles.protein_target` | denominator |
| Carb/fat targets | **Do not exist and must not be invented** | no denominator shown |

Rules that are load-bearing and must survive any redesign:

1. Unknown carbs/fat render as **`—`, never `0g`.** `macrosFor` returns `null`
   when no logged recipe resolved a macro breakdown.
2. A day with no logs shows an **empty ring reading 0** — never a placeholder
   number.
3. Estimated values are **labelled** as estimates.
4. `recipes` has **no** `carbs_per_serving` / `fat_per_serving` column, by
   design. Carbs and fat are computed, not stored. Adding those columns requires
   a migration (§7.4).

Relevant functions: `macrosFor()` in `src/lib/nutrition/engine.ts`,
`estimateRecipeNutrition()` in `src/lib/nutrition/estimate.ts`,
`GENERIC_TABLE` (40 entries, each with `kcal`/`protein`/`carbs`/`fat` per 100g)
in `src/lib/nutrition/sources.ts`.

---

## 11. ROUTE-BY-ROUTE STATUS

### Page routes

| Route | Page file | View component | Purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | — | redirects to `/today` |
| `/today` | `src/app/today/page.tsx` | `components/today-view.tsx` | Today |
| `/plan` | `src/app/plan/page.tsx` | `components/plan-view.tsx` | Weekly plan |
| `/kitchen` | `src/app/kitchen/page.tsx` | `components/kitchen-view.tsx` | Inventory |
| `/kitchen/scan` | `src/app/kitchen/scan/page.tsx` | `components/scan-view.tsx` | Receipt capture |
| `/kitchen/review/[id]` | `src/app/kitchen/review/[id]/page.tsx` | `components/review-view.tsx` | Confirm parsed receipt items |
| `/recipes/[id]` | `src/app/recipes/[id]/page.tsx` | `components/recipe-view.tsx` | Recipe detail |
| `/meals` | `src/app/meals/page.tsx` | `components/recommendations-view.tsx` | "See more" recommendations |
| `/settings` | `src/app/settings/page.tsx` | `components/settings-view.tsx` | Household + preferences |
| `/settings/diagnostics` | `src/app/settings/diagnostics/page.tsx` | inline | Developer diagnostics |
| `/settings/diagnostics/live` | `src/app/settings/diagnostics/live/page.tsx` | inline | Live provider checks |

Every page sets `export const dynamic = "force-dynamic"`.

### API routes (all under `src/app/api/`)

```
GET  /api/today                          Today payload
POST /api/meals/recommend                generate a recommendation set
POST /api/meals/log                      log a meal  {recipe_id, meal_type, servings_by_member?}
POST /api/meals/log/undo                 undo by batch_id
POST /api/meals/feedback                 thumbs up/down
POST /api/recipes/enrich                 resolve thumbnails/videos for ids on screen
GET  /api/recipes/[id]                   recipe detail
GET  /api/recipes/[id]/source            resolve a video source
GET  /api/plans        POST /api/plans/generate    POST /api/plans/day
GET/POST /api/inventory                  list / add inventory
PATCH/DELETE /api/inventory/[id]         edit / remove
POST /api/inventory/[id]/confirm         answer a freshness confirmation
GET  /api/inventory/confirmations        pending confirmations
POST /api/inventory/reset                {scope:"demo"|"all", confirm:"<same>"}
POST /api/receipts/parse                 upload + parse a receipt
GET  /api/receipts/[id]                  parsed receipt
POST /api/receipts/[id]/confirm          commit items to inventory
PATCH /api/receipts/[id]/items/[itemId]  correct one parsed line
GET  /api/receipts/[id]/image            stored receipt image
POST /api/nutrition/enrich               resolve nutrition for inventory items
GET/POST /api/household                  household + member profiles
POST /api/signals                        preference signals
GET  /api/diagnostics                    config/provider status
```

### 11.1 Per-screen detail

#### `/today` — Today
- **Purpose:** "What should I eat tonight, and how am I doing today?"
- **Data:** `getTodayPayload()` (`lib/views/today.ts`) + `getCurrentRecommendations()` (`lib/views/recommendations.ts`), both server-side, both reading persisted state only. **No model call happens on mount, back-navigation, or focus.**
- **Currently renders:** header with wordmark + avatar link → `DayProgress` strip (calories `N / target`, ring, Protein/Carbs/Fat) → "Tonight" + break-out hero card (photo, dish name, cuisine·time·protein, `94%` at home, `N to buy`, recommendation reason) → `Cook this` black pill → "Use soon" chips → "Not feeling it?" with 2 alternative rows.
- **Design status:** ❌ **REJECTED.**
- **Preserve:** the payload contract, the no-AI-on-mount rule, the `thumbnail_url` propagation, the four household-intelligence signals, the nutrition contract in §10.4.
- **Replace freely:** the entire composition, hierarchy, spacing, card treatment, ring design, macro row, and the beige "plate" fallback.

#### `/recipes/[id]` — Recipe
- **Purpose:** "Should I cook this, and how do I make it?"
- **Currently:** availability, per-member serving steppers, ingredient list with missing flags, collapsible steps (collapsed when a video exists), video link with attribution + source-quality reasons, `Ate this` logging with undo, thumbs feedback.
- **Known issues:** uses `RecipePlate` from `ui.tsx` rather than `components/food-image.tsx` — two image components with different fallbacks. Only 11 of 24 live recipes have instruction steps.
- **Design status:** not yet redesigned in M3. **Do this second, not first.**
- **⚠️ Historical:** recipe links 404'd on device in M3 attempt #1. Cause was schema drift (§7.4), now guarded by `tests/recipe-routing.test.ts`. Recipe ids may contain `:`.

#### `/kitchen/scan` — Scan
- **Purpose:** "What did we just buy?"
- **Currently:** file/camera upload → staged progress (`upload` → `read` → `items` → `match`) → redirect to review. Typed failure taxonomy with retryable flag. Bottom nav is deliberately hidden on this route.
- **Design status:** not yet redesigned. **Preserve the staged-progress model** — it is the best interaction in the app.

#### `/plan` — Plan
- **Purpose:** "What are we eating this week?"
- **Currently:** 7-day window from `getCurrentPlan(start)`; targeted single-day replacement without regenerating the week. `planCovers()` in `lib/db/plan-window.ts` fixes an earlier bug where the plan vanished each morning.
- **Design status:** not yet redesigned.

#### `/kitchen` — Kitchen
- **Purpose:** "What do we have, and what needs attention?"
- **Currently:** items with status, storage, freshness label, use-soon score, confidence band, plain-language explanation; shows persistence + parser config.
- **Design status:** not yet redesigned.

#### `/settings` — Settings / Household
- **Purpose:** "What household assumptions and preferences can I control?"
- **Currently:** household, members, calorie/protein targets, inventory reset. Reached via the avatar in the Today header — **not a nav tab.**
- **Design status:** not yet redesigned.

---

## 12. IMPORTANT DESIGN DIRECTION

**Do not continue the current Today design.** The implementation captured in
`design/qa/today/final.png` and deployed at the URL in §8.1 is rejected.

Problems the user identified after reviewing the deployed product:

- weak resemblance to the reference quality bar
- desktop-looking layout rather than a convincing consumer mobile app
- excessive empty whitespace
- weak composition
- nutrition tracking lacking the visual confidence of the reference
- meal content behaving like ordinary web cards
- navigation feeling like a website sidebar on desktop
- insufficiently polished mobile-product shell
- overall product still feeling like an internal prototype

The target direction comes from the Cal AI reference screenshots. **Those images
are not in the repo (§0.1) — get them from the user and commit them to
`design/references/` before starting.** Inspect the actual images. Do not work
from `CAL_AI_VISUAL_ANALYSIS.md` alone; that is how the rejected version was
built.

---

## 13. WHAT TO LEARN FROM CAL AI

Principles extracted in `design/references/CAL_AI_VISUAL_ANALYSIS.md`:

- strong label/value hierarchy — small grey label, large black value
- almost monochrome UI chrome
- black as the primary action and selected colour
- colour used mainly for semantic data, never decoration
- large confident typography
- soft depth (shadow) rather than borders
- generous but controlled corner radius
- photography provides the visual warmth
- one dominant visual object per screen
- selected states use strong fill inversion, not tint or outline
- floating mobile navigation
- one strong primary action
- compact information density
- mobile-first composition
- high-quality food imagery
- calorie progress represented visually
- supporting macro progress
- very little decorative UI

**Do not clone Cal AI literally.** Human Not Found's differentiating signals
must remain visible and legible:

- **% of meal ingredients already at home**
- **missing ingredients**
- **use-soon ingredients**
- **recommendation reasoning** ("Uses baby spinach and greek yogurt that should
  be eaten soon.")
- **household awareness** (two members, shared targets)

### 13.1 ⚠️ A correction inside the analysis document

`CAL_AI_VISUAL_ANALYSIS.md` §11 originally listed "calorie-centric hierarchy"
and "the macro triplet" as patterns *not* to adopt. **That was wrong and has
been corrected in the file itself.** The corrected reading: the *dish* stays the
largest object, but calorie and macro tracking absolutely belong on Today. If
you read a passage in that document arguing against calorie tracking, it is
superseded — see §14.

---

## 14. PRODUCT CORRECTION: CALORIE TRACKING STAYS

### 🔴 THIS IS NOT OPTIONAL. DO NOT REMOVE CALORIE TRACKING.

An earlier M3 direction pushed the design away from calorie tracking. That was a
mistake and the user corrected it explicitly. Calorie and nutrition tracking is
an intentional product feature.

### 14.1 Today must eventually communicate BOTH

**A — DAILY PROGRESS**
```
1,250 / 2,100 kcal      calories eaten
[progress ring]
Protein   Carbs   Fat
```

**B — TONIGHT'S MEAL DECISION**
```
[food photograph]
Recommended meal name
cook time · nutrition
94% ingredients available at home
1 missing ingredient
"Uses baby spinach and greek yogurt that should be eaten soon."
```

**The intended loop:**
```
Cook / log meal → meal calories added to today's progress
               → macros update
               → inventory updates
```

### 14.2 What exists today vs what is still missing

| Piece | Status |
|---|---|
| Calories consumed / target | **WORKING** — real, from `meal_logs` |
| Calorie progress ring | **WORKING** (visual design rejected) |
| Protein consumed / target | **WORKING** — real |
| Carbohydrates | **WORKING but DERIVED** — estimated from ingredients, marked `est.` |
| Fat | **WORKING but DERIVED** — same |
| Carb / fat targets | **NOT IMPLEMENTED — deliberately.** No target exists in the data model; inventing one by splitting the calorie goal would put fabricated numbers on screen |
| Logging a meal updates calories/macros | **WORKING** — covered by `tests/state-lifecycle.test.ts` |
| Logging a meal updates inventory | **WORKING** — `lib/kitchen/deduct.ts` |
| Per-member vs household nutrition view | **PARTIAL** — payload carries all three scopes (`household`, and one per member); the UI only renders `household` |

---

## 15. NAVIGATION DECISION

**MVP navigation — three tabs:**

```
Today   |   Plan   |   Kitchen
```

Plus **Scan as a prominent primary action, separate from the tabs** (currently a
black circular FAB beside the pill).

Settings / Household / Profile live **behind the avatar** in the Today header
(`/settings`). **Do not add a Profile tab.**

- The mobile experience must feel like a real mobile product.
- Desktop responsiveness is useful but **must not determine the mobile visual
  system.**
- **Primary design viewport for M3: 390 × 844.** Also check 393 × 852 and
  430 × 932.
- The current nav shell (`components/bottom-nav.tsx`) turns into a `lg:` left
  rail — this is part of what the user called "a website sidebar." It is fair
  game for replacement, and it has a real bug (§21 item 3).

---

## 16. SCREEN INTENT (contracts)

| Screen | Primary question |
|---|---|
| **Today** | "What should I eat tonight, and how am I doing today?" — nutrition progress **+** meal recommendation **+** kitchen intelligence |
| **Recipe** | "Should I cook this, and how do I make it?" |
| **Scan** | "What did we just buy?" |
| **Plan** | "What are we eating this week?" |
| **Kitchen** | "What do we have, and what needs attention?" |
| **Settings / Household** | "What household assumptions and preferences can I control?" |

There is no `SCREEN_CONTRACTS.md` or `DESIGN_QA.md` in this repo — those files
do not exist. This section is the contract of record.

---

## 17. FOOD IMAGERY

### 17.1 Where images actually come from

| Source | Status |
|---|---|
| Local committed food photography | **NONE.** `meals/public/` contains only `manifest.webmanifest`, three app icons, and `fixtures/trader-joes-receipt.png`. Verified with `find`. |
| `recipes.image_url` | **Always null.** 0 of 24 live rows have one. |
| `recipes.thumbnail_url` | **19 of 24 live rows have one** — real YouTube thumbnails |
| Seeded catalog (`lib/meals/catalog.ts`) | `image_url: null`, `thumbnail_url: null` — the seed ships with **no** imagery |
| Async enrichment | `POST /api/recipes/enrich` resolves thumbnails after first paint |

Thumbnails are `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg`, populated by
YouTube discovery (`lib/video/youtube.ts`), which needs `YOUTUBE_API_KEY`.

Representative live URLs (from the current recommendation batch
`5bb304a5-ba36-4b5b-944c-c370a9441b7d`, generated 2026-08-21 08:43 UTC):

```
Chicken Souvlaki Bowls        https://i.ytimg.com/vi/XWl-Lbxi_Vo/hqdefault.jpg
Tomato and Spinach Menemen    https://i.ytimg.com/vi/7NlQJ_FHSG8/hqdefault.jpg
Skillet Enchilada Bake        https://i.ytimg.com/vi/K8lDS_AtaUc/hqdefault.jpg
```

`next.config.ts` allows any HTTPS remote image host
(`remotePatterns: [{ protocol: "https", hostname: "**" }]`).

### 17.2 The previous environment blocker

The Claude Code sandbox could not reach **any** external image host —
`i.ytimg.com`, `img.youtube.com`, `images.unsplash.com`, `upload.wikimedia.org`
all returned HTTP 000. So every committed screenshot shows the *no-photograph*
state, and the previous agent wrongly concluded the product had no photography.

**It does.** If your environment can reach `i.ytimg.com`, your local screenshots
will show real food images and will look substantially different from every
screenshot in `design/qa/today/`. **Check this early** — run
`curl -sI https://i.ytimg.com/vi/XWl-Lbxi_Vo/hqdefault.jpg` before you start.

### 17.3 The real defect that was fixed — preserve it

`TodayPayload.latest_recommendation` was a hand-built object that stopped at
`image_url`. The alternatives pass a whole `Recipe` (which carries
`thumbnail_url`) and got their pictures; the hero did not, and `image_url` is
null on every row — so the hero showed a placeholder for dishes whose row
already held a photograph.

Fixed in `0a08031`: `src/lib/views/today.ts` now includes `thumbnail_url`, and
`today-view.tsx` passes it to `imageFor()`. Pinned by the test
`"hands the hero its stored thumbnail"` in `tests/state-lifecycle.test.ts`,
which was verified to fail against the old code.

**Preserve this behaviour.** If you replace the payload shape, make sure the
hero still receives `thumbnail_url`, and keep or adapt the guard test.

### 17.4 🚫 Do not rebuild the beige placeholder

`components/food-image.tsx` has a third tier that draws a beige "plate" motif
(concentric circles + cuisine name in small caps) when no image exists. An
earlier iteration made this a full 3:2 photographic-sized block; it dominated
the screen and said one word, and it was removed rather than improved.

**Do not recreate an empty beige plate, a gradient-as-food, or any decorative
stand-in for photography.** If there is no image, either use the real image that
almost certainly exists on the row, or design a state that does not pretend to
be a photograph.

---

## 18. CURRENT VISUAL QA

### 18.1 Artifact paths

| Artifact | Path | Exists? |
|---|---|---|
| Cal AI reference **images** | `design/references/` | ❌ **NO — not committed** |
| Cal AI written analysis | `design/references/CAL_AI_VISUAL_ANALYSIS.md` | ✅ 448 lines |
| Design system | `DESIGN.md` (repo root) | ✅ 181 lines |
| Today iteration log | `design/qa/today/ITERATIONS.md` | ✅ 291 lines |
| Final (rejected) Today | `design/qa/today/final.png` | ✅ |
| Iterations | `design/qa/today/calorie-fix-0{1,2,3,4}.png` (+ `-393`, `-430`) | ✅ |
| Prior round | `design/qa/today/iteration-0{1,2,3,4}.png` (+ `-393`, `-430`) | ✅ |
| Edge cases | `design/qa/today/edge-{long-title,100,50}.png` | ✅ |
| `SCREEN_CONTRACTS.md` | — | ❌ does not exist |
| `DESIGN_QA.md` | — | ❌ does not exist |

### 18.2 The quality gate and why it failed

The gate: **average ≥ 4.2 / 5, every critical category ≥ 4**, across ten
categories (hierarchy, primary action clarity, typography, spacing, visual
rhythm, image treatment, interaction clarity, mobile ergonomics, perceived
polish, product identity).

Final self-assessed scores for `calorie-fix-04.png`:

```
Hierarchy 4 · Primary action clarity 5 · Typography 4 · Spacing 4 ·
Visual rhythm 4 · Image treatment 2 · Interaction clarity 4 ·
Mobile ergonomics 4 · Perceived polish 4 · Product identity 4
→ Average 3.9 / 5 — FAIL
```

The previous agent concluded **image treatment was the only blocker**, because
its sandbox could not load the thumbnails.

### 18.3 🔴 The user's review overrides that conclusion

> **3.9 is not "close enough", and image treatment was not the only problem.**
>
> The user opened the actual deployed product — Today and Meals — and rejected
> the visual result. Their judgment supersedes the self-scoring entirely.
>
> **Do not assume any of these are solved:**
> hierarchy · spacing · polish · surface hierarchy · typography ·
> responsive behaviour · "only imagery remains"
>
> Reassess the entire Today composition from the rendered product.

---

## 19. WHAT IS WORTH PRESERVING

Inspected and judged sound. Keep unless you have specific evidence otherwise.

**Data + backend**
- `src/lib/db/supabase.ts` — including `adminFetch()`, which strips the
  `Authorization` header for new-format `sb_secret_` keys. **Do not "simplify"
  this**; without it PostgREST rejects every request with "JWT issued at future".
- `src/lib/db/local.ts`, `src/lib/db/index.ts` (backend selection + loud failure
  in deployed builds), `src/lib/db/plan-window.ts`
- `supabase/migrations/0001`–`0007`

**Domain logic**
- `src/lib/nutrition/engine.ts` (`totalsFor`, `targetsFor`, `logsForDay`,
  `macrosFor`, `portionsFor`, `roundServings`)
- `src/lib/nutrition/estimate.ts`, `src/lib/nutrition/sources.ts` (40-entry
  per-100g table with kcal/protein/carbs/fat)
- `src/lib/meals/rank.ts`, `candidates.ts`, `taxonomy.ts` (`selectDiverse`,
  `dishAxes`), `behavior.ts`, `source-quality.ts`, `enrichment.ts`,
  `recommend.ts`, `plan.ts`, `log.ts`, `memory.ts`, `catalog.ts`
- `src/lib/kitchen/*` — freshness, use-soon, matching, deduction, restock
- `src/lib/receipt/*` — parsing, normalization, validation, storage

**View payloads (contracts, not presentation)**
- `src/lib/views/today.ts`, `recipe.ts`, `recommendations.ts` — these encode the
  no-AI-on-mount rule and the persisted-set contract. Change shape if you must,
  but keep the guarantees.

**Client utilities**
- `src/components/use-enrichment.ts` — bounded polling (`MAX_ROUNDS = 4`),
  silent failure, `imageFor()` precedence `thumbnail_url ?? image_url`
- `src/lib/analytics.ts`, `src/lib/client-fetch.ts`, `src/lib/http.ts`,
  `src/lib/date.ts`

**Routing**
- The whole `src/app/**` route tree and all API handlers. Recipe id resolution
  is pinned by `tests/recipe-routing.test.ts`.

**Tests — all 313, especially**
- `tests/recipe-routing.test.ts` — every rendered link resolves + the
  `DEPLOYED_RECIPE_COLUMNS` schema-drift guard
- `tests/state-lifecycle.test.ts` — persisted state survives navigation; the
  hero-thumbnail guard; the calorie/macro day walk
- `tests/nutrition.test.ts` — serving maths, day totals, macro breakdown
- `tests/supabase-auth.test.ts` — the header-stripping behaviour above
- `tests/helpers.ts`, `tests/stubs/server-only.ts`

**QA harnesses** — `qa-today.mjs`, `qa-edge.mjs`, `qa-seed-day.mjs`.
`qa-seed-day.mjs` is worth keeping: it produces a populated day by calling the
app's own `POST /api/meals/log`, so screenshots show real arithmetic rather than
hand-written numbers.

---

## 20. WHAT YOU SHOULD FEEL FREE TO REPLACE

Nothing in this list is sacred. Preserve *functionality*; replace *presentation*.

- `src/components/today-view.tsx` — the entire Today composition
- `src/components/day-progress.tsx` — calorie ring and macro row **visuals**
  (keep the data contract in §10.4)
- `src/components/bottom-nav.tsx` — the whole navigation shell, the floating
  pill, the fade, the `lg:` left rail
- `src/components/food-image.tsx` — especially the beige-plate fallback tier
- `src/components/ui.tsx` — shared primitives, including `RecipePlate` (which
  duplicates `food-image.tsx`)
- `src/app/layout.tsx` — the app shell, `max-w-2xl` / `md:max-w-5xl` /
  `md:pl-56` responsive scaffold
- `src/app/globals.css` — all design tokens, type scale, spacing, animations
- `src/components/progress.tsx` — dead code; delete it
- All card/surface treatment, shadow language, radius scale, typography
  implementation, and responsive behaviour

---

## 21. KNOWN BUGS / DEBT

| # | Issue | Severity | Path | Likely cause | Status |
|---|---|---|---|---|---|
| 1 | Today visual design rejected by the user | **Critical** | `src/components/today-view.tsx`, `day-progress.tsx`, `bottom-nav.tsx` | Design derived from written analysis, not from the reference images; self-scored rather than human-reviewed | Open — this handoff exists to fix it |
| 2 | `npm run lint` fails: "ESLint couldn't find an eslint.config.(js\|mjs\|cjs)" | High | `meals/package.json` script `lint` | **ESLint is not installed at all** — no `eslint` in `devDependencies`, no `node_modules/eslint`, no `node_modules/.bin/eslint`, and no flat config anywhere in `meals/`. `npx eslint` fetches it on the fly, then fails on the missing config. There is effectively **no linting on this project.** | Open — verified by running it |
| 3 | Dead layout gutter at 768–1023px | High | `src/app/layout.tsx` (`md:pl-56`, `md:pb-8`) vs `src/components/bottom-nav.tsx` (`lg:` rail, fade `lg:hidden`) | Breakpoint mismatch: layout applies the 224px rail offset at `md`, but the rail itself only appears at `lg`. Between them content is pushed right by 224px with no rail, and `md:pb-8` removes the bottom-bar clearance while the floating pill still overlays content. | Open |
| 4 | `/today` returned HTTP 500 once on deployment `dpl_DCfV1SfhK1DAgcKpk8gqd46TP8Ja` (commit `9720770`), digest `3811849099` | Medium | `src/app/today/page.tsx` path | **Root cause never determined.** Runtime-log tools required interactive approval that was unavailable. Not reproducible — later deployments returned 200. | Open / intermittent — do **not** assume fixed |
| 5 | Two competing food-image components | Medium | `src/components/food-image.tsx` vs `RecipePlate` in `src/components/ui.tsx` | Recipe was never migrated onto `FoodImage` | Open |
| 6 | `src/components/progress.tsx` imported by nothing | Low | `src/components/progress.tsx` | Left behind by an earlier refactor. Verified by grep. | Open — delete |
| 7 | `GEMINI_API_KEY` is read by code but absent from `.env.example` | Low | `src/lib/ai/provider.ts` vs `meals/.env.example` | Gemini provider added after the example file was written | Open |
| 8 | Live `inventory_items` is empty (0 rows) | Medium (blocks visual work) | Supabase `inventory_items` | Likely `POST /api/inventory/reset` | Open — see §10.3 for how to repopulate |
| 9 | Only 11 of 24 live recipes have instruction steps | Medium | `recipes.instructions` | Generated recipes often arrive with a video but no written steps | Open |
| 10 | Root `README.md` is empty (0 bytes) | Low | `README.md` | never written | Open |
| 11 | Vercel SSO intercepts automated fetches of preview URLs | Medium | Vercel project protection setting | Deployment Protection = Vercel Authentication | Open — see §8.2 |
| 12 | Playwright Chromium path hard-coded to `/opt/pw-browsers/chromium` | Low | `qa-today.mjs`, `qa-edge.mjs` | Written for the previous sandbox | Open — change for your environment |
| 13 | Analytics events fire into nothing | Low | `src/lib/analytics.ts` | No provider connected; `NEXT_PUBLIC_ANALYTICS_ENABLED=false` | Known / accepted |
| 14 | Only the `household` nutrition scope is rendered | Low | `src/components/today-view.tsx` | Payload carries per-member scopes; UI ignores them | Open — product decision needed |

---

## 22. FAILED APPROACHES — DO NOT REPEAT

1. **Deriving the visual result from text rather than from the actual
   references.** `CAL_AI_VISUAL_ANALYSIS.md` was written from images that were
   then never committed. Subsequent work read the prose and produced something
   that satisfied the prose but not the eye. **Look at the images.**
2. **Self-scoring a UI the user found unacceptable.** Four iterations produced
   9/10 categories at 4+ and an average of 3.9, and the deployed result was
   still rejected on sight. Numeric self-critique is useful for catching
   regressions between iterations; it is not a substitute for human review.
3. **Removing imagery because imagery could not be loaded.** The sandbox
   couldn't reach image hosts, so an iteration removed the image band entirely
   and called the absence a design decision. The product had thumbnails on 19 of
   24 rows the whole time.
4. **Treating absence of imagery as a design direction.** The beige plate
   fallback grew to occupy a third of the viewport carrying one word.
5. **Moving away from calorie tracking.** A misreading of the reference analysis
   removed the calorie progress feature outright. The user reversed this. See §14.
6. **Shipping changes that compiled and tested clean but did not reach the
   reference quality bar.** `tsc` clean and 313 green tests say nothing about
   whether a screen looks good.
7. **Trusting automated QA without human visual review.** See 2.
8. **Letting desktop composition drive the mobile system.** The `md:`/`lg:`
   scaffold produced a sidebar-ish desktop layout, and bug #3 above shows the
   responsive scaffold was not even self-consistent.
9. **Adding a field to the `Recipe` type without a migration.** M3 attempt #1
   (`254515e`, tagged `failed/ux-m3-254515e`) did this; every recipe write
   400'd, dishes were dropped, and recipe links 404'd on the user's phone. Now
   guarded by `tests/recipe-routing.test.ts`.
10. **Deriving a displayed number arithmetically instead of reading it.** An
    early iteration computed "N missing ingredients" from the availability
    percentage — a fabricated number on the most important line of the screen.
    Read persisted data or omit the clause.

---

## 23. EXECUTION MODEL FOR CODEX

**Work one screen at a time. Do not redesign the whole app simultaneously.**

Start with **Today**. For each iteration:

```
1. inspect the reference images
2. implement
3. run the app locally
4. capture a real mobile screenshot at 390 × 844
5. compare side by side against the reference
6. critique honestly
7. fix
8. screenshot again
```

**Then stop.** Do not proceed to the next screen because an internal score
crossed a threshold. **Show the user the actual screenshots and wait for their
response.** Human screenshot review is the design gate.

---

## 24. TODAY — ACCEPTANCE CRITERIA

Today is not complete until **all** of these hold:

- [ ] Visually convincing at ~390 × 844
- [ ] Calorie progress is obvious at a glance
- [ ] The calorie progress ring is meaningful (reads as a dial, not a spinner)
- [ ] Protein, carbs and fat tracking is present
- [ ] Strong food photography is present and prominent
- [ ] The main meal is the visually dominant object
- [ ] "% at home" is easy to understand
- [ ] Missing ingredients are clear
- [ ] Recommendation reasoning is shown
- [ ] Today → Recipe navigation works (including ids containing `:`)
- [ ] Scan is easy to find
- [ ] Mobile navigation works
- [ ] **No desktop sidebar appears in the primary mobile layout**
- [ ] The layout does not look like generic web cards
- [ ] Screenshot quality is meaningfully closer to the supplied reference
- [ ] **The user has seen the screenshot and accepted it**

Plus, as regression gates:

- [ ] `npm test` — 313+ passing
- [ ] `npm run typecheck` — clean
- [ ] Unknown carbs/fat still render `—`, never `0g`
- [ ] A day with no logs still shows an empty ring reading 0
- [ ] The hero still receives `thumbnail_url`

---

## 25. NEXT IMPLEMENTATION ORDER

1. **Today** ← start here
2. Recipe detail
3. Receipt scanner
4. Plan
5. Kitchen
6. Household / settings
7. Onboarding + polish

**Why Today first:** it is the app's entry point (`/` redirects to `/today`), it
is the only screen the user has reviewed and rejected, and it is the only screen
that must hold all three product ideas at once — nutrition progress, the meal
decision, and kitchen intelligence. The visual system that survives Today will
define the tokens, surfaces, and navigation shell every other screen inherits.
Solving it anywhere else first means redoing it.

---

## 26. CODEX — FIRST TASK

> **Task: rebuild the Today screen to a consumer-grade mobile quality bar.**
>
> **Before writing code:**
> 1. Read this entire file (`CODEX_HANDOFF.md`).
> 2. **Ask the user for the Cal AI reference screenshots** — they are not in the
>    repo (§0.1). Commit them to `design/references/`. Do not start the visual
>    work without them.
> 3. Look at `design/qa/today/final.png` — this is the **rejected** current
>    state. Understand what is wrong with it.
> 4. Read `DESIGN.md` and `design/references/CAL_AI_VISUAL_ANALYSIS.md`, noting
>    the §13.1 correction about calorie tracking.
> 5. Run the app locally and open `/today` yourself.
>
> **Constraints:**
> - Preserve all functional and backend work listed in §19. Do not discard
>   working nutrition calculations, ranking logic, routing, or tests because the
>   presentation is being replaced.
> - Treat the current M3 Today UI as **rejected**. `today-view.tsx`,
>   `day-progress.tsx`, `bottom-nav.tsx` and `food-image.tsx`'s fallback tier are
>   all replaceable (§20).
> - **Restore/keep calorie + macro progress** on Today (§14). Honour the
>   nutrition contract in §10.4: measured vs estimated, `—` not `0g`, no
>   invented targets.
> - **Keep the household-intelligence signals**: % at home, missing ingredients,
>   use-soon, recommendation reasoning.
> - **Use the real food imagery.** 19 of 24 live recipes carry
>   `i.ytimg.com` thumbnails. Verify your environment can load them (§17.2).
>   Do not build another beige plate placeholder (§17.4).
> - If you add any field to the `Recipe` type, write and apply a migration
>   (§7.4).
> - Repopulate inventory first (§10.3) or Today will render the empty-kitchen
>   state.
>
> **Method:**
> - Work at 390 × 844 as the primary viewport; verify 393 × 852 and 430 × 932.
> - Run locally, capture real mobile screenshots each iteration
>   (`node qa-today.mjs <name>` writes to `design/qa/today/`).
> - Compare against the reference images each time. Critique honestly.
> - `npm run typecheck` and `npm test` must stay clean.
>
> **Stop condition:**
> - When Today meets the checklist in §24, **stop and show the user the
>   screenshots.** Do not begin the Recipe screen until the user accepts Today.
> - After the user accepts, push to `claude/meal-intelligence-ux-overhaul` to
>   produce a Vercel preview (§8.3) and give the user the URL.
>
> **Do not redesign the whole app.** Today only.

---

## 27. QUICK REFERENCE

```bash
# clone and set up
git clone https://github.com/xayaagent-art/ClaudeCode.git
cd ClaudeCode
git checkout claude/meal-intelligence-ux-overhaul     # HEAD = 6b8f4eb
cd meals
npm install
cp .env.example .env.local                            # fill in what you have

# develop
npm run dev                                           # http://localhost:3000/today

# verify
npm run typecheck                                     # clean
npm test                                              # 313 passing

# visual QA (production build, local store, mock provider)
npm run build
ALLOW_LOCAL_DB=true AI_PROVIDER=mock npx next start -p 3311
node qa-seed-day.mjs
node qa-today.mjs my-iteration-01
node qa-edge.mjs

# deploy a preview (existing project — never create a new one)
git push -u origin claude/meal-intelligence-ux-overhaul
```

| Thing | Value |
|---|---|
| App directory | `meals/` |
| Branch | `claude/meal-intelligence-ux-overhaul` |
| HEAD | `6b8f4ebdcd3ed2bb6c1e22865417abb62cb51e00` |
| Vercel project | `household-meal-intelligence` / `prj_giyooqI0DfZZ1GjXpxnbcAAXeaYF` |
| Vercel team | `team_Co6dRlh3QDoeaG7HWo7dlciQ` |
| Vercel root dir | `meals` |
| Live preview | `https://household-meal-intelligence-nefhtq87u-xayaagent-7097s-projects.vercel.app` |
| Branch alias | `https://household-meal-intelligence-git-14f2a6-xayaagent-7097s-projects.vercel.app` |
| Supabase project | `meal-intelligence` / `mrsnfrrpfldgayqdgesp` |
| Primary viewport | 390 × 844 |
