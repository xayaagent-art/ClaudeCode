import Foundation

/// A recorded care action (PRD 10.7). Logging must be faster than remembering:
/// most events are a type and a timestamp, everything else optional.
public struct CareEvent: Identifiable, Hashable, Codable, Sendable {
    public typealias ID = Identifier<CareEvent>

    public var id: ID
    public var plantID: Plant.ID
    public var type: CareEventType
    public var occurredAt: Date
    public var note: String
    public var source: CareEventSource
    /// Set when the event completed (or skipped) a scheduled review.
    public var relatedScheduleID: CareSchedule.ID?
    public var createdAt: Date
    public var editedAt: Date?

    public init(
        id: ID = ID(),
        plantID: Plant.ID,
        type: CareEventType,
        occurredAt: Date,
        note: String = "",
        source: CareEventSource = .user,
        relatedScheduleID: CareSchedule.ID? = nil,
        createdAt: Date,
        editedAt: Date? = nil
    ) {
        self.id = id
        self.plantID = plantID
        self.type = type
        self.occurredAt = occurredAt
        self.note = note
        self.source = source
        self.relatedScheduleID = relatedScheduleID
        self.createdAt = createdAt
        self.editedAt = editedAt
    }
}

public enum CareEventSource: String, Codable, Sendable, Hashable {
    case user
    case imported
    case aiSuggestion
}

/// The care actions Grove can record (PRD 10.2 quick log + 10.7 watering options).
public enum CareEventType: String, Codable, Sendable, CaseIterable, Hashable {
    case wateredThoroughly
    case wateredSmallAmount
    case bottomWatered
    case waterChanged
    case soilCheckedMoist
    case soilCheckedDry
    case fertilized
    case misted
    case rotated
    case pruned
    case repotted
    case treated
    case photoAdded
    case noteAdded
    case skipped

    public var displayName: String {
        switch self {
        case .wateredThoroughly: "Watered thoroughly"
        case .wateredSmallAmount: "Watered a little"
        case .bottomWatered: "Bottom watered"
        case .waterChanged: "Changed water"
        case .soilCheckedMoist: "Soil checked — still moist"
        case .soilCheckedDry: "Soil checked — dry"
        case .fertilized: "Fertilized"
        case .misted: "Misted"
        case .rotated: "Rotated"
        case .pruned: "Pruned"
        case .repotted: "Repotted"
        case .treated: "Treated"
        case .photoAdded: "Photo added"
        case .noteAdded: "Note"
        case .skipped: "Skipped"
        }
    }

    /// Short label for quick-log buttons.
    public var shortName: String {
        switch self {
        case .wateredThoroughly: "Watered"
        case .wateredSmallAmount: "Small water"
        case .bottomWatered: "Bottom water"
        case .waterChanged: "Water change"
        case .soilCheckedMoist: "Still moist"
        case .soilCheckedDry: "Soil dry"
        case .fertilized: "Fertilized"
        case .misted: "Misted"
        case .rotated: "Rotated"
        case .pruned: "Pruned"
        case .repotted: "Repotted"
        case .treated: "Treated"
        case .photoAdded: "Photo"
        case .noteAdded: "Note"
        case .skipped: "Skipped"
        }
    }

    public var symbolName: String {
        switch self {
        case .wateredThoroughly, .wateredSmallAmount, .bottomWatered: "drop"
        case .waterChanged: "arrow.triangle.2.circlepath"
        case .soilCheckedMoist, .soilCheckedDry: "hand.point.up.left"
        case .fertilized: "leaf.arrow.circlepath"
        case .misted: "humidity"
        case .rotated: "rotate.right"
        case .pruned: "scissors"
        case .repotted: "arrow.up.bin"
        case .treated: "cross.case"
        case .photoAdded: "camera"
        case .noteAdded: "note.text"
        case .skipped: "arrow.right.to.line"
        }
    }

    /// Types offered in the quick-log sheet, in display order. `skipped` is
    /// excluded — skipping happens from a task, not the log sheet.
    public static let quickLogTypes: [CareEventType] = [
        .wateredThoroughly, .wateredSmallAmount, .bottomWatered,
        .soilCheckedDry, .soilCheckedMoist,
        .fertilized, .misted, .rotated, .pruned, .repotted, .treated, .noteAdded,
    ]
}
