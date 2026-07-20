import Foundation

/// Everything Grove persists locally for the garden, saved as one document.
/// A snapshot keeps storage trivial while the protocol boundary leaves room
/// for a SwiftData- or sync-backed repository later.
///
/// Schema history:
/// - v1: plants, locations, mediaAssets, hasCompletedFirstRun
/// - v2: + careEvents, careSchedules, travelPauseUntil (Milestone 2)
public struct GardenSnapshot: Codable, Sendable, Equatable {
    public static let currentSchemaVersion = 2

    public var schemaVersion: Int
    public var plants: [Plant]
    public var locations: [PlantLocation]
    public var mediaAssets: [MediaAsset]
    public var careEvents: [CareEvent]
    public var careSchedules: [CareSchedule]
    /// Garden-wide pause for travel (PRD 10.6 notification controls).
    public var travelPauseUntil: Date?
    /// Whether the user has completed the first-run choice (PRD 10.1:
    /// returning users never see onboarding again unless they reset it).
    public var hasCompletedFirstRun: Bool

    public init(
        schemaVersion: Int = GardenSnapshot.currentSchemaVersion,
        plants: [Plant] = [],
        locations: [PlantLocation] = [],
        mediaAssets: [MediaAsset] = [],
        careEvents: [CareEvent] = [],
        careSchedules: [CareSchedule] = [],
        travelPauseUntil: Date? = nil,
        hasCompletedFirstRun: Bool = false
    ) {
        self.schemaVersion = schemaVersion
        self.plants = plants
        self.locations = locations
        self.mediaAssets = mediaAssets
        self.careEvents = careEvents
        self.careSchedules = careSchedules
        self.travelPauseUntil = travelPauseUntil
        self.hasCompletedFirstRun = hasCompletedFirstRun
    }

    // Custom decoding so a v1 document (no care fields) loads cleanly with
    // empty defaults instead of failing.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        plants = try container.decodeIfPresent([Plant].self, forKey: .plants) ?? []
        locations = try container.decodeIfPresent([PlantLocation].self, forKey: .locations) ?? []
        mediaAssets = try container.decodeIfPresent([MediaAsset].self, forKey: .mediaAssets) ?? []
        careEvents = try container.decodeIfPresent([CareEvent].self, forKey: .careEvents) ?? []
        careSchedules = try container.decodeIfPresent([CareSchedule].self, forKey: .careSchedules) ?? []
        travelPauseUntil = try container.decodeIfPresent(Date.self, forKey: .travelPauseUntil)
        hasCompletedFirstRun = try container.decodeIfPresent(Bool.self, forKey: .hasCompletedFirstRun) ?? false
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
