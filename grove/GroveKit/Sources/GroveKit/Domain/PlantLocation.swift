import Foundation

/// A place plants live — a room, balcony, greenhouse (PRD 17.3).
public struct PlantLocation: Identifiable, Hashable, Codable, Sendable {
    public typealias ID = Identifier<PlantLocation>

    public var id: ID
    public var name: String
    public var type: LocationType
    public var windowDirection: WindowDirection?
    public var defaultLightLevel: LightLevel?
    public var notes: String
    public var sortOrder: Int
    /// True for rooms the demo garden created, so removing the demo can clean
    /// them up without ever touching a user-created room.
    public var isDemo: Bool
    public var archivedAt: Date?

    public init(
        id: ID = ID(),
        name: String,
        type: LocationType = .room,
        windowDirection: WindowDirection? = nil,
        defaultLightLevel: LightLevel? = nil,
        notes: String = "",
        sortOrder: Int = 0,
        isDemo: Bool = false,
        archivedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.windowDirection = windowDirection
        self.defaultLightLevel = defaultLightLevel
        self.notes = notes
        self.sortOrder = sortOrder
        self.isDemo = isDemo
        self.archivedAt = archivedAt
    }
}

public enum LocationType: String, Codable, Sendable, CaseIterable, Hashable {
    case room
    case patio
    case balcony
    case garden
    case greenhouse
    case other

    public var displayName: String {
        switch self {
        case .room: "Room"
        case .patio: "Patio"
        case .balcony: "Balcony"
        case .garden: "Garden"
        case .greenhouse: "Greenhouse"
        case .other: "Other"
        }
    }
}

public enum WindowDirection: String, Codable, Sendable, CaseIterable, Hashable {
    case north, northeast, east, southeast, south, southwest, west, northwest

    public var displayName: String {
        rawValue.prefix(1).uppercased() + rawValue.dropFirst()
    }
}

public enum LightLevel: String, Codable, Sendable, CaseIterable, Hashable {
    case low
    case medium
    case brightIndirect
    case direct

    public var displayName: String {
        switch self {
        case .low: "Low light"
        case .medium: "Medium light"
        case .brightIndirect: "Bright indirect"
        case .direct: "Direct sun"
        }
    }
}
