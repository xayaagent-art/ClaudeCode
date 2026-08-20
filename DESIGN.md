# Human Not Found — design system

The visual direction, derived from the Cal AI reference screens supplied on
2026-08-20. The full reverse-engineering is in
[`design/references/CAL_AI_VISUAL_ANALYSIS.md`](design/references/CAL_AI_VISUAL_ANALYSIS.md);
this document is what we actually build.

This supersedes the earlier attempt, which was written without access to the
references and got the hierarchy wrong in three specific ways, recorded at the
end so we do not repeat them.

---

## The one-line brief

> A calm, photo-led, near-monochrome app whose largest element is always the
> food, and whose second-largest element is always the decision.

---

## 1. Principles

1. **The dish is the hero.** On any screen showing a meal, the photo and the
   dish name outrank everything else — including the date, the greeting, the
   nutrition, and the app's own name.
2. **Every metric is a label/value pair,** small grey label against large black
   value. The gap between them should feel almost too wide.
3. **No borders. Depth instead** — white cards, soft shadow, large radius.
4. **Black is the only action colour.** Buttons, selected states, the Scan
   action. There is no brand hue in the chrome.
5. **Colour means something or it is absent.** Use-soon amber, past-best red,
   good green. Nothing decorative.
6. **One dominant object per screen.** If two things compete, one is wrong.
7. **Say what the data means in one sentence,** near the data.
8. **Assume we are sometimes wrong** and make correcting us cheap and visible.
9. **Nothing developer-facing ever appears** outside `/settings/diagnostics`.

## 2. Typography

Five roles. Nothing between them.

| Token | Size / line | Weight | Colour | Use |
|-------|-------------|--------|--------|-----|
| `hero` | 38 / 42 | 750 | ink | The one number a screen is about |
| `title` | 28 / 33 | 700 | ink | Screen titles, onboarding questions |
| `dish` | 24 / 29 | 680 | ink | Dish names, card values |
| `item` | 17 / 23 | 600 | ink | Section titles, list item names |
| `meta` | 13 / 18 | 450 | ink-muted | Labels, timestamps, units |
| `label-cap` | 11 / 14 | 650, +0.08em, caps | ink-faint | Section openers |

Rules:
- Negative tracking (−0.02em to −0.03em) on `hero`, `title`, `dish`. None below.
- Units demote inline: `1250` at `hero` beside `/2500` at `meta`, same baseline.
- Tabular numerals wherever a number changes in place.
- Body prose is rare by design. If a screen needs a paragraph, question it.

**Not permitted:** a greeting at `hero` or `title` size. The largest text on
Today is the dish. This is the single rule the previous attempt broke.

## 3. Spacing

Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Gutter is **18px**.

- Between sections: 24–32
- Card padding: 14–16
- Label to value: 6–8
- Cards in a row: 10–12
- Stacked cards: 14
- Fade above a sticky footer: ~48

Two-speed rhythm: tight inside a container, generous between containers.

## 4. Surfaces

| Element | Radius |
|---------|--------|
| Chips, small controls | 12 |
| Cards | 18 |
| Sheet top corners | 26 |
| Buttons, pills, tab bar, FAB | full |

- White cards on a near-white ground.
- Soft shadow only: large blur, low opacity, slight downward offset.
- Hairline outline **only** where a shadow would be too heavy (small tiles,
  secondary buttons).
- **Break-out card**: the dominant card on a screen sits marginally wider than
  the column with a stronger shadow. Used at most once per screen, to mark the
  answer.

## 5. Colour

- Ground `#FAFAF7`, surface `#FFFFFF`, sunken `#F2F2ED`
- Ink `#171717`, muted `#6B6B66`, faint `#9A9A94`
- **Action: near-black.** Primary buttons, selected fills, Scan.
- Semantic only: warn (use soon), danger (past best), good (in stock / on hand)
- Food photography is the only other source of colour.

Selected state is **fill inversion** — black surface, white content. Never a
border, never a tint.

## 6. Imagery

- **Detail hero:** full-bleed, under the status bar, ~45% of screen height,
  overlapped by a sheet with a 26px top radius.
- **Today hero:** 3:2 inside the break-out card.
- **List thumbnails:** 1:1, ~88px, forming the card's left edge.
- **Overlay controls:** circular, translucent dark, 44px, white glyph.
- Three image states, always occupying the final dimensions so nothing reflows:
  `resolved` (photo, fades in) · `pending` (quiet shimmer) · `unavailable`
  (deliberate plate with the cuisine name — never broken-image chrome).

## 7. Navigation

```
[ Today ]  [ Plan ]  [ Kitchen ]  [ Profile ]      ( Scan )
       floating pill tab bar                        black FAB
```

- Floating white pill, inset from the edges, soft shadow, above the home
  indicator — an object on the page, not browser chrome.
- Icon over an 11px label. Selected: light filled rounded-rect behind the item.
- **Scan is a black circular FAB, not a tab.** It is the app's primary verb.
- Every scrollable screen ends with nav clearance. Nothing comes to rest behind
  the tab bar — this was a shipped defect once.

## 8. Buttons

| Kind | Treatment |
|------|-----------|
| Primary | Full-width, near-black, full radius, 56px tall, white 650 |
| Secondary | Same shape, white, hairline border |
| Paired | Secondary left and narrower; primary right and wider |
| Inline | Small dark pill inside a card |
| Quiet | Grey text, no container |

Primary actions stick to the bottom above the nav, with a fade above them.

## 9. Screen system

| Screen | Question it answers | Dominant element |
|--------|--------------------|------------------|
| Today | What are we eating tonight? | Dish photo + name |
| Scan | What did we just buy? | Camera + live labels |
| Recipe | Should I cook this, and how? | Hero photo, then `% at home` |
| Plan | What are we eating this week? | Photo-led day list |
| Kitchen | What needs attention? | Use soon |
| Profile | What has the household learned? | Cooked / waste-avoided pair |

Layouts for each are in the analysis document, section 12.

## 10. Motion

150–300ms, ease-out. Only where it carries meaning:
image settle, sheet rise, card replacement, one-day plan swap, receipt
processing. `prefers-reduced-motion` disables all of it.

## 11. Copy

Short, human, no hype. "Dinner tonight". "Use soon". "Just missing cilantro".
Never "AI-powered", never a model name, never a confidence score.

## 12. What the previous attempt got wrong

Recorded so the mistakes are cheap to avoid:

1. **A 34px greeting was the largest thing on Today.** "Good morning, Yash" won
   the page and pushed the food below the fold. The greeting is now gone
   entirely; the date is `meta`.
2. **Everything lived inside one enormous bordered card,** so nothing was
   dominant and the screen read as a form. Sections now sit on the canvas and
   exactly one card breaks out.
3. **The hero placeholder was a large empty rectangle** at 4:3 with no
   treatment, which read as a broken image. Placeholders are now deliberate and
   occupy the final dimensions.

And one non-visual lesson from the same failure, which matters more than any of
the above: **a migration file in the repository is not an applied migration.**
`upsertRecipe` writes the whole `Recipe`, so a new field is a breaking write
until the column exists in the deployed database. Adding a field to `Recipe`
now fails `tests/recipe-routing.test.ts` until the migration is applied and the
column list updated in the same change.
