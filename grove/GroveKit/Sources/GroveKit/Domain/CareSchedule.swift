import Foundation

/// A repeating care review the user set up (PRD 10.6). Grove schedules review
/// windows, not commands: a due "Check soil" asks the user to look, it never
/// asserts the plant is suffering.
public struct CareSchedule: Identifiable, Hashable, Codable, Sendable {
    public typealias ID = Identifier<CareSchedule>

    public var id: ID
    public var plantID: Plant.ID
    public var kind: CareTaskKind
    /// Title for `.custom` schedules; ignored otherwise.
    public var customTitle: String?
    public var intervalDays: Int
    /// The date the cycle counts from when no completing event exists yet.
    public var anchorDate: Date
    public var snoozedUntil: Date?
    public var pausedUntil: Date?
    public var isEnabled: Bool
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: ID = ID(),
        plantID: Plant.ID,
        kind: CareTaskKind,
        customTitle: String? = nil,
        intervalDays: Int,
        anchorDate: Date,
        snoozedUntil: Date? = nil,
        pausedUntil: Date? = nil,
        isEnabled: Bool = true,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.plantID = plantID
        self.kind = kind
        self.customTitle = customTitle
        self.intervalDays = intervalDays
        self.anchorDate = anchorDate
        self.snoozedUntil = snoozedUntil
        self.pausedUntil = pausedUntil
        self.isEnabled = isEnabled
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public var displayTitle: String {
        if kind == .custom, let customTitle, !customTitle.isEmpty {
            return customTitle
        }
        return kind.displayName
    }
}

/// The reminder types Grove supports in Milestone 2 (PRD 10.6).
public enum CareTaskKind: String, Codable, Sendable, CaseIterable, Hashable {
    case checkSoil
    case water
    case fertilize
    case rotate
    case mist
    case prune
    case repotReview
    case photoUpdate
    case custom

    public var displayName: String {
        switch self {
        case .checkSoil: "Check soil"
        case .water: "Water"
        case .fertilize: "Fertilize"
        case .rotate: "Rotate"
        case .mist: "Mist"
        case .prune: "Prune"
        case .repotReview: "Repot review"
        case .photoUpdate: "Growth photo"
        case .custom: "Custom task"
        }
    }

    public var symbolName: String {
        switch self {
        case .checkSoil: "hand.point.up.left"
        case .water: "drop"
        case .fertilize: "leaf.arrow.circlepath"
        case .rotate: "rotate.right"
        case .mist: "humidity"
        case .prune: "scissors"
        case .repotReview: "arrow.up.bin"
        case .photoUpdate: "camera"
        case .custom: "checklist"
        }
    }

    /// The verb Grove uses on the task's primary completion buttons.
    /// Check-soil tasks deliberately offer observations, not "Water now"
    /// (PRD 10.2: prefer "Check soil" when confidence is limited).
    public var completionOptions: [CareEventType] {
        switch self {
        case .checkSoil: [.soilCheckedDry, .soilCheckedMoist, .wateredThoroughly]
        case .water: [.wateredThoroughly, .wateredSmallAmount, .bottomWatered]
        case .fertilize: [.fertilized]
        case .rotate: [.rotated]
        case .mist: [.misted]
        case .prune: [.pruned]
        case .repotReview: [.repotted]
        case .photoUpdate: [.photoAdded]
        case .custom: [.noteAdded]
        }
    }
}
