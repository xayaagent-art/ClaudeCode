# Cal AI — visual analysis

Reverse-engineered from five screens supplied on 2026-08-20:

| # | Screen | What it is |
|---|--------|-----------|
| 01 | Home dashboard | Date strip, calorie hero, macro triplet, recent meals |
| 02 | Camera scan | Live camera with floating detection labels |
| 03 | Food detail | Full-bleed dish photo, result sheet, sticky actions |
| 04 | Progress | Weight + streak pair, trend chart, averages |
| 05 | Onboarding | One question, large answer cards, sticky Continue |

**On measurement.** The screenshots are device captures without a rendered
scale, so nothing below is a true pixel value. Ratios *are* reliable — a card's
height against screen width, a gap against a gutter — so sizes are given as
proportions and as the pt value they imply on a 393pt-wide iPhone. Treat every
number as "about", and treat the ratios as the actual finding.

---

## 1. Visual principles

Six rules explain almost everything in these screens.

**1. Label/value contrast does the hierarchy.** Every metric is a pair: a small
grey label and a large near-black value, with an unusually wide gap between
them — roughly 13px grey regular against 28–40px black bold. There is very
little in between. This is why the screens read instantly: your eye lands on
values, and labels are available without competing.

**2. No borders. Depth instead.** Cards are white on white-ish, separated by a
soft low-opacity shadow and a large radius. I could not find a single 1px
divider box in these five screens. The one exception is hairline outlines on
the smallest metric tiles and the secondary button, where a shadow would be too
heavy.

**3. Black is the only brand colour.** Primary buttons, selected states, the
FAB, chart projections, tooltips — all near-black. There is no product hue.

**4. Colour is reserved for data semantics.** Red/orange/blue appear only as
macro identity; orange only for the streak; green only for "good" trend and the
encouragement strip. Colour never decorates a container.

**5. Photography carries all the warmth.** The chrome is monochrome precisely so
the food can be the only colourful thing. On the detail screen the photo runs
full-bleed to the top of the device.

**6. One dominant object per screen.** Home has the calorie card. Detail has the
calories card. Onboarding has the question. Everything else is visibly
secondary — smaller, lighter, or literally behind a carousel.

---

## 2. Typography system

Five roles, and the gaps between them are large. Sizes below are estimated
against screen width.

| Role | Est. size | Weight | Colour | Where |
|------|-----------|--------|--------|-------|
| Hero value | 38–42px | 700–800 | near-black | "1250" |
| Screen title / question | 28–34px | 700–800 | near-black | "Progress", the onboarding question |
| Card value | 24–30px | 700 | near-black | "330", "132.1 lbs", "2861" |
| Item / section title | 16–18px | 600–700 | near-black | "Ingredients", "Recently uploaded", dish names |
| Label / meta | 12–14px | 400–500 | mid-grey | "Calories eaten", "Goal 140 lbs", timestamps |

Observations worth copying:

- **Tight tracking on large text.** The big numbers and the onboarding question
  are noticeably negatively tracked; the small greys are not.
- **Inline unit demotion.** "1250" is huge, "/2500" beside it is small and grey.
  The pair sits on one baseline. Same with "2861 cal ↑90%".
- **Almost no mid-size prose.** The only real body copy in five screens is the
  onboarding subtitle and the green encouragement line. This app does not
  explain itself in paragraphs.
- **Numerals are tabular** wherever they change (chart axis, macro values).

---

## 3. Spacing system

Rhythm is two-speed: tight inside a container, generous between them.

- **Gutter:** ~16–20px, consistent on every screen. Cards start and end there.
- **Between sections:** ~24–32px. This is the biggest routine gap.
- **Inside a card:** ~12–16px padding; ~6–10px between a label and its value.
- **Between cards in a row:** ~10–12px. Three-up macro tiles sit on this.
- **Stacked answer cards:** ~14–16px apart.
- **Before a sticky footer:** a gradient fade of ~40–60px, not a hard edge.

The onboarding screen has one deliberate outlier: a very large gap (roughly
80–100px, about a quarter of the screen height) between the subtitle and the
first answer card. It exists to make the question feel like the whole screen.
That is a hierarchy device, not a spacing accident.

---

## 4. Surface / card system

**Radii, and they are consistent:**

| Element | Est. radius |
|---------|-------------|
| Small controls, chips, mode tiles | 10–14px |
| Standard cards | 16–20px |
| Large answer cards | 20–24px |
| Bottom sheet top corners | 24–28px |
| Buttons, pills, tab bar, FAB | fully rounded |

**Fills:** white cards on a white or barely-grey ground. Unselected/inactive
surfaces are a very light neutral (roughly #F4F4F6). Selected surfaces invert to
near-black with white content.

**Shadow:** soft, large-radius, low-opacity, near-vertical. Its job is to lift a
white card off a white page, not to look like a shadow.

**The break-out card is a rank signal.** On both Home and Food Detail, the most
important card is slightly *wider* than the content column and carries a
stronger shadow, so it appears to float above its own section. That is the
single clearest "this is the answer" cue in the whole system.

---

## 5. Image treatment

- **Detail hero:** full-bleed, edge to edge, extending under the status bar,
  occupying roughly 45–50% of screen height before the sheet overlaps it.
- **Sheet overlap:** the content sheet sits *over* the base of the photo with a
  large top radius — the image is never fully revealed, which reads as depth.
- **Overlay controls:** circular, translucent dark, white glyph, sized for
  thumbs (~40–44px). Never a bar; always discrete circles.
- **List thumbnails:** square, ~90px, left-aligned, rounded ~12px, flush inside
  the row card so the photo forms the card's left edge.
- **Aspect ratios:** hero is landscape-ish (roughly 4:3 to 3:2 of the visible
  crop); list thumbs are 1:1. No portrait food images anywhere.

---

## 6. Navigation system

The tab bar is the most distinctive element and it is **not** a standard
edge-to-edge bar:

- A **floating white pill**, inset from the screen edges, with a soft shadow,
  sitting above the home indicator. It reads as an object resting on the page.
- Four destinations: icon above a very small label (~10–11px).
- **Selected state:** a light grey rounded-rect fills behind that one item.
  The icon darkens. No underline, no colour change.
- **A separate black circular FAB** sits to the right of the pill, roughly
  56–64px, carrying the primary create action (`+`). It is deliberately *not*
  a tab — the app's main verb is not a destination.

Secondary navigation is contextual and circular: back/close/share as translucent
circles over imagery; a plain chevron circle on light backgrounds.

---

## 7. Button / CTA system

| Kind | Treatment |
|------|-----------|
| Primary | Full-width, near-black, fully rounded, tall (~56–60px), white 600–700 label |
| Secondary | Same shape, white fill, hairline border, dark label |
| Paired | Secondary left and narrower, primary right and wider — unequal on purpose |
| Inline action | Small dark pill inside a card ("Log Weight →") |
| Quiet action | Grey text, no container ("+ Add more") |

Primary actions are **sticky at the bottom** with a fade above them, and they
are genuinely large — the tallest interactive element on the screen.

Selected/unselected is expressed by **fill inversion**, never by a border or a
tint: chosen is black-on-white-content, unchosen is dark-on-light-grey.

---

## 8. Information hierarchy patterns

Recurring structures worth naming:

- **Hero pair:** big value + circular progress ring, side by side in one card.
- **Triplet row:** exactly three equal secondary metrics beneath the hero, each
  a mini ring + label + value.
- **Carousel + dots:** the triplet is page one of a carousel. Secondary data is
  hidden behind a swipe rather than stacked down the page.
- **Timeline list:** a section title, then photo-led rows in reverse-chronology.
- **Result sheet:** image → identity → dominant metric → supporting metrics →
  detail list → sticky actions.
- **One question per screen** with a progress bar, in onboarding.
- **Encouragement strip:** a single tinted line of plain-language interpretation
  under a chart ("Great job! Consistency is key…"). The app says what the data
  means in one sentence.

---

## 9. Interaction patterns

- Segmented control (90D/6M/1Y/ALL) as a grey track with a white selected pill.
- Inline stepper (− 1 +) for quantity, inside a bordered rounded rect.
- Tap-to-inspect chart with a black rounded tooltip.
- Camera: floating white pill labels attached by thin leader lines to points on
  the image — the clearest "the machine is seeing this" device in the set.
- Mode switcher as three tiles inside the camera surface, selected tile flips to
  white.
- A large white circular shutter, flanked by flash and gallery.
- "Fix Results" — an explicit, low-emphasis correction affordance sitting beside
  the confirm action. The app assumes it can be wrong and makes that cheap.

---

## 10. Patterns we should adopt

1. Label/value contrast, with the value large and black.
2. Borderless white cards, soft shadow, consistent radii.
3. Black as the only action colour; food as the only source of hue.
4. The break-out dominant card to mark "this is the answer".
5. Full-bleed hero photo with an overlapping rounded sheet on detail screens.
6. Circular translucent overlay controls on imagery.
7. Floating pill tab bar with a filled selected state.
8. A distinct, always-visible primary action that is not a tab.
9. Sticky, genuinely large primary CTA with a fade above it.
10. Fill inversion for selected state.
11. Photo-led list rows with a square thumbnail forming the card's left edge.
12. One plain-language interpretation line near data.
13. Floating detection labels during capture.
14. An explicit, cheap "this is wrong" affordance next to confirmation.
15. One decision per onboarding screen, big question, sticky Continue.

## 11. Patterns we should NOT adopt

1. **Calorie-centric hierarchy.** Their hero number is consumption. Ours is a
   decision. Copying the shape but filling it with nutrition totals would make
   us a worse tracker instead of a better cook's app.
2. **Streaks and gamification.** Wrong incentive for a household that sometimes
   orders takeaway.
3. **The macro triplet as standing dashboard furniture.** We have no equivalent
   three co-equal numbers, and inventing some would be noise.
4. **The day-of-week strip as the top control.** Their unit of work is a logged
   day. Ours is *tonight* and *this week*; a seven-day selector at the top of
   Today implies per-day browsing we do not offer.
5. **Carousels for primary information.** Fine for their secondary macros;
   dangerous for anything a household needs to decide dinner.
6. **Emoji/illustrated badges** (the flame). Charming for them, off-register for
   a food-planning tool that should look calm.
7. **"..." overflow menus** on detail screens — we do not have enough actions to
   justify hiding any.
8. **Numeric progress rings everywhere.** We have one genuinely ring-shaped
   metric at most (ingredients on hand), and even that reads better as a number.

## 12. Human Not Found translation

The mapping, screen by screen. In each case we take the *structure* and change
the *content*.

### Today ← Home dashboard (01)

Their hero answers "how am I doing today". Ours answers **"what are we eating
tonight"**, so the hero becomes the dish, not a number.

```
[ apple-equivalent: compact wordmark ]        [ avatar ]
Thursday, Aug 20                                             ← small, grey

  ┌───────────────────────────────────────────┐
  │                                           │
  │            FOOD PHOTO (≈3:2)              │   ← break-out card
  │                                           │
  │  Chicken Souvlaki Bowls                   │   ← dish name, largest text
  │  Greek · 24 min                           │   ← small grey meta
  │                                           │
  │  92% at home        42g protein           │   ← label/value pair ×2
  │                                           │
  │  Uses the yogurt and cucumber that         │   ← one interpretation line
  │  should be eaten this week.                │
  └───────────────────────────────────────────┘

  [ Cook this ]                                   ← full-width black pill
  Show me something else                          ← quiet secondary

USE SOON
  [ Spinach 2d ]  [ Yogurt 3d ]                   ← chips, semantic colour only

RECENTLY ADDED
  photo-led rows
```

Direct borrowings: break-out hero card, label/value pairs, interpretation line,
photo-led rows, floating tab bar. Rejected: date strip, macro triplet, streak.

**The "92% at home" number is our equivalent of their calorie count** — the one
figure that is genuinely ours and genuinely decision-changing.

### Scan ← Camera scan (02)

Their camera reads a plate; ours reads a receipt. Everything else transfers
almost unchanged, and this is the screen where the reference is most directly
applicable.

- Immersive dark camera surface, minimal chrome.
- Circular translucent close (left), wordmark (centre), help (right).
- **Floating white pill labels with leader lines** as lines are recognised —
  "Greek yogurt", "Paneer", "Spinach", "Eggs", "Tortillas". This is the single
  best idea in the reference set for us: it makes the parse visible and
  immediate rather than a spinner followed by a form.
- Large white circular shutter; gallery on the right.
- Mode tiles are unnecessary for us (we have one mode) — drop them rather than
  invent modes to fill the slot.

Post-capture, their result screen becomes our progressive summary:

```
18 items detected
14 added automatically
2 need confirmation
2 matched to what you already had
```

That is their "Fix Results" philosophy applied to a receipt: state the machine's
work as a count, and ask only about the exceptions.

### Recipe ← Food detail (03)

The closest structural match in the set. Keep the skeleton exactly:

1. Full-bleed hero photo, circular back overlay.
2. Sheet overlapping with a large top radius.
3. Identity: dish name, cuisine, time.
4. **Dominant break-out card** — theirs is "Calories 330", ours is:
   `92% at home · 2 ingredients missing`
5. Supporting metric row of three: cook time, protein, calories.
6. "Why this fits" — one sentence.
7. Ingredients, split into *You have* / *You need*.
8. Cooking steps.
9. Sticky actions: `Cook this` primary, `Swap` secondary — mirroring their
   Done/Fix Results pairing, unequal widths.

### Plan ← Progress (04)

Take the card discipline, drop the charting. The user question is "what are we
eating over the next few days", so it is a photo-led list, not a calendar.

```
THIS WEEK
4 meals use groceries you already have          ← interpretation line
7 ingredients needed

MON   [photo] Paneer tikka bowls
              28 min · 38g protein
              95% at home                    Change
TUE   [photo] Mediterranean chicken
              32 min · missing cucumber      Change
WED   [photo] Palak paneer
              Uses spinach expiring soon     Change
```

Borrowed: the two-up summary pair at the top (their weight/streak cards), the
interpretation line, photo-led rows, the small inline dark action.

### Kitchen ← (no direct reference; apply the principles)

Attention first, inventory second. Their Progress screen's habit of leading with
the two things that matter and burying the rest is the transferable idea.

```
USE SOON
  Spinach    2 days
  Avocado    3 days

RUNNING LOW
  Eggs
  Greek yogurt

RECENTLY ADDED
  Paneer · Bell peppers · Tortillas

Browse everything ▸        ← the full list is one tap away, not the page
```

### Profile / Household ← Progress (04)

Their metric-card grid, translated away from weight:

```
Mehta Household

  Meals cooked      Waste avoided
  this month        this month
  18                6 items

Most cooked: Indian, Greek, Mexican
Average protein: 38g a serving

PREFERENCES
  Diet · Cuisines · Cooking time · Foods avoided
```

Only metrics that demonstrate the household is being learned about. No invented
analytics, no streak.

### Onboarding ← (05)

Pattern held in reserve until we build household setup: huge question, small
subtitle, large answer cards with fill-inversion selection, sticky Continue,
thin progress bar, one decision per screen. Our questions:

- How long do you usually want to cook?
- What cuisines do you eat most?
- What should meals optimise for?
- Who are we planning for?
- What do you avoid?

### Navigation

Reference structure, our destinations:

```
[ Today ]  [ Plan ]  [ Kitchen ]  [ Profile ]        ( Scan )
   floating pill tab bar                              black FAB
```

Scan is the FAB. It is our equivalent of their `+` — the app's primary verb, and
the one thing that must never be buried in a menu.

---

## Honest limitations

- Five screens is a good sample but not the whole product. I have not seen their
  empty states, error states, loading states, or the editing flow, so nothing
  above describes those; where our product needs them we are designing, not
  adapting.
- All sizes are inferred from proportion. Anything specified as a token in our
  system should be chosen for our own type scale, not transcribed from here.
- I have not observed motion. Transitions and easing are unknown.
