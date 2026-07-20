import Foundation

/// Milestone 2 mutations: care events and schedules. Same rules as the rest of
/// the service — validate, timestamp honestly, persist before returning.
extension GardenService {
    // MARK: - Care events

    /// Records a care event. Offline-safe by construction: the repository is
    /// local, so a watering log can never be lost to connectivity (PRD 10.7).
    @discardableResult
    public func logCareEvent(
        plantID: Plant.ID,
        type: CareEventType,
        occurredAt: Date? = nil,
        note: String = "",
        relatedScheduleID: CareSchedule.ID? = nil
    ) async throws -> CareEvent {
        var snapshot = try currentSnapshot()
        guard snapshot.plants.contains(where: { $0.id == plantID }) else {
            throw GardenError.plantNotFound
        }
        let now = clockNow
        let event = CareEvent(
            plantID: plantID,
            type: type,
            occurredAt: occurredAt ?? now,
            note: note,
            relatedScheduleID: relatedScheduleID,
            createdAt: now
        )
        snapshot.careEvents.append(event)
        // Completing a review also clears any snooze on that schedule.
        if let scheduleIndex = snapshot.careSchedules.firstIndex(where: {
            $0.plantID == plantID && ScheduleEngine.satisfyingEventTypes(for: $0.kind).contains(type)
        }) {
            snapshot.careSchedules[scheduleIndex].snoozedUntil = nil
        }
        try await persistSnapshot(snapshot)
        return event
    }

    /// Removes an event — the undo path for quick logging.
    public func deleteCareEvent(id: CareEvent.ID) async throws {
        var snapshot = try currentSnapshot()
        guard snapshot.careEvents.contains(where: { $0.id == id }) else {
            throw GardenError.careEventNotFound
        }
        snapshot.careEvents.removeAll { $0.id == id }
        try await persistSnapshot(snapshot)
    }

    /// Edits an event's note or timestamp; the record stays editable in the
    /// timeline (PRD 10.7 undo rules).
    @discardableResult
    public func updateCareEvent(_ updated: CareEvent) async throws -> CareEvent {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.careEvents.firstIndex(where: { $0.id == updated.id }) else {
            throw GardenError.careEventNotFound
        }
        var event = updated
        event.createdAt = snapshot.careEvents[index].createdAt
        event.editedAt = clockNow
        snapshot.careEvents[index] = event
        try await persistSnapshot(snapshot)
        return event
    }

    public func careEvents(for plantID: Plant.ID) throws -> [CareEvent] {
        try currentSnapshot().careEvents
            .filter { $0.plantID == plantID }
            .sorted { $0.occurredAt > $1.occurredAt }
    }

    // MARK: - Schedules

    @discardableResult
    public func addSchedule(
        plantID: Plant.ID,
        kind: CareTaskKind,
        intervalDays: Int,
        customTitle: String? = nil
    ) async throws -> CareSchedule {
        var snapshot = try currentSnapshot()
        guard snapshot.plants.contains(where: { $0.id == plantID }) else {
            throw GardenError.plantNotFound
        }
        guard intervalDays >= 1 else { throw GardenError.invalidInterval }
        let now = clockNow
        let schedule = CareSchedule(
            plantID: plantID,
            kind: kind,
            customTitle: customTitle?.trimmed.nonEmpty,
            intervalDays: intervalDays,
            anchorDate: now,
            createdAt: now,
            updatedAt: now
        )
        snapshot.careSchedules.append(schedule)
        try await persistSnapshot(snapshot)
        return schedule
    }

    @discardableResult
    public func updateSchedule(_ updated: CareSchedule) async throws -> CareSchedule {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.careSchedules.firstIndex(where: { $0.id == updated.id }) else {
            throw GardenError.scheduleNotFound
        }
        guard updated.intervalDays >= 1 else { throw GardenError.invalidInterval }
        var schedule = updated
        schedule.createdAt = snapshot.careSchedules[index].createdAt
        schedule.updatedAt = clockNow
        snapshot.careSchedules[index] = schedule
        try await persistSnapshot(snapshot)
        return schedule
    }

    public func deleteSchedule(id: CareSchedule.ID) async throws {
        var snapshot = try currentSnapshot()
        guard snapshot.careSchedules.contains(where: { $0.id == id }) else {
            throw GardenError.scheduleNotFound
        }
        snapshot.careSchedules.removeAll { $0.id == id }
        try await persistSnapshot(snapshot)
    }

    public func schedules(for plantID: Plant.ID) throws -> [CareSchedule] {
        try currentSnapshot().careSchedules
            .filter { $0.plantID == plantID }
            .sorted { $0.createdAt < $1.createdAt }
    }

    /// Snooze: the task disappears until the given date, then returns due.
    @discardableResult
    public func snoozeSchedule(id: CareSchedule.ID, until: Date) async throws -> CareSchedule {
        try await mutateSchedule(id: id) { schedule in
            schedule.snoozedUntil = until
        }
    }

    /// Skip: records an explicit skip event, which restarts the cycle from now.
    @discardableResult
    public func skipSchedule(id: CareSchedule.ID) async throws -> CareEvent {
        let snapshot = try currentSnapshot()
        guard let schedule = snapshot.careSchedules.first(where: { $0.id == id }) else {
            throw GardenError.scheduleNotFound
        }
        return try await logCareEvent(
            plantID: schedule.plantID,
            type: .skipped,
            relatedScheduleID: schedule.id
        )
    }

    @discardableResult
    public func pauseSchedule(id: CareSchedule.ID, until: Date?) async throws -> CareSchedule {
        try await mutateSchedule(id: id) { schedule in
            schedule.pausedUntil = until
        }
    }

    /// Garden-wide travel pause. Pass nil to resume.
    public func setTravelPause(until: Date?) async throws {
        var snapshot = try currentSnapshot()
        snapshot.travelPauseUntil = until
        try await persistSnapshot(snapshot)
    }

    // MARK: - Private

    private func mutateSchedule(
        id: CareSchedule.ID,
        _ change: (inout CareSchedule) -> Void
    ) async throws -> CareSchedule {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.careSchedules.firstIndex(where: { $0.id == id }) else {
            throw GardenError.scheduleNotFound
        }
        var schedule = snapshot.careSchedules[index]
        change(&schedule)
        schedule.updatedAt = clockNow
        snapshot.careSchedules[index] = schedule
        try await persistSnapshot(snapshot)
        return schedule
    }
}
