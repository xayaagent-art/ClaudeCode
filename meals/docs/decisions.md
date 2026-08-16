# Architecture decisions

Short records of the choices that would otherwise be re-litigated. Each one
states what was decided, why, and what it costs.

---

## 1. One `Database` interface, two adapters

**Decision.** Every persistence operation is declared in `src/lib/db/types.ts`.
Supabase and a local JSON file store both implement it, and `getDb()` picks
based on whether `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Nothing
outside `lib/db` touches a database.

**Why.** The core loop had to be buildable and demonstrable before a Supabase
project existed, and had to stay testable without one. Pushing the choice behind
one interface meant the receipt pipeline, ranking and logging were written once.

**Cost.** Two implementations to keep in sync, and the local store is genuinely
not a database — single writer, no transactions, no concurrent safety. It is
labelled as a development store in the Kitchen and Settings UI so it can never
be mistaken for the real thing.

---

## 2. The model matches; the code computes

**Decision.** A model may read a receipt image, normalise a product name, and
propose a recipe. It never produces a number the user sees as fact. Serving
sizes, calories, protein and daily totals come from `lib/nutrition/engine.ts`,
which is pure and has no dependencies.

**Why.** Free-form arithmetic from a language model is unverifiable and drifts
between runs. Nutrition tracking is worthless if the same meal logs differently
twice.

**Cost.** Recipe-level calories and protein in the built-in library are stored
values that a human has to maintain. Discovered recipes carry model estimates —
which is why their source type is recorded and shown.

---

## 3. Ranking is a declared weighted model, not a prompt

**Decision.** `lib/meals/rank.ts` scores every candidate on seven pure 0–1
factors with weights declared in code, and persists the factor breakdown with
each recommendation.

**Why.** "Ask the model to pick three dinners" is unexplainable and untestable.
With explicit factors, a bad recommendation can be traced to the factor that
caused it, and each rule the spec asked for — dietary safety, inventory, use-soon,
cooking time, variety — has a test that proves it moves the ranking.

**Cost.** The weights are a guess until there is real usage data. They are one
constant in one file, which is the point.

---

## 4. Post-processing may demote a classification, never promote one

**Decision.** After the parser returns, deterministic rules in
`lib/receipt/normalize.ts` can reclassify a line as `non_food` or `pet_food`,
but can never mark something `human_food` that the parser did not.

**Why.** The two failure modes are not symmetric. Missing a food item costs the
user one manual add. Adding hand sanitizer to meal inventory poisons the
recommender and destroys trust.

**Cost.** A keyword list that needs occasional additions.

---

## 5. Canonical names only strip known qualifiers

**Decision.** `canonicalName()` looks up the full stemmed name first, then peels
off leading words **only** while they are in a qualifier list (organic, red,
sliced, …). Everything after " with " is discarded as a modifier. The token
containment fallback additionally requires both names to share a head noun.

**Why.** The first implementation peeled off any leading words. Running the real
fixture through the real pipeline caught two products being silently merged:
"English Cheddar with Caramelized Onion" reduced to `onion` and absorbed
"Organic Red Onions"; "Creamy Tomato Basil Soup" reduced to `soup` and absorbed
"Tomato Feta Soup". Both would have quietly deleted food from the kitchen.

**Cost.** A qualifier list to maintain, and unusual product names fall back to
their full stemmed form — a miss, which is the safe direction.

---

## 6. Inventory deduction is use-counted, not per-meal

**Decision.** Cooking a meal does not step every ingredient down a level.
`usesPerStep()` decides how many uses a step takes from the recipe's quantity and
unit and the product's bulk; uses are counted from the event log back to the last
real status change.

**Why.** Stepping a two-pound bag of rice from Full to Some after one dinner
makes the kitchen wrong within a week, and a wrong kitchen makes every
recommendation wrong.

**Cost.** More moving parts than a naive decrement, and the thresholds are
heuristics. The event log makes them auditable and adjustable.

---

## 7. Every inventory change is an event

**Decision.** `inventory_events` records receipt additions, meal consumption
(including "used, but not enough to change status"), manual edits and undos,
with before/after status and a human-readable detail.

**Why.** Approximate state is only acceptable if it can be explained. It also
makes undo exact — it steps back precisely what a meal moved — and gives the
future "still have spinach?" prompt something to reason from.

**Cost.** Write volume. Trivial at household scale.

---

## 8. Offline receipt parsing is a labelled fixture, not a silent fake

**Decision.** Without `OPENAI_API_KEY`, `parseReceiptImage` returns the bundled
Trader Joe's fixture, tags the receipt `parser: "fixture"`, and the review screen
shows a banner saying it is not a reading of your photo.

**Why.** The loop needs to be walkable without credentials. Doing that silently
would be exactly the fake functionality the brief rules out.

**Cost.** One branch in the parser and a banner in the UI.

---

## 9. Server pages read directly; client islands mutate through the API

**Decision.** Page components are server components that call `getDb()` (via
`lib/views/*`) for first paint. Interactive pieces are client components that
call the documented API routes and then `router.refresh()`.

**Why.** No loading flash on the screens people open most, while keeping every
mutation on a real, testable HTTP surface rather than hiding it in a server
action. The `lib/views` modules exist so the page and the API route cannot drift.

**Cost.** A full refresh after a mutation rather than a surgical cache update.
At this data size it is imperceptible.

---

## 10. No recipe photography rather than borrowed or generated photography

**Decision.** Recipes without a real image render a typographic plate with the
cuisine name.

**Why.** Stock photos of the wrong dish are worse than no photo, generated food
imagery is misleading, and hotlinking someone's photography is not ours to do.

**Cost.** The recommendation screens are less appetising than the brief's
"food-forward" ambition. `image_url` is on the schema and rendered when present,
so a licensed image source drops in without changes.
