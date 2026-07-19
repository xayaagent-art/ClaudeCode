import Foundation

/// Repository for tests and SwiftUI previews. Optionally records save counts
/// so tests can assert persistence actually happened.
public actor InMemoryGardenStore: GardenRepository {
    private var snapshot: GardenSnapshot
    public private(set) var saveCount = 0

    public init(snapshot: GardenSnapshot = GardenSnapshot()) {
        self.snapshot = snapshot
    }

    public func load() async throws -> GardenSnapshot {
        snapshot
    }

    public func save(_ snapshot: GardenSnapshot) async throws {
        self.snapshot = snapshot
        saveCount += 1
    }
}
