import Foundation

/// Everything Grove persists locally for the garden, saved as one document.
/// A snapshot keeps Milestone 1 storage trivial while the protocol boundary
/// leaves room for a SwiftData- or sync-backed repository later.
public struct GardenSnapshot: Codable, Sendable, Equatable {
    public static let currentSchemaVersion = 1

    public var schemaVersion: Int
    public var plants: [Plant]
    public var locations: [PlantLocation]
    public var mediaAssets: [MediaAsset]
    /// Whether the user has completed the first-run choice (PRD 10.1:
    /// returning users never see onboarding again unless they reset it).
    public var hasCompletedFirstRun: Bool

    public init(
        schemaVersion: Int = GardenSnapshot.currentSchemaVersion,
        plants: [Plant] = [],
        locations: [PlantLocation] = [],
        mediaAssets: [MediaAsset] = [],
        hasCompletedFirstRun: Bool = false
    ) {
        self.schemaVersion = schemaVersion
        self.plants = plants
        self.locations = locations
        self.mediaAssets = mediaAssets
        self.hasCompletedFirstRun = hasCompletedFirstRun
    }
}

/// Local-first storage boundary. Implementations must never lose data on
/// partial writes and must be safe to call from any concurrency context.
public protocol GardenRepository: Sendable {
    func load() async throws -> GardenSnapshot
    func save(_ snapshot: GardenSnapshot) async throws
}

public enum GardenRepositoryError: Error, Equatable {
    case unreadableStore(String)
    case unsupportedSchema(found: Int, supported: Int)
}
