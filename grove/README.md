# Grove

iPhone-first plant care companion. Know every plant, care for it confidently,
share its next chapter.

Built against `Grove_PRD_AI_Build_Specification.md` (v1.0), milestone by
milestone. **Current state: Milestones 0–1** — local garden MVP: manual plant
records, photos, rooms, search, archive, demo garden. Private by default, no
account, fully offline.

## Documents

| File | Purpose |
| --- | --- |
| `PLAN.md` | What this pass built, and what's next |
| `DECISIONS.md` | Assumptions needing product review |
| `ARCHITECTURE.md` | Technical design |
| `KNOWN_ISSUES.md` | Unfinished work and debt |

## Building

Requirements: Xcode 16+, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
cd grove
xcodegen generate          # creates Grove.xcodeproj (not committed)
open Grove.xcodeproj       # build & run the Grove scheme (iOS 17+)
```

Domain logic lives in the `GroveKit` package and runs anywhere Swift does:

```bash
swift test --package-path grove/GroveKit
```

CI (`.github/workflows/grove-ci.yml`) runs the package tests on Linux and
builds the app on macOS for every change under `grove/`.
