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
