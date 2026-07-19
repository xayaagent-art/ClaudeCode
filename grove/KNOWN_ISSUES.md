# Grove — Known Issues and Unfinished Work

## Environment-driven limitations of this pass

1. **The app has not been run on a device/simulator yet.**
   This milestone was produced in a Linux container without Xcode. CI verifies
   compilation: GroveKit's 40 tests pass on Linux (Swift 6.1), and the app
   target builds for the iOS Simulator on the macOS runner (Grove CI run #1,
   both jobs green). Until someone runs the app on a simulator, the following
   PRD exit criteria are *unverified* (not unmet):
   - Dark/light appearance and Dynamic Type behavior on device
   - VoiceOver walkthrough of add/edit flows
   - Reduce Motion behavior in practice
   - UI test execution (target builds in CI; tests need a simulator run)
2. **macOS CI minutes** — the app-build job runs on a `macos-15` runner, which
   consumes paid minutes on private repos. If the job is skipped for billing
   reasons, generate and build locally: `brew install xcodegen && xcodegen
   generate --spec grove/project.yml --project grove`, then build the `Grove`
   scheme in Xcode.

## Deferred within Milestone 1 scope

3. **Batch actions** (multi-select watering/move/archive from Garden) are part
   of the full Garden spec (PRD 10.3) but not the M1 scope list; deferred to
   M2 where batch "mark watered" becomes meaningful.
4. **Landscape/iPad layouts** — portrait iPhone only, per PRD 14.3 priority.
   No layout is hard-broken in landscape, but it is not designed for.
5. **Image EXIF capture date** is not read; `MediaAsset.capturedAt` stays nil
   until the media pipeline milestone.
6. **Room reordering** — rooms sort by creation order; drag-to-reorder UI not
   built (model already carries `sortOrder`).
7. **App icon and launch branding** are absent (product decision #1, name and
   brand identity, is open).

## Technical debt

8. **App target is in Swift 5 language mode** (GroveKit is Swift 6). Flip
   `SWIFT_VERSION` in `project.yml` and fix any strict-concurrency findings
   once a Mac verifies the build.
9. **`ImageMemoryCache` eviction is crude** (clear-all past 500 entries).
   Replace with cost-based eviction when the growth timeline (M3) multiplies
   image counts.
10. **No structured logging yet** — PRD 16.2 lists it; add an os.Logger-backed
    facade when there is a consumer for it (first real need: sync in M6).
11. **`GardenSnapshot` loads wholesale** — fine at M1 scale; revisit paging
    when performance tests (500 plants / 10k events) land in M2–3.
