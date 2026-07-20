import Foundation

/// A live care task derived from a schedule, its plant, and the care history.
/// Tasks are never stored — they are recomputed, so deleting an event or
/// editing a schedule always yields a consistent queue.
public struct CareTaskItem: Identifiable, Hashable, Sendable {
    /// One live task per schedule, so the schedule ID identifies the task.
    public var id: CareSchedule.ID { schedule.id }

    public let schedule: CareSchedule
    public let plantID: Plant.ID
    public let dueDate: Date
    public let state: CareTaskState
    /// Plain-language explanation of why this task appears (PRD 10.2: every
    /// care card shows action, reason, urgency).
    public let reason: String
    public let lastEvent: CareEvent?

    public init(
        schedule: CareSchedule,
        plantID: Plant.ID,
        dueDate: Date,
        state: CareTaskState,
        reason: String,
        lastEvent: CareEvent?
    ) {
        self.schedule = schedule
        self.plantID = plantID
        self.dueDate = dueDate
        self.state = state
        self.reason = reason
        self.lastEvent = lastEvent
    }
}

public enum CareTaskState: Sendable, Hashable {
    case upcoming
    case dueToday
    case overdue
    case snoozed
    case paused
}

/// Pure derivation of care tasks from a snapshot. All date math goes through
/// an injected `Calendar` so timezone and daylight-saving behavior is exact
/// and testable (Milestone 2 acceptance criteria).
public enum ScheduleEngine {
    /// Event types that complete a review cycle for the given kind. A watering
    /// naturally completes a soil-check review too — the user clearly looked.
    public static func satisfyingEventTypes(for kind: CareTaskKind) -> Set<CareEventType> {
        switch kind {
        case .checkSoil:
            [.soilCheckedMoist, .soilCheckedDry, .wateredThoroughly, .wateredSmallAmount, .bottomWatered]
        case .water:
            [.wateredThoroughly, .wateredSmallAmount, .bottomWatered]
        case .fertilize: [.fertilized]
        case .rotate: [.rotated]
        case .mist: [.misted]
        case .prune: [.pruned]
        case .repotReview: [.repotted]
        case .photoUpdate: [.photoAdded]
        case .custom: []
        }
    }

    /// The most recent event that completed this schedule's cycle: either a
    /// satisfying care action for the kind, or any event explicitly linked to
    /// the schedule (skip, custom completion).
    public static func lastCompletingEvent(
        for schedule: CareSchedule,
        in events: [CareEvent]
    ) -> CareEvent? {
        let satisfying = satisfyingEventTypes(for: schedule.kind)
        return events
            .filter { event in
                event.plantID == schedule.plantID
                    && (satisfying.contains(event.type) || event.relatedScheduleID == schedule.id)
            }
            .max { $0.occurredAt < $1.occurredAt }
    }

    /// Next due date: interval days after the last completing event (or the
    /// anchor), normalized to local start of day. Calendar day arithmetic keeps
    /// "every 10 days" meaning 10 calendar days across DST transitions.
    public static func nextDueDate(
        for schedule: CareSchedule,
        events: [CareEvent],
        calendar: Calendar
    ) -> Date {
        let reference = lastCompletingEvent(for: schedule, in: events)?.occurredAt ?? schedule.anchorDate
        let referenceDay = calendar.startOfDay(for: reference)
        return calendar.date(byAdding: .day, value: schedule.intervalDays, to: referenceDay) ?? referenceDay
    }

    /// Derives the live task for one schedule, or nil when the schedule is
    /// disabled or its plant is archived/missing.
    public static func task(
        for schedule: CareSchedule,
        in snapshot: GardenSnapshot,
        calendar: Calendar,
        now: Date
    ) -> CareTaskItem? {
        guard schedule.isEnabled, schedule.intervalDays > 0 else { return nil }
        guard let plant = snapshot.plants.first(where: { $0.id == schedule.plantID }),
              !plant.isArchived else { return nil }

        let lastEvent = lastCompletingEvent(for: schedule, in: snapshot.careEvents)
        let dueDate = nextDueDate(for: schedule, events: snapshot.careEvents, calendar: calendar)

        let state: CareTaskState
        if let pausedUntil = effectivePause(schedule: schedule, snapshot: snapshot), pausedUntil > now {
            state = .paused
        } else if let snoozedUntil = schedule.snoozedUntil, snoozedUntil > now {
            state = .snoozed
        } else if dueDate < calendar.startOfDay(for: now) {
            state = .overdue
        } else if calendar.isDate(dueDate, inSameDayAs: now) {
            state = .dueToday
        } else {
            state = .upcoming
        }

        return CareTaskItem(
            schedule: schedule,
            plantID: plant.id,
            dueDate: dueDate,
            state: state,
            reason: reason(for: schedule, lastEvent: lastEvent, dueDate: dueDate, calendar: calendar, now: now),
            lastEvent: lastEvent
        )
    }

    /// All live tasks, most urgent first: overdue, due today, then upcoming by
    /// date. Snoozed and paused tasks sort last so UIs can filter or show them.
    public static func tasks(
        in snapshot: GardenSnapshot,
        calendar: Calendar,
        now: Date
    ) -> [CareTaskItem] {
        snapshot.careSchedules
            .compactMap { task(for: $0, in: snapshot, calendar: calendar, now: now) }
            .sorted { lhs, rhs in
                (rank(lhs.state), lhs.dueDate) < (rank(rhs.state), rhs.dueDate)
            }
    }

    // MARK: - Private

    private static func effectivePause(schedule: CareSchedule, snapshot: GardenSnapshot) -> Date? {
        // The later of the schedule's own pause and the garden-wide travel pause.
        [schedule.pausedUntil, snapshot.travelPauseUntil].compactMap { $0 }.max()
    }

    private static func rank(_ state: CareTaskState) -> Int {
        switch state {
        case .overdue: 0
        case .dueToday: 1
        case .upcoming: 2
        case .snoozed: 3
        case .paused: 4
        }
    }

    private static func reason(
        for schedule: CareSchedule,
        lastEvent: CareEvent?,
        dueDate: Date,
        calendar: Calendar,
        now: Date
    ) -> String {
        let cadence = "You review this every \(schedule.intervalDays) day\(schedule.intervalDays == 1 ? "" : "s")."
        guard let lastEvent else {
            return "No \(schedule.displayTitle.lowercased()) recorded yet. \(cadence)"
        }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: lastEvent.occurredAt),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        let ago = days == 0 ? "earlier today" : (days == 1 ? "yesterday" : "\(days) days ago")
        return "\(lastEvent.type.displayName) \(ago). \(cadence)"
    }
}
