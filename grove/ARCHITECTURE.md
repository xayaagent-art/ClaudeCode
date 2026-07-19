# Grove — Technical Architecture

## Layout

```
grove/
  project.yml            XcodeGen spec (generates Grove.xcodeproj; not committed)
  GroveKit/              Swift package — platform-independent domain layer
    Sources/GroveKit/
      Domain/            Plant, PlantLocation, CareAttributes, MediaAsset,
                         PlantStatus + StatusEngine, Identifier<T>
      Persistence/       GardenRepository protocol, GardenSnapshot,
                         JSONGardenStore (atomic file), InMemoryGardenStore
      Services/          GardenService (actor, all business rules),
                         GardenSearch (pure query engine), DemoGarden
      Support/           ClockProviding (injectable time)
    Tests/GroveKitTests/ Swift Testing suites (run on Linux and macOS)
  GroveApp/              SwiftUI app target (iOS 17+)
    App/                 GroveApp entry, AppEnvironment (composition root),
                         GardenModel (@MainActor observable), RootView + tabs
    Core/
      DesignSystem/      GroveTokens (spacing/radius/color/motion/haptics),
                         Components/ (StatusPill, PlantCard, StateViews, …)
      Media/             MediaStoring protocol, FileMediaStore, PlantImageView
      Analytics/         AnalyticsTracking protocol + NoOpAnalytics
    Features/            Onboarding, Today, Garden, PlantDetail, Scan,
                         Profile, Gallery (DEBUG-only component gallery)
  GroveUITests/          XCUITest critical paths
```

## Data flow

```
SwiftUI views
   │  read synchronously
   ▼
GardenModel (@MainActor, @Observable)
   │  caches latest GardenSnapshot; filtering/search run
   │  synchronously via GardenSearch over the cached snapshot
   │  intents are async and awaited
   ▼
GardenService (actor)
   │  validation, timestamps, business rules; single owner of mutations
   ▼
GardenRepository (protocol)
   ├─ JSONGardenStore   one JSON document, atomic replace, schema-versioned
   └─ InMemoryGardenStore   tests + previews
```

- **Local-first:** every mutation persists before the UI settles. No network anywhere in M1.
- **Offline-safe writes:** temp file + `replaceItemAt` — a crash mid-save cannot corrupt the garden.
- **Migrations:** `GardenSnapshot.schemaVersion` with a migration hook in the store; a newer-versioned file is refused rather than misread.
- **Images:** pixel data never enters the JSON document. `FileMediaStore` writes downscaled JPEGs keyed by `MediaAsset.ID`; `PlantImageView` loads through a small main-actor memory cache.
- **Time:** all domain logic takes `ClockProviding`, so status windows and "recently added" are deterministic under test.

## Concurrency model

- `GroveKit` compiles in Swift 6 strict-concurrency mode. Domain types are `Sendable` value types; `GardenService` and stores are actors.
- UI state lives in `GardenModel` on the main actor. Views never touch actors directly.

## Dependency injection

`AppEnvironment.live()` is the only place real dependencies are constructed
(file locations, stores, analytics). `AppEnvironment.preview()` builds a seeded
in-memory graph for previews; a `--uitest-reset` launch argument gives UI tests
a throwaway store. Views receive everything through the SwiftUI environment.

## Design system

All UI constants flow from `GroveTokens`: 4-pt spacing scale, radii, semantic
status colors (always paired with icon + text), motion tokens with a
Reduce-Motion-respecting helper, and a deliberately tiny haptics API.
Components live in `Core/DesignSystem/Components` and each carries a preview.

## Testing

- **Unit (GroveKitTests, Swift Testing):** creation validation, updates/timestamps, archive/restore, rooms, search + filters, status derivation, JSON round-trip + corruption + schema refusal, demo garden idempotency. Run on Linux CI (`swift test`) and locally on macOS.
- **UI (GroveUITests):** first-plant creation and demo-garden path.
- **CI:** `.github/workflows/grove-ci.yml` — Linux Swift 6.1 container runs package tests; macOS runner generates the project with XcodeGen and builds for iOS Simulator.

## Extension points already in place

- `IdentificationStatus.aiCandidate/.aiConfirmed` and identity-confidence fields await Milestone 4 without a schema break.
- `Plant.origin` (`propagation`, `transferred`) anticipates Milestones 3 and 10.
- `CareGuidanceSource.learned` anticipates adaptive scheduling (M2+).
- `AnalyticsTracking` and `MediaStoring` are protocol boundaries ready for real backends.
- `GardenRepository` is the sync seam for Milestone 6.
