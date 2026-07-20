# Grove — Implementation Plan

Status: Milestones 0, 1, and 2 implemented, awaiting product review.

## Scope of this pass

Per PRD Section 20, this pass delivers **Milestone 0 (product foundation)** and
**Milestone 1 (local garden MVP)** as one vertical slice, because Milestone 0
alone produces no user-reviewable value and the two share their foundation.

### Milestone 0 — delivered

- Repository layout: `GroveKit` (platform-independent domain package) + `GroveApp` (SwiftUI layer)
- Four-tab shell: Today, Garden, Scan, Profile
- Design tokens: spacing (4-pt system), radii, semantic status colors, brand color, motion tokens, haptics policy
- Reusable components: PlantCard, PlantListRow, StatusPill, CareAttributeRow, FilterChip, EmptyState, ErrorState, LoadingState, UndoToast
- Local persistence abstraction (`GardenRepository`) with JSON file store (atomic writes, schema versioning) and in-memory store
- Dependency injection via a single composition root (`AppEnvironment`), no singletons in views
- Analytics protocol with no-op implementation and a bounded, privacy-safe event list
- Preview data (demo garden doubles as preview seed) — every screen previews without a backend
- Developer-only component gallery (DEBUG builds only, unreachable in release)
- Unit test target (Swift Testing) and UI test target (XCUITest)
- CI: GroveKit tests on Linux Swift 6.1 container; app build on macOS runner via XcodeGen

### Milestone 1 — delivered

- First-run choice: add first plant / explore demo garden / start empty (no account, no questionnaire, max one screen)
- Manual plant creation: only a name required; species, room, photo, care details, acquisition, notes all optional
- Photo selection from library (PhotosPicker — no permission prompt required), downscaled JPEG storage
- Garden: photographic grid, compact list, rooms view; search across nickname/common/scientific/room/notes; filters (all, recently added, unidentified, archived)
- Plant detail: photo header, explained status, care snapshot with per-attribute guidance source, record details, notes
- Edit plant (same form as create)
- Rooms: create, rename, remove (plants preserved, become unassigned), plant counts
- Archive: reversible, with undo toast; permanent delete only from the archived state behind a destructive confirmation
- Demo garden: installable and removable, never duplicates, reuses user rooms
- Today: honest garden-status overview and recently-added strip; explicitly does not invent tasks
- Scan tab: explicit "coming later" state with a useful manual-add path (per PRD scan modes rule)
- Local-first persistence across launches; no account anywhere

### Milestone 2 — delivered

- Care event logging (PRD 10.7): 12 quick-log types, two-tap logging, optional
  note, undo toast, editable/deletable timeline, offline-safe by construction
- Repeating review schedules per plant (check soil, water, fertilize, rotate,
  mist, prune, repot review, growth photo, custom) with interval stepper
- Derived task queue on Today: overdue/due-today cards with plant photo,
  action, plain-language reason, calm urgency, per-kind completion options
  ("Soil dry / Still moist" before "Water now"), snooze 1/3 days, skip
- "Coming up" seven-day preview; honest quiet state; no invented work
- Schedule pause per plant and garden-wide travel pause with resume
- Plant detail: quick actions row, next-action card, care reviews section,
  recent timeline with full timeline screen
- Local notifications: permission asked only after the user creates their
  first schedule (with an explanation first); uncertain-tone copy; one
  notification per task at 9am on the due day; notification tap deep-links
  to the plant; denied permission changes nothing in-app
- Care-aware status: due review reads "Check soon" — a missed date never
  produces an unhealthy state; recent care reads "Doing well" with the event
  as the reason
- Schedule math tested across timezones (incl. 30/45-minute offsets) and both
  US DST transitions; snapshot schema v2 with tested v1 migration
- Demo garden now seeds care history and schedules so Today is alive on entry

## Explicitly not built (later milestones)

AI identification and health checks (M4–5), growth photo timeline and
propagation (M3), accounts/sync (M6), premium (M7), recommendations (M8),
marketplace (M9–10), community (M11).

## Next milestone recommendation

**Milestone 3 — Growth and propagation**: photo timeline with compare view,
milestones, propagation tracking from cutting to converted plant with lineage.
`Plant.parentPlantIdOptional` and `PlantOrigin.propagation` already exist in
the schema.
