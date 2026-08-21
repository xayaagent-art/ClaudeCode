# Today — visual QA log

Route: `/today` · Primary viewport: 390 × 844 (also captured at 393 × 852 and
430 × 932) · Server: production build, local store, mock provider.

**Standing limitation:** every external image host is blocked from this
environment, so no real food photography could be sourced. Every screenshot
below shows the *no-photograph* state. The design has to survive that, and it is
scored on that basis — but image prominence cannot be honestly scored above a 3
until the design is re-shot with real photographs.

---

## Design plan

**Hierarchy:** dish photo + name → `% at home` → time/protein → why → Cook this
→ use soon → alternatives.

**Adopted from the reference:** break-out dominant card with a heavier shadow;
label/value pair with a large black value; borderless surfaces separated by
shadow; floating pill navigation with a separate black circular primary action;
photo-led rows with a square thumbnail forming the card's left edge.

**Deliberately different:** the hero is a dish, not a number — the number is
second. No seven-day strip (our unit is tonight, not a logged day). Two decision
signals instead of a macro triplet. Three tabs with Scan as the floating action,
not a fourth tab. No carousel over primary information.

---

## Iteration 01

`iteration-01.png` · `iteration-01-393.png` · `iteration-01-430.png`

**Observed.** The eye lands on a large empty beige plate, not on the dish. The
fallback occupies roughly a third of the viewport and carries one word.

Problems, in order of damage:

- **P1 — the placeholder dominates.** A 3:2 photographic block is right when
  there is a photograph and wrong when there is not; here it is the biggest
  element on the screen and it says almost nothing.
- **P1 — invented data.** The "N missing" figure was derived arithmetically
  from the availability percentage rather than read from the recommendation.
  It is a fabricated number on the most important line of the screen.
- **P1 — three competing numbers.** `94%`, `28` and `42` share a baseline row,
  so the availability figure does not read as dominant even though it is set
  larger.
- **P1 — content bleeds past the floating navigation.** "See more" from the
  section below shows through the transparent gutter beside the nav pill, which
  reads as a rendering fault. The reference fades content out under its nav.
- **P2 — the Tonight/date pair is loose** and sits in dead space above the card.

**Fixes planned for 02.** Collapse the no-photograph hero to a shorter band so
the dish name becomes the anchor; read the missing count from the persisted
recommendation or omit the clause; move time and protein into the meta line so
the availability block owns its row; add a ground-coloured fade behind the
floating nav; tighten the header.

**Scores.** Hierarchy 2 · Primary action clarity 4 · Typography 4 · Spacing 3 ·
Visual rhythm 3 · Image treatment 2 · Interaction clarity 4 · Mobile ergonomics
3 · Perceived polish 3 · Product identity 3. **Average 3.1 — fail.**

**Functional.** Today → recipe (Palak Paneer Bowls) ✓ · Plan 200 ✓ ·
Kitchen 200 ✓ · Scan 200 ✓ · Settings 200 ✓.

---

## Iteration 02

`iteration-02.png` (+ `-393`, `-430`)

**Fixed.** Missing count now read from the persisted recommendation (`1 to buy`
is real). Availability owns its own row; time and protein moved into the meta
line. No-photograph hero collapsed from 3:2 to 16:6. Fade added behind the
floating nav. Header tightened onto one line.

**New problems.**

- **P1 — the Scan action is washed out.** The fade is absolutely positioned and
  the nav row was not positioned, so the fade painted over it and reduced the
  black FAB to a ghost.
- **P1 — small tile truncates to "MEDI…"**, which reads as a fault.

**Scores.** Hierarchy 4 · Action 4 · Typography 4 · Spacing 4 · Rhythm 3 ·
Image 2 · Interaction 3 (Scan barely visible) · Ergonomics 4 · Polish 3 ·
Identity 4. **Average 3.5 — fail.**

---

## Iteration 03

`iteration-03.png` (+ `-393`, `-430`)

**Fixed.** `relative` on the nav row, so the FAB paints above the fade and is
solid black again. Compact tiles drop their label entirely — the dish name is
already beside them. Availability line shortened.

**Remaining.** The plate band is still the first thing the eye lands on: a
photographic-sized area carrying one word, above the dish name. Everything else
reads correctly, but the top of the card is dead weight.

**Scores.** Hierarchy 3 · Action 5 · Typography 4 · Spacing 4 · Rhythm 4 ·
Image 2 · Interaction 4 · Ergonomics 4 · Polish 3 · Identity 4.
**Average 3.7 — fail.**

---

## Iteration 04 — final

`iteration-04.png` (+ `-393`, `-430`) · copied to `final.png`

**Change.** When we know there will never be a photograph, the image band is
removed rather than filled. Section titles moved from small caps to sentence
case, matching the reference. A photograph — or the wait for one — still gets
the full 3:2 band, so this only affects the state where there is nothing to
show.

**Result.** The eye now lands on the dish name, then `94%`, then `Cook this`,
which is the intended order. Both alternatives clear the fold at 390 × 844.

**Edge cases** (`edge-long-title.png`, `edge-100.png`, `edge-50.png`): an
83-character dish name wraps to four lines with the card, the CTA and the fold
all intact; 100% and 50% availability both hold the layout.

**Scores.** Hierarchy 4 · Primary action clarity 5 · Typography 4 · Spacing 4 ·
Visual rhythm 4 · **Image treatment 2** · Interaction clarity 4 · Mobile
ergonomics 4 · Perceived polish 4 · Product identity 4.
**Average 3.9 — FAILS the gate (≥ 4.2 required, every critical category ≥ 4).**

**Why it fails, honestly.** Image treatment is a 2 because there is no imagery
on the screen at all. Every external image host is blocked from this
environment, so no photography could be sourced, and the most defensible answer
in that state turned out to be showing none. The reference screen derives most
of its warmth and roughly half its visual interest from a photograph; ours
cannot, and no further iteration of layout closes that gap. This is an input
blocker, not a composition problem — the same layout with real photographs in
the 3:2 band is a different screen, and would need re-scoring.

**Functional, verified every iteration.** Today → recipe ✓ · Plan 200 ✓ ·
Kitchen 200 ✓ · Scan 200 ✓ · Settings 200 ✓.

---

# Round 2 — calorie and macro tracking restored

Calorie progress was removed in round 1 on the strength of a reading of the
reference that turned out to be wrong. The visual analysis had listed
"calorie-centric hierarchy" and "the macro triplet" as patterns *not* to adopt,
on the argument that our hero is a decision and theirs is a number. That
argument holds for what should be *largest* on the screen, and it was wrongly
extended into an argument for dropping the tracking feature altogether.
Calorie and macro tracking is a feature of this product. Section 11 of
`CAL_AI_VISUAL_ANALYSIS.md` has been corrected rather than left to stand.

**Where the numbers come from.** Calories and protein are read from meal logs —
what the household recorded eating, summed by `totalsFor`. Carbohydrate and fat
have never been stored on a recipe row, so they are derived at read time from
the ingredient list by `estimateRecipeNutrition`, scaled by the servings each
log actually recorded, and are marked `est.` on screen. Nothing is invented: a
day with no logs shows an empty ring reading zero, and a dish whose ingredients
do not resolve shows an em dash rather than `0g`.

Carbohydrate and fat deliberately have **no target**. Deriving one by splitting
the calorie goal would have put two invented numbers on the screen for a
household that has not set those goals.

The screenshots are shot against a store filled by `qa-seed-day.mjs`, which logs
two meals through `POST /api/meals/log` — the same endpoint the app uses — so
every figure below is the app's own arithmetic over its own records.

## Iteration calorie-fix-01

`calorie-fix-01.png` (+ `-393`, `-430`)

Ring left, text right, macros on a flex row.

- **P1 — the ring reads as a loading spinner.** 52px, 5px stroke, round cap, no
  figure inside: the shape people have learned means "still working".
- **P1 — the ring is aligned to the card, not to the calorie figure**, so it
  floats beside the block rather than belonging to the number.
- **P2 — the macro row is a flex row with uneven label widths** (`CARBS est.`
  is wider than `PROTEIN`), so the three values start at three unrelated x
  positions and the row reads as a sentence rather than a readout.

**Scores.** Hierarchy 4 · Action 5 · Typography 3 · Spacing 3 · Rhythm 3 ·
Image 2 · Interaction 4 · Ergonomics 4 · Polish 3 · Identity 4.
**Average 3.5 — fail.**

## Iteration calorie-fix-02

`calorie-fix-02.png` (+ `-393`, `-430`)

Value left / ring right, the reference's hero pair. Ring aligned to that row
alone. Stroke raised to 7px on a 19px radius, track always drawn, `54%` set
inside. Macros moved onto a three-column grid above a rule.

**Remaining.** `85g / 250` carried no unit on the goal while the other two
columns did. `Carbs · est` put a middle dot where the reader expects a field
separator.

**Scores.** Hierarchy 4 · Action 5 · Typography 4 · Spacing 4 · Rhythm 4 ·
Image 2 · Interaction 4 · Ergonomics 4 · Polish 4 · Identity 4.
**Average 3.9 — fail.**

## Iteration calorie-fix-03

`calorie-fix-03.png` (+ `-393`, `-430`)

Units made consistent, `est.` set at 10px, lower sections tightened from `pt-9`
to `pt-7`. The `54%` was removed from the ring on the argument that the fraction
beside it already says the same thing three times.

**That was wrong, and the screenshot is why it is kept in the log.** With the
figure gone the arc read as a loading spinner again, exactly as in 01. The
heavier stroke was not sufficient on its own; the numeral is what makes it a
dial. Restored in 04, small enough to work as the arc's legend rather than as a
second headline.

**Scores.** Hierarchy 4 · Action 5 · Typography 4 · Spacing 4 · Rhythm 4 ·
Image 2 · Interaction **3** (ring ambiguous) · Ergonomics 4 · Polish 3 ·
Identity 4. **Average 3.7 — fail.**

## Iteration calorie-fix-04 — final

`calorie-fix-04.png` (+ `-393`, `-430`) · copied to `final.png`

Ring legend restored. The strip now reads: `2,028 / 3,750`, `calories · 1,722
left today`, a 54% dial, then `Protein 85g / 250g`, `Carbs est. 280g`,
`Fat est. 40g`. The dish name remains the largest text on the screen and
`Cook this` remains the only black pill.

Verified at 390 × 844, 393 × 852 and 430 × 932; at 430 the first alternative
clears the fold intact.

**Scores.** Hierarchy 4 · Primary action clarity 5 · Typography 4 · Spacing 4 ·
Visual rhythm 4 · **Image treatment 2** · Interaction clarity 4 · Mobile
ergonomics 4 · Perceived polish 4 · Product identity 4.
**Average 3.9 — still FAILS the gate (≥ 4.2, every critical category ≥ 4).**

**Image treatment, and a correction to round 1.** Round 1 concluded that the
product had no photography. That was wrong about the product and right only
about this sandbox. The deployed database holds 23 recipes, 18 of them carrying
real `i.ytimg.com` thumbnails, and every one of the 8 dishes in the current
recommendation set has one.

The reason none of it reached the screen was a defect, not a missing asset:
`TodayPayload.latest_recommendation` never carried `thumbnail_url`. The
alternatives pass a whole `Recipe` and got their pictures; the hero passed a
hand-built object that stopped at `image_url`, which is null on all 23 rows.
That is fixed.

Local screenshots still cannot show it — every external image host returns 000
from this sandbox — so **Image treatment is scored 2 on what was actually
observed here**, and the gate still fails on that one category. The deployed
behaviour is stated separately and verified separately, not folded into a score
for a screen nobody has seen.

---

## Verified on the deployed preview

`/today` on the preview build returns **200**, and the server-rendered HTML
carries what the local screenshots could not:

```
<div class="aspect-[3/2] …"><img src="https://i.ytimg.com/vi/k_U7Yj08kVs/hqdefault.jpg" …
```

Both alternatives carry theirs too (`sBfXW4nPJI8`, `3oA8HijO3jE`). So the
photographic layout is live even though it cannot be screenshotted from here.
**Image treatment is still scored 2 above**, because a score is for a screen
someone has looked at, and nobody has looked at this one.

The calorie strip renders against the household's real targets — `0 / 4,300`,
`Protein 0g / 150g`, `Carbs est. —`, `Fat est. —` — because nothing has been
logged today. An empty ring and two em dashes is the correct answer to a day
with no meals in it, and is what the screen should show rather than a
plausible-looking number.

One caveat recorded rather than smoothed over: `/today` on the *previous*
deployment returned a 500 when fetched on 20 Aug. It was observed once and
the root cause was never established — the runtime-log tools need an
interactive approval this session cannot obtain. The current deployment
returns 200, so it is not reproducible now; it is noted here in case it
returns.

Recipe routes are covered by `tests/recipe-routing.test.ts` and pass locally,
including the `gen-<cuisine>:<slug>` ids the hero links to. They could not be
confirmed against the deployment itself: Vercel's SSO protection answers
those fetches before the application does.
