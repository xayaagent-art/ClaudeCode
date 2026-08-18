# External integration checklist

The single activation list. Every external dependency the product will
eventually use, what it is for, what happens without it today, and exactly what
is needed to turn it on.

**Principle:** nothing on this list is faked. Where a credential is missing the
app either uses a clearly-labelled mock (receipt parsing) or degrades visibly
(videos, nutrition). Mock and real modes never blend.

---

## Status at a glance

| Service | Purpose | Status | Blocks development? |
| --- | --- | --- | --- |
| Supabase | Real persistence + private receipt image storage | **Project live, schema applied.** Runtime key not in `.env.local` | No |
| Gemini | Receipt vision + dynamic meal candidate generation | **Key configured in Vercel Preview.** Needs `AI_PROVIDER=gemini` to activate | No — `AI_PROVIDER=mock` still works |
| OpenAI | Real receipt parsing, recipe discovery | Code complete, unexercised | No — `AI_PROVIDER=mock` |
| YouTube Data API v3 | Cooking videos on recipes | Code complete, unexercised | No — recipes show written steps |
| USDA FoodData Central | Branded/generic nutrition matching | Code complete, unexercised | No — built-in generic table |

---

## 1. Supabase

**Purpose.** Application state: households, members, nutrition profiles,
receipts, receipt items, inventory, inventory events, product mappings, recipes,
recipe ingredients, meal recommendations, meal logs, meal feedback, preference
signals, receipt telemetry. Also private storage for receipt images.

**Current status — project created and migrated.**

| | |
| --- | --- |
| Project | `meal-intelligence` |
| Ref | `mrsnfrrpfldgayqdgesp` |
| Region | us-west-1 |
| URL | `https://mrsnfrrpfldgayqdgesp.supabase.co` |
| Migrations applied | `0001`, `0002`, `0003`, `0004`, `0005` |
| Seeded | Household, both members, nutrition profiles, and the 16 starter inventory items. Recipes are **not** seeded — the catalog lives in `lib/meals/catalog.ts` and both adapters merge it in, so an empty `recipes` table is expected |
| Tables | 16, RLS enabled on all 16 |
| Functions | `upsert_product_mapping` |
| Storage | `receipts` bucket, **private** |
| Seed | Mehta household + Yash and Survi + nutrition profiles |

> `botanical-heritage` was left untouched, as instructed.

**What is still needed**

| | |
| --- | --- |
| Environment variables | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Where to get them | Dashboard → project → Settings → API |
| Why not automated | The MCP connector exposes publishable/anon keys only. The service-role key is never returned by the API, by design — it bypasses RLS |
| Free tier | Yes. Project creation cost was confirmed at **$0/month** |
| Testing cost | None |
| How to validate | Put both in `meals/.env.local`, run `npm run seed`, then `npm run dev`. Kitchen and Settings both show "Supabase" instead of "Local dev store" |
| Without it | The local JSON store under `.data/` is used. Fully functional for development; not viable on serverless, where `/tmp` is per-instance |

---

## 2. OpenAI

**Purpose.** Real multimodal receipt parsing (`lib/ai/providers/openai-provider.ts`)
and dynamic meal candidate generation (`lib/meals/candidates.ts`). Both go
through one client, `lib/ai/openai-call.ts`, on the Responses API with strict
Structured Outputs.

| | |
| --- | --- |
| Environment variables | `OPENAI_API_KEY`, plus `AI_PROVIDER=openai` to activate |
| Model overrides | `OPENAI_RECEIPT_MODEL`, `OPENAI_MEAL_MODEL`. All routing lives in `lib/ai/openai-models.ts` — no model id appears anywhere else |
| Model resolution | With no override the app asks `/v1/models` what this key can actually see and picks the best match per task, preferring the Luna/Terra ids and falling back through GPT-5 tiers. A marketing name is not an API id, and a guessed one 404s in a way that looks exactly like a broken integration — so nothing is guessed. The catalogue is fetched once per process |
| Where to get it | <https://platform.openai.com/api-keys> |
| Free tier | No. Pay-as-you-go |
| Expected testing cost | ~**$0.02–0.05 per receipt** (one high-detail image + ~2–4k output tokens on a GPT-5-class model). A 20-receipt test run is under $1. `OPENAI_RECEIPT_MODEL` can point transcription at a cheaper model |
| Optional tuning | `OPENAI_TIMEOUT_MS` (per attempt, default 30000), `OPENAI_BUDGET_MS` (all attempts, default 40000), `OPENAI_MAX_ATTEMPTS` (default 3), `OPENAI_RETRY_BASE_MS` (default 1000), `DYNAMIC_MEALS=off` for library-only recommendations |
| Reasoning | Both tasks run at `low`, overridable with `OPENAI_RECEIPT_REASONING` / `OPENAI_MEAL_REASONING`. Transcription wants `minimal` in principle, but the resolved vision model answers a 400 to that value, and at `low` a prompt with nothing to think about bills zero reasoning tokens anyway — so `low` is both cheap and accepted. A model that rejects the parameter entirely is detected from its 400 and retried without it, once per process |
| Cost controls already built | Uploads are sniffed by magic bytes first, so a non-image never reaches the model. Images are sha256-hashed, so re-uploading the same photo never re-parses. Learned store mappings resolve known lines without a model call. Retries are limited to transient failures only — a bad image or a schema violation is never retried. No household history is sent with a receipt parse. One vision request per receipt; one generation request per refresh, for ~14 candidates |
| How to validate | Set `AI_PROVIDER=openai` and `OPENAI_API_KEY`, then open `/settings/diagnostics/live?live=1` — it lists the models the key can see, what each task resolved to, and the result of one trivial live request. Scan a real receipt and check the `receipt_telemetry` table for provider, model, latency, tokens, estimated cost, attempt count and confidence banding |
| Without it | `AI_PROVIDER=mock` replays a bundled fixture, labelled in the UI as mock. With `AI_PROVIDER=openai` **and no key**, scanning fails with a clear error — it does **not** fall back to fixture data |

**Failure handling.** Every way a parse can fail has its own message and its own
answer to whether a retry is worth offering:

| Kind | Retry offered | Cause |
| --- | --- | --- |
| `invalid_image` | No | Bytes are not a decodable image. Caught before any spend |
| `unreadable` | No | A real image, but no purchasable lines on it |
| `truncated` | No | Receipt too long to transcribe in one reply |
| `schema_invalid` | Yes | Reply was not valid JSON, or every line failed the contract |
| `rate_limit` | Yes | Provider 429. Honours `Retry-After` |
| `timeout` | Yes | Attempt exceeded `OPENAI_TIMEOUT_MS`, or the whole call exceeded `OPENAI_BUDGET_MS` |
| `api_error` | Yes | 5xx, connection reset, or anything unclassified |
| `partial` | n/a | Some lines dropped; the receipt is kept and marked `partially_parsed`, and the user is told how many are missing |

---

## 2b. Gemini (Google Generative Language API)

**Purpose.** Receipt vision (`lib/ai/providers/gemini-provider.ts`) and dynamic
meal candidate generation (`lib/meals/candidates.ts`).

| | |
| --- | --- |
| Environment variables | `GEMINI_API_KEY`, plus `AI_PROVIDER=gemini` to activate |
| Model overrides | `GEMINI_RECEIPT_MODEL`, `GEMINI_RECEIPT_ESCALATION_MODEL`, `GEMINI_MEAL_MODEL`. All routing lives in `lib/ai/models.ts` — no model id appears anywhere else |
| Other tuning | `GEMINI_TIMEOUT_MS` (default 60000), `DYNAMIC_MEALS=off` to fall back to library-only recommendations |
| Defaults | receipts `gemini-3.5-flash-lite`; meal ideas and receipt escalation `gemini-3.6-flash` |
| How to validate | Settings shows `Receipt parser: Gemini vision (…)` and `Meal ideas: Gemini (…)`. Scan a receipt, then check `receipt_telemetry` for model, tokens, attempts, confidence banding and estimated cost |
| Without it | `AI_PROVIDER=mock` replays the bundled fixture and recommendations come from the stored library only. Real mode never falls back to fixture data |

**Cost policy, enforced in code**

| Rule | Where |
| --- | --- |
| Receipts read on the cheap model | `modelFor("receipt_parse")` |
| Escalation only when the cheap read genuinely failed — nothing returned, more lines dropped than kept, or confidence poor across the board | `shouldEscalateReceipt` |
| A failed escalation keeps the cheap result rather than losing the receipt | `GeminiProvider.parseReceipt` |
| One candidate-generation request per refresh, no tool loops | `generateMealCandidates` |
| Re-uploading the same photo never re-parses | image sha256 in `ingestReceipt` |
| Non-images never reach the model | `assertReadableImage` |
| Video search runs after ranking, on 3 dishes plus a small buffer — not on all 14 candidates | `recommendMeals` |
| A cooked dish is remembered, so it never needs generating or searching again | `logMeal` + `worthRemembering` |

> **Price table caveat.** The Gemini entries in `lib/ai/pricing.ts` are
> Flash-tier assumptions, not confirmed rate-card figures. They exist so
> relative cost per receipt is trackable. Set `AI_PRICE_INPUT_PER_MTOK` /
> `AI_PRICE_OUTPUT_PER_MTOK` once the real numbers are known.

---

## 3. YouTube Data API v3

**Purpose.** Finds a real cook-along video for each recommended recipe
(`lib/video/youtube.ts`), selected by a deterministic quality heuristic.

| | |
| --- | --- |
| Environment variable | `YOUTUBE_API_KEY` |
| Where to get it | Google Cloud Console → APIs & Services → Library → enable **YouTube Data API v3** → Credentials → Create credentials → API key. Restrict the key to that API |
| Free tier | Yes — 10,000 quota units/day, no billing required |
| Expected testing cost | $0. `search.list` costs 100 units and `videos.list` 1, so ~99 *new* dishes/day. Resolved sources are cached on the recipe permanently, so the 18-recipe catalog costs about 18 searches in total |
| How to validate | Set the key, tap **Find a meal**, open a recommendation. A real thumbnail and a **Watch recipe** button should appear, with channel attribution |
| Without it | No video block, written steps expanded by default, and the recommendations screen says videos aren't set up. No link or thumbnail is ever invented |

**Status: key configured in Vercel Preview.** Settings reports
`Cooking videos: YouTube (live)` when the provider can be called.

**Quota behaviour worth knowing.** Nothing is searched on a page load. Only
`POST /api/meals/recommend` (Find a meal) and `POST /api/recipes/:id/source`
(Find a different video) can spend quota, and the first resolves sources for
exactly the three recipes it is about to show. A resolved source is written back
onto the recipe, so re-opening a dish — any number of times — costs zero.

**Not yet exercised against the live key.** The sandbox this was built in cannot
reach `*.vercel.app` (the egress proxy refuses CONNECT) and the two quota-spending
routes are POST, so no live search has been made from here. Everything below the
network boundary is covered by tests using payloads shaped like real YouTube
results; the first real call happens when someone taps **Find a meal**.

---

## 4. USDA FoodData Central

**Purpose.** Branded and generic nutrition matching during stage-2 receipt
enrichment (`lib/nutrition/sources.ts`).

| | |
| --- | --- |
| Environment variable | `FDC_API_KEY` |
| Where to get it | <https://fdc.nal.usda.gov/api-key-signup.html> |
| Free tier | Yes — free key, 1,000 requests/hour |
| Expected testing cost | $0 |
| How to validate | Set the key, confirm a receipt, then expand a Kitchen item. The label should read "USDA branded match" rather than "Generic estimate" |
| Without it | The built-in generic table is used and every value is labelled **"Generic estimate"**. Unmatched items say "No nutrition match" rather than showing zero |

---

## Activation order (recommended)

1. **Supabase runtime keys** — biggest immediate gain: state stops being local
   and the app becomes usable across devices.
2. **OpenAI** — turns the receipt loop real. The only item with a running cost.
3. **YouTube** — free, and makes recipes genuinely cookable.
4. **USDA** — free, improves nutrition honesty.

## Environment modes

| Variable | Development | Real |
| --- | --- | --- |
| `AI_PROVIDER` | `mock` | `openai` |
| Persistence | local JSON, or Supabase if configured | Supabase |
| Video | unavailable, stated in UI | YouTube |
| Nutrition | built-in generic table | USDA FoodData Central |

`AI_PROVIDER` unset defaults to `mock`, or to `openai` when `OPENAI_API_KEY`
is present. Fixture data is unreachable in real mode.
