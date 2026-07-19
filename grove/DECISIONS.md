# Grove — Assumptions and Decisions

Decisions made during implementation that the PRD leaves open, plus assumptions
that need product review. Nothing here was silently invented — this file is the
disclosure.

## D1. Milestones 0 and 1 delivered together
M0 alone (shell + tokens + gallery) is not user-reviewable. The two were built
as one pass with M0's foundations laid first. Every M0 and M1 exit criterion
that can be checked off-device has been; on-device criteria are listed in
KNOWN_ISSUES.md.

## D2. JSON document store now, SwiftData later — behind the same interface
PRD 16.1 recommends SwiftData. This build was produced in a Linux environment
where SwiftData (and Xcode) cannot be compiled or tested, so Milestone 1
persists through `GardenRepository` → `JSONGardenStore`: one atomic-write JSON
document with schema versioning. This is deliberate, not a shortcut:

- The repository protocol is the PRD-required "abstraction that permits backend sync".
- M1 data volumes (hundreds of plants) are trivially served by one document.
- A SwiftData- or CloudKit-backed repository can replace it without touching domain or UI code.

**Review needed:** confirm SwiftData adoption timing (relates to PRD open decision #3).

## D3. App target ships in Swift 5 language mode; GroveKit in Swift 6 mode
GroveKit compiles under strict Swift 6 concurrency and is CI-tested that way.
The app target starts in Swift 5 mode to keep the first unattended macOS CI
pass tractable; moving it to 6 is tracked in KNOWN_ISSUES.md.

## D4. Milestone 1 status derivation is deliberately humble
With no care events yet, `StatusEngine` only produces:
- `unknown` ("Getting to know") for new or sparsely documented plants,
- `doingWell` for settled plants with care details and no recorded problems,
- `dormant` for archived plants.

No plant is ever marked unhealthy from a date alone (PRD 10.4). Real signals
arrive with Milestone 2 care events.
**Review needed:** wording of the status labels and reasons.

## D5. "Unnamed plant" is impossible by construction
A plant requires at least one of nickname/common name/scientific name. Display
name precedence: nickname → common name → scientific name (PRD 15 naming
conventions).

## D6. Archiving a room unassigns its plants
The PRD doesn't specify. Chosen: plants are never deleted or moved to another
room implicitly; they become "No room" and remain fully usable. The UI states
this before confirming.

## D7. Demo garden is real data, clearly marked, fully removable
Demo plants carry `origin: .demo`, appear in a "Demo garden" record row, can be
removed from Profile (plants + demo-created rooms; user data untouched), and
double as SwiftUI preview data. Installing is idempotent and reuses same-named
user rooms.

## D8. Scan tab is an explicit "coming later" state
PRD forbids fake-functional placeholders and forbids hiding unshipped scan
modes in production. The Scan tab states plainly that identification arrives
later and offers the genuinely working manual-add path.
**Review needed:** whether the tab should exist at all before Milestone 4.

## D9. Photos via PhotosPicker only, no camera in M1
PhotosPicker runs out-of-process and needs no permission prompt — matching the
PRD's "permission only after intent" rule. Camera capture belongs to Milestone
4's scan flow. Images are stored as downscaled JPEG (max 2048 px) files
referenced by asset ID.

## D10. Bundle identifier and versioning are placeholders
`app.grove.ios`, version 0.1.0. Product owns the final identifiers (relates to
PRD open decision #1).

## D11. No third-party runtime dependencies
Zero packages beyond the platform. XcodeGen is a build-time tool (the
generated .xcodeproj stays out of source control to keep diffs reviewable);
it can be dropped by committing the generated project if preferred.

## D12. Undo window for archive is 5 seconds
PRD requires a "short undo opportunity" without a number. The action also
remains reversible forever via Archived plants, so the toast is a convenience,
not the only path.
