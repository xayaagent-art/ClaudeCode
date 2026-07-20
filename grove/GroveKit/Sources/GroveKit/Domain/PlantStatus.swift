import Foundation

/// Descriptive plant states (PRD 10.4). Grove never shows a status without
/// being able to say why, so the derived form carries an explanation.
public enum PlantStatus: String, Codable, Sendable, Hashable, CaseIterable {
    case doingWell
    case reviewDue
    case needsAttention
    case recovering
    case dormant
    case unknown

    public var displayName: String {
        switch self {
        case .doingWell: "Doing well"
        case .reviewDue: "Check soon"
        case .needsAttention: "Needs attention"
        case .recovering: "Recovering"
        case .dormant: "Dormant"
        case .unknown: "Getting to know"
        }
    }
}

public struct DerivedStatus: Hashable, Sendable {
    public let status: PlantStatus
    /// Plain-language reason the status applies. Always present: no unexplained states.
    public let reason: String

    public init(status: PlantStatus, reason: String) {
        self.status = status
        self.reason = reason
    }
}

/// Derives a plant's descriptive status from what Grove actually knows.
///
/// The engine deliberately never claims a problem it has no evidence for — an
/// overdue review produces "Check soon", never a red state (PRD 10.4,
/// Milestone 2 acceptance criteria).
public enum StatusEngine {
    /// Days after creation during which a plant is presented as new.
    public static let settlingInDays = 7
    /// A care event within this window reads as an actively tended plant.
    public static let recentCareDays = 30

    /// Care-aware derivation (Milestone 2): considers due reviews and recent
    /// care history before falling back to the record-completeness heuristics.
    public static func status(
        for plant: Plant,
        in snapshot: GardenSnapshot,
        calendar: Calendar,
        asOf now: Date
    ) -> DerivedStatus {
        if plant.isArchived {
            return DerivedStatus(status: .dormant, reason: "This plant is archived.")
        }

        let tasks = snapshot.careSchedules
            .filter { $0.plantID == plant.id }
            .compactMap { ScheduleEngine.task(for: $0, in: snapshot, calendar: calendar, now: now) }

        if let due = tasks.first(where: { $0.state == .overdue || $0.state == .dueToday }) {
            return DerivedStatus(
                status: .reviewDue,
                reason: "\(due.schedule.displayTitle) is due. \(due.reason)"
            )
        }

        let lastEvent = snapshot.careEvents
            .filter { $0.plantID == plant.id && $0.type != .skipped }
            .max { $0.occurredAt < $1.occurredAt }

        if let lastEvent {
            let days = calendar.dateComponents(
                [.day],
                from: calendar.startOfDay(for: lastEvent.occurredAt),
                to: calendar.startOfDay(for: now)
            ).day ?? 0
            if days <= recentCareDays {
                let ago = days == 0 ? "today" : (days == 1 ? "yesterday" : "\(days) days ago")
                return DerivedStatus(
                    status: .doingWell,
                    reason: "\(lastEvent.type.displayName) \(ago). Nothing concerning has been recorded."
                )
            }
        }

        return status(for: plant, asOf: now)
    }

    public static func status(for plant: Plant, asOf now: Date) -> DerivedStatus {
        if plant.isArchived {
            return DerivedStatus(status: .dormant, reason: "This plant is archived.")
        }

        let age = now.timeIntervalSince(plant.createdAt)
        let settlingWindow = TimeInterval(settlingInDays) * 86_400

        if age < settlingWindow {
            return DerivedStatus(
                status: .unknown,
                reason: "Recently added. Grove learns this plant's rhythm as you record care."
            )
        }

        if plant.care.isEmpty {
            return DerivedStatus(
                status: .unknown,
                reason: "Not enough information yet. Add care details or photos to build this plant's record."
            )
        }

        return DerivedStatus(
            status: .doingWell,
            reason: "Nothing concerning has been recorded for this plant."
        )
    }
}
