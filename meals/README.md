# Meals — Household Meal Intelligence

A mobile-first PWA for a two-person household. It validates one loop:

> scan a grocery receipt → build a kitchen inventory → recommend meals from what
> is actually there → cook one → log it → nutrition and inventory update

Everything else is deliberately out of scope. There is no chat interface, no
social layer, no micronutrient dashboard, and no barcode scanning.

---

## Contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Supabase setup](#supabase-setup)
- [OpenAI setup](#openai-setup)
- [YouTube setup](#youtube-setup)
- [Nutrition data setup](#nutrition-data-setup)
- [The receipt pipeline](#the-receipt-pipeline)
- [Recipe discovery and the recipe experience](#recipe-discovery-and-the-recipe-experience)
- [The recommendation pipeline](#the-recommendation-pipeline)
- [Inventory deduction](#inventory-deduction)
- [Weekly planning](#weekly-planning)
- [API routes](#api-routes)
- [Tests](#tests)
- [Deployment](#deployment)
- [Current MVP limitations](#current-mvp-limitations)

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the app runs with none of it set
npm run dev                    # http://localhost:3000
```

With no environment configured the app still runs end to end:

| Missing | What happens instead |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | A JSON store under `.data/`, seeded with the Mehta household |
| `AI_PROVIDER` | Defaults to `mock` (bundled fixtures). Set `openai` for real receipt parsing |
| `OPENAI_API_KEY` | With `AI_PROVIDER=openai` and no key, scanning fails with a retryable error — it never falls back to fixture data |
| `YOUTUBE_API_KEY` | No cooking videos are looked up. Recipes show written steps and the UI says videos aren't set up — it never invents a link |
| `FDC_API_KEY` | Nutrition enrichment uses a built-in generic table, labelled "generic estimate" |

The Kitchen and Settings screens both show which of these are live, so it is
never ambiguous what you are looking at.

Other scripts:

```bash
npm test              # 79 tests: receipt, inventory, ranking, nutrition, discovery
npm run typecheck
npm run build
npm run seed          # seeds Supabase, or resets the local store
npm run fixture:render  # regenerates the fixture receipt image and PWA icons
```

### Walking the core loop locally

1. Open <http://localhost:3000/kitchen> at a phone-sized viewport.
2. Tap **Scan receipt** → **Choose from library**.
3. Pick `public/fixtures/trader-joes-receipt.png` (a real rendered receipt).
4. Review the two flagged items, then **Add 24 items to Kitchen**.
5. Go to **Today** → **Find a meal** → open a recommendation.
6. Tap **Ate this** and watch nutrition, history and inventory move.

---

## Architecture

Next.js 16 (App Router) + TypeScript + Tailwind v4, Supabase for Postgres and
Storage, OpenAI's Responses API for vision and discovery. One orchestration
layer, no autonomous agents.

```
src/
  app/                      routes + API handlers (thin; they validate and delegate)
  components/               UI. Server pages fetch, client islands mutate.
  lib/
    db/                     Database interface + Supabase and local adapters
    receipt/                schema, parser, normalisation, storage, service
    kitchen/                ingredient ⇄ inventory matching, deduction rules
    meals/                  recipe catalog, ranking, discovery, planning, logging
    nutrition/              deterministic engine, USDA + generic sources, enrichment
    household/              structured context builder
    ai/                     OpenAI client, internal tool surface
    views/                  read models shared by pages and API routes
  fixtures/                 Trader Joe's receipt fixture
supabase/migrations/        SQL schema
```

Five ideas hold this together.

**One database interface.** `src/lib/db/types.ts` defines every persistence
operation the app can perform. There are two implementations — Supabase and a
local file store — and nothing outside `lib/db` talks to a database directly.
Swapping backends is a one-line change in `getDb()`.

**AI matches, code computes.** A model may read a receipt image and normalise a
product name. It never does arithmetic the user sees. Calories, protein, serving
sizes and daily totals are computed by `lib/nutrition/engine.ts`, which is pure
and fully tested.

**Ranking is transparent, not prompted.** Recommendations come from a weighted
model in `lib/meals/rank.ts` with declared weights, not from asking a model to
pick. Each recommendation persists its factor breakdown so a bad suggestion can
be explained afterwards.

**Structured context, not prose.** `buildHouseholdContext()` produces one typed
object — members, targets, preferences, inventory, use-soon, recent meals,
feedback — and every consumer reads that. There is no giant free-form prompt.

**Narrow tools.** `lib/ai/tools.ts` is the complete list of operations a
model-driven path may perform. No caller gets arbitrary table access.

### Design system

Tokens live in `src/app/globals.css` under `@theme`: warm off-white ground
(`#fafaf7`), near-black ink (`#171717`), one muted green accent (`#3f6b4e`),
8-point spacing, Geist. Cards are reserved for things that behave like objects —
a recipe, a receipt line needing review. Statistics are typography and space, not
containers. Semantic colour is never the only signal; expiry and inventory state
always carry a text label too.

---

## Modes

One switch, `AI_PROVIDER`, decides whether the app talks to real models. The two
modes never blend.

| | `AI_PROVIDER=mock` | `AI_PROVIDER=openai` |
| --- | --- | --- |
| Receipt parsing | bundled fixture, labelled in the UI | real multimodal parse of your photo |
| Parse failure | n/a | recoverable error with Try again — **never** fixture data |
| Cost | none | one image + ~2–4k output tokens per receipt |
| Persistence | local JSON store, or Supabase if configured | Supabase when configured |

Unset defaults to `mock`, or to `openai` when `OPENAI_API_KEY` is present.

---

## Supabase setup

1. Create a project.
2. Run the migrations in order (SQL editor, or `supabase db push`):
   - `0001_init.sql` — schema, private `receipts` bucket, RLS on every table
   - `0002_recipe_sources.sql` — recipe source/video fields, preference signals
   - `0003_real_receipts.sql` — image hashing, product mappings, parse telemetry

   All three are additive and idempotent (`add column if not exists`,
   `create table if not exists`), so re-running them is safe and no existing
   data is dropped.
3. Run `supabase/seed.sql` for the household and profiles.
4. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
5. `npm run seed` to add the starter inventory (dates are relative to today,
   which is why it is a script rather than SQL).

**Auth.** The MVP is single-household and talks to Postgres from server routes
using the service role, which bypasses RLS. The policies exist so that adding
real auth later means adding membership checks, not rewriting the data layer.
The service-role key is server-only and is never sent to the browser.

---

## OpenAI setup

Set `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-5`; any Responses API
model with image input and structured outputs works.

The API is used in exactly two places:

- **Receipt vision** (`lib/receipt/parse.ts`) — one call, strict JSON schema,
  validated with zod before anything is persisted.
- **Recipe discovery** (`lib/meals/discover.ts`) — only when the built-in
  library cannot cover the kitchen. Web search is enabled here (disable with
  `RECIPE_WEB_SEARCH=off`) because knowing what a dish really is beats inventing
  one. Nothing is reproduced verbatim: the model returns ingredients, metadata
  and its own concise method, and the source URL is stored and shown.

Discovery failures are swallowed by design — a recommendation request must never
fail because an optional enhancement did.

---

## YouTube setup

Cooking videos come from the **YouTube Data API v3**.

1. <https://console.cloud.google.com/> → create or select a project
2. APIs & Services → Library → enable **YouTube Data API v3**
3. APIs & Services → Credentials → **Create credentials → API key**
4. Restrict the key to the YouTube Data API v3
5. Put it in `.env.local` as `YOUTUBE_API_KEY`

**Quota.** 10,000 units/day on the free tier, no billing required. `search.list`
costs 100 units and the follow-up `videos.list` costs 1, so roughly 99 *new*
dishes per day. Because a resolved source is cached on the recipe permanently,
the built-in catalog costs about 18 searches in total and then nothing.

Without the key the app degrades honestly: no video block, written steps
expanded by default, and a line on the recommendations screen saying videos
aren't set up. It never fabricates a link or a thumbnail.

---

## Nutrition data setup

Set `FDC_API_KEY` from [FoodData Central](https://fdc.nal.usda.gov/api-key-signup.html).

Matching hierarchy, most trustworthy first:

1. USDA branded match → `high` confidence
2. USDA generic (Foundation / SR Legacy) → `medium`
3. Built-in generic table → `medium`, shown as "generic estimate"
4. Unmatched → shown as "no nutrition match", never as zero

The source and confidence are stored per item and surfaced in the Kitchen, so a
generic estimate is never presented as a reading of the actual product. There
are no fabricated precisions like 97.238%.

---

## The receipt pipeline

```
photo → POST /api/receipts/parse
          ├─ private storage upload         (lib/receipt/storage.ts)
          ├─ vision call, strict JSON schema (lib/receipt/parse.ts)
          ├─ zod validation
          └─ deterministic post-processing   (lib/receipt/normalize.ts)
      → review screen (/kitchen/review/[id])
      → POST /api/receipts/[id]/confirm  → inventory  ← stage 1 ends here
      → POST /api/nutrition/enrich       → nutrition  ← stage 2, non-blocking
```

Post-processing is a safety net, not a second parser. It may only **demote** a
line's classification (food → non-food/pet), never promote one, so a model
mistake can leave food out of planning but cannot sneak hand sanitizer in. It
also drops register lines (`BAG FEE`, `SUBTOTAL`), title-cases names, and never
touches `raw_name` — that is the audit trail back to the paper.

Items are bucketed for review by confidence: high-confidence food goes straight
to **Ready to add**, anything ambiguous or low-confidence goes to **Needs
review**, and non-food and pet food are listed as **Not going to the kitchen**
but stay attached to the receipt. You never have to approve items one by one.

**Privacy.** Receipt images are stored in a private bucket (or outside the
served directory locally), streamed through `GET /api/receipts/[id]/image` with
`Cache-Control: private, no-store`, never given a public URL, and deletable via
`DELETE /api/receipts/[id]`, which removes the bytes.

### The fixture

`public/fixtures/trader-joes-receipt.png` is rendered from
`fixtures/trader-joes-receipt.html` by `npm run fixture:render` and is committed,
so you can feed a real image through the real pipeline. It deliberately contains
a smudged price, an abbreviated ambiguous line, two identical lines, a hand
sanitizer, a can of dog food, and a bag fee.

`src/fixtures/trader-joes-receipt.ts` holds the expected structured result. It is
a regression fixture only — the parser is not written around those strings, and
the behaviours the tests pin down are general.

---

## Store-specific learning

Receipts repeat. The same household buys the same abbreviated lines from the
same shops, so before trusting a model's normalisation the pipeline checks
`product_mappings` for a known answer.

- **Lookup order:** merchant-scoped mapping → store-agnostic mapping → model output.
- **Trust:** a user correction is authoritative immediately. A model-derived
  mapping only becomes trusted at confidence ≥ 0.9 after being seen twice.
- **Learning:** renaming or reclassifying a line in Receipt Review writes a
  mapping keyed on `(merchant, raw_name)`. The next receipt from that shop
  resolves the line without a model call and without landing in Needs Review.

Nothing is retailer-specific — the merchant is just a normalised key.

## Cost control

- The uploaded image is **hashed before anything else**. Re-uploading the same
  photo returns the previous result instead of paying to parse it twice.
- Known store mappings are applied after the parse, so corrections reduce future
  review work rather than future spend on the same line.
- No household history is sent with a receipt parse; the parser's job is to read
  the paper.
- `OPENAI_RECEIPT_MODEL` lets transcription run on a cheaper model than recipe
  discovery.
- Every real parse writes a `receipt_telemetry` row: provider, model, latency,
  token counts, estimated cost, and the item/ready/review/excluded breakdown.
  It stores **no prompt text and no image content** — only the error class name
  on failure.

## Recipe discovery and the recipe experience

A recommendation is only useful if you can actually cook it, so each of the
three suggestions carries a real, watchable source.

```
recommendation picked → RecipeDiscoveryService
    A. already-normalized catalog / saved recipe   ← free, no network
    B. sources this household already cooked from  ← free, no network
    C. trusted external video (YouTube)            ← costs quota, once per dish
    D. adaptation of an existing recipe            ← discover.ts
    E. generation                                  ← discover.ts
→ source cached on the recipe → reused forever
```

**Cost control.** External search happens when a recommendation set is built, for
those three recipes only, and never on a recipe view. A resolved source is
written back onto the recipe row, so the 18-recipe catalog costs roughly 18
searches in total and then nothing. Re-resolving is an explicit user action
(`POST /api/recipes/[id]/source?force=true`).

**Choosing the source.** `meals/source-quality.ts` is a deterministic heuristic —
no model picks the video. It disqualifies outright on dietary conflict (a
"…with Chicken" title for a household that doesn't eat chicken) and on dish
mismatch, then scores title relevance, duration fit (a 45-second clip and a
40-minute vlog are both wrong), cuisine mention, recipe framing, reach and
thumbnail availability. The chosen source stores its `score` **and its
reasons** on the recipe so a bad pick can be explained later. That score is
internal: the UI never shows a fabricated quality number.

**Video-first detail screen.** When a video exists the page leads with the real
thumbnail, the recommendation reason, both members' portions, ingredients you
have and are missing, then a Watch block with **Watch recipe** as the primary
CTA and **View steps** as a secondary. Steps start collapsed so the page reads
as "watch this", not as a recipe blog. With no video, steps are expanded by
default and nothing about a video is shown.

**Copyright.** No external article text is stored or displayed. The app keeps
attribution, the source URL, structured ingredients, and its own concise steps,
and links back to the original.

**Images.** Priority is YouTube thumbnail → source-provided image → the
typographic plate. Nothing is hotlinked from image search and no food photography
is generated.

## The recommendation pipeline

```
buildHouseholdContext()  →  eligibility filter  →  weighted scoring  →  diversify  →  3
```

**Eligibility** is a hard gate, never a soft score: dietary restrictions,
allergies, and ingredients a member depends-on-and-dislikes. A disliked
ingredient only disqualifies a recipe when the recipe actually needs it — Survi
disliking olives does not rule out a salad that lists them as optional.

**Scoring** (weights in `lib/meals/rank.ts`, summing to 1):

| Factor | Weight | What it measures |
| --- | --- | --- |
| Nutrition fit | 30% | Protein density against the household's targets, plus the calories left in the day |
| Inventory fit | 25% | Share of ingredient weight on hand; optional ingredients count half |
| Preference fit | 15% | Cuisine match, minus optional disliked ingredients |
| Expiry priority | 10% | Whether it rescues something about to go off, weighted by urgency |
| Time fit | 10% | Against the household's shortest max cooking time |
| Variety | 5% | Recency of the same recipe or cuisine, softened by repeat tolerance |
| Feedback | 5% | Prior ratings for the recipe, then for its cuisine |

Results are then diversified (at most two of the same cuisine in a set of three).
Every recommendation is written to `meal_recommendations` with its full factor
breakdown for debugging.

**Recipe sources**, in order: the built-in library (18 original recipes across
Indian, Mediterranean, Greek and Mexican, vegetarian with eggs and one chicken
dish), then discovery, then generation. Discovery only runs when fewer than
three library recipes clear the availability floor.

---

## Inventory intelligence

The household should not be maintaining a digital pantry by hand. The system
keeps a *probabilistic* view of what is probably still there, and only asks when
the answer would change something.

**State is event-sourced.** `inventory_events` records every transition —
`receipt_added`, `meal_consumed`, `restocked`, `manual_adjustment`, `marked_low`,
`marked_out`, `expired`, `undo_meal`, `system_inference`, `user_confirmation` —
so any status can be replayed and explained (`lib/kitchen/state.ts`).

**Status carries confidence.** Users still see only Full / Some / Low / Out.
Internally each item has a `status_confidence` and a `status_source`: watching
something arrive on a receipt (0.95) is stronger than inferring it from a cooked
meal (0.7), and a human confirmation (1.0) beats both. Confidence decays with a
14-day half-life, because a guess from three weeks ago says little about today.

**Freshness is an estimate, never a timestamp.** `lib/kitchen/freshness.ts`
classifies products into broad food categories — leafy greens, berries, dairy,
fresh meat, prepared chilled, bakery, frozen, canned, pantry staple — and says
"Likely good for about 2 more days", not "Expires Tuesday at 4pm". Items past
their window are "Probably past its best", and the system is deliberately
conservative.

**Restocks refill, they do not duplicate.** Buying spinach when spinach is Low
returns that item to Full; buying it when there is plenty tops up the quantity.
Two genuinely different products — Baby Spinach and Organic Baby Spinach — stay
separate rows, because identity is canonical name *and* product name.

**The household teaches the estimates.** `lib/kitchen/signals.ts` derives
purchase frequency, average days-to-empty, repurchase interval, meal usage and
waste from the event log. If this household always finishes yogurt in four days,
the shelf-life estimate shortens. It never lengthens past the category default —
optimism about freshness is the unsafe direction.

**Asking is rationed.** `lib/kitchen/confirmations.ts` produces at most two
questions and only for reasons that matter: a recommendation depends on
uncertain stock, something is probably past its best, an inferred status has hit
near-zero, or confidence has gone stale on a perishable. Routine check-ins on
confident items are never generated, and nothing is re-asked within five days.

Ranking consumes all of this: `available_high_confidence`, `available_uncertain`,
`low` and `out` are distinct, low confidence discounts a match rather than
erasing it, and use-soon boosts relevant recipes. Hard dietary filters are
untouched by any of it.

## Inventory deduction

Inventory is approximate on purpose: four states (Full → Some → Low → Out), no
grams.

Cooking a meal does not automatically empty a package. How many uses it takes to
step an item down depends on how much the recipe calls for and how bulky the
product is — a teaspoon of cumin takes eight uses, a can of chickpeas takes one,
a bag of rice takes four. Uses are counted from the inventory event log back to
the last real status change. An item whose match confidence is below 0.6 is
never deducted at all.

Every decision — including "used, but not enough to change status" — is written
to `inventory_events`, so the state is always auditable and **Undo** can step
back exactly what a meal moved.

---

## Weekly planning

`POST /api/plans/generate` lays out seven dinners that share a shopping trip
rather than seven unrelated recipes. Each day scores the full library again with:

- a bonus for reusing ingredients already committed earlier in the week,
- a bonus for batch-cooking recipes, which push leftovers onto the next day's lunch,
- fatigue penalties for repeating a cuisine or a protein within three days,
- a use-soon bonus that decays after the first days, because spinach bought today
  will not still be good on Friday.

Days can be swapped to leftovers or eating out from the Plan screen.

---

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/receipts/parse` | Upload and parse a receipt image |
| `GET`/`DELETE /api/receipts/[id]` | Read a receipt; delete removes the stored image |
| `GET /api/receipts/[id]/image` | Private, no-store image stream |
| `PATCH /api/receipts/[id]/items/[itemId]` | Correct a parsed line |
| `POST /api/receipts/[id]/confirm` | Turn reviewed lines into inventory |
| `POST /api/nutrition/enrich` | Stage-2 nutrition matching |
| `GET`/`POST /api/inventory`, `PATCH`/`DELETE /api/inventory/[id]` | Kitchen CRUD |
| `POST /api/meals/recommend` | Three ranked recommendations, each with a resolved source |
| `POST /api/recipes/[id]/source` | Explicitly (re)resolve a recipe's video source |
| `GET`/`POST /api/signals` | Household preference signals |
| `GET /api/recipes/[id]` | Recipe with availability and household portions |
| `POST /api/meals/log`, `POST /api/meals/log/undo` | Log a meal, undo it |
| `POST /api/meals/feedback` | Love it / Fine / Don't recommend |
| `GET`/`PUT /api/plans`, `POST /api/plans/generate` | Weekly plan |
| `GET /api/today` | Everything the Today screen needs |
| `GET`/`PATCH /api/household` | Members, profiles, and which services are live |

Errors return a plain `{ "error": string }` written for a person. Provider
messages and stack traces stay in the server log.

---

## Tests

```bash
npm test
```

60 tests across four files, covering what the spec calls out:

- **Receipt** — schema validation, raw names preserved, register lines dropped,
  non-food and pet food excluded, ambiguous lines routed to review, missing
  prices tolerated, duplicate lines kept distinct, and two regressions found
  during the build (see below).
- **Inventory** — receipt confirmation creates items and events, `out` items are
  not available, meal logging deducts safely, bulk staples resist deduction,
  low-confidence matches are left alone, undo restores what it moved, manual
  edits work.
- **Recommendation** — dietary restrictions respected, inventory / use-soon /
  cooking time each move the ranking, feedback and variety applied, weekly plan
  is varied and front-loads short-dated produce.
- **Nutrition** — serving multiplication deterministic, daily calorie and protein
  totals correct per member and for the household.

Two matching bugs were caught by running the real fixture through the real
pipeline and are now pinned by tests: "Creamy Tomato Basil Soup" collapsing into
"Tomato Feta Soup", and "English Cheddar with Caramelized Onion" swallowing
"Organic Red Onions". Both came from canonicalisation that was too eager to
strip words, which is why `canonicalName` now only strips known qualifiers and
treats everything after "with" as a modifier.

---

## Deployment

**Canonical Vercel project: `household-meal-intelligence`.**

| | |
| --- | --- |
| Repository | `xayaagent-art/ClaudeCode` |
| Root directory | `meals` |
| Framework | Next.js (auto-detected) |
| Supabase project | `meal-intelligence` (`mrsnfrrpfldgayqdgesp`) |

Required server-side variables, in **both** Production and Preview:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Vercel scopes environment variables per environment. Branch pushes build as
**Preview**, so variables added only to Production will not reach them — the
deployment will return 503 with the two variable names until Preview has them
too.

**A deployed build will not fall back to local JSON.** The local store writes to
`/tmp`, which on serverless is per-instance and vanishes between requests, so
`getDb()` throws `PersistenceNotConfiguredError` rather than pretending to
persist. Set `ALLOW_LOCAL_DB=true` only to run a production build locally.

The app is installable: `public/manifest.webmanifest`, maskable icons, standalone
display, and shortcuts to Scan receipt and Find a meal. Camera capture uses a
native file input with `capture="environment"`.

**On Vercel the local file store is not viable** — `/tmp` is per-instance and
ephemeral. Configure Supabase for any deployment you intend to use.

---

## Current MVP limitations

Known and deliberate:

- **No authentication.** One seeded household, service-role access from server
  routes. RLS policies are in place for when auth arrives.
- **No invented recipe photography.** Images come from the chosen video source
  or not at all; recipes without a resolved source get a typographic plate.
- **Inventory is approximate** and always will be at this fidelity. There is no
  periodic "still have spinach?" prompt yet — the event log is the groundwork
  for it.
- **The local store is single-writer.** It re-reads on file change so Next's
  server workers stay consistent, but it is a development convenience, not a
  database.
- **Nutrition enrichment is sequential** and capped at 60 items per call. Fine
  for one receipt, not for a bulk backfill.
- **Plan covers dinners only**, plus leftovers lunches. Breakfast and lunch
  planning are not built.
- **Analytics are fired but not delivered.** Events are defined in
  `lib/analytics.ts` and gated behind `NEXT_PUBLIC_ANALYTICS_ENABLED`; no
  provider is connected. Preference signals are separate and always persisted
  to `preference_signals`, but nothing reads them for ranking yet.
- **Videos need `YOUTUBE_API_KEY`.** Without it every recipe falls back to
  written steps and a typographic plate, and the recommendations screen says so.
- **Only YouTube is wired.** `lib/video/provider.ts` is provider-agnostic;
  Instagram and recipe-site scraping are deliberately not built.
- **The offline fixture parser returns the same receipt regardless of the image
  you upload.** It exists so the loop is exercisable without an API key and is
  labelled as such everywhere it appears.
