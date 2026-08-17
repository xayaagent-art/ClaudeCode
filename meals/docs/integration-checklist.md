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
and recipe discovery beyond the built-in catalog (`lib/meals/discover.ts`).

| | |
| --- | --- |
| Environment variables | `OPENAI_API_KEY`, plus optional `OPENAI_MODEL` / `OPENAI_RECEIPT_MODEL` |
| Where to get it | <https://platform.openai.com/api-keys> |
| Free tier | No. Pay-as-you-go |
| Expected testing cost | ~**$0.02–0.05 per receipt** (one high-detail image + ~2–4k output tokens on a GPT-5-class model). A 20-receipt test run is under $1. `OPENAI_RECEIPT_MODEL` can point transcription at a cheaper model |
| Optional tuning | `OPENAI_TIMEOUT_MS` (default 60000), `OPENAI_MAX_ATTEMPTS` (default 3), `OPENAI_RETRY_BASE_MS` (default 1000) |
| Cost controls already built | Uploads are sniffed by magic bytes first, so a non-image never reaches the model. Images are sha256-hashed, so re-uploading the same photo never re-parses. Learned store mappings resolve known lines without a model call. Retries are limited to transient failures only — a bad image or a schema violation is never retried. No household history is sent with a receipt parse |
| How to validate | Set `AI_PROVIDER=openai` and `OPENAI_API_KEY`, scan a real receipt, then check the `receipt_telemetry` table for provider, model, latency, tokens, estimated cost, attempt count and confidence banding |
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
| `timeout` | Yes | Attempt exceeded `OPENAI_TIMEOUT_MS` |
| `api_error` | Yes | 5xx, connection reset, or anything unclassified |
| `partial` | n/a | Some lines dropped; the receipt is kept and marked `partially_parsed`, and the user is told how many are missing |

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

**Verified reachable:** `www.googleapis.com/youtube/v3/search` responds
`PERMISSION_DENIED: Method doesn't allow unregistered callers` — the wiring is
correct and only the key is missing.

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
