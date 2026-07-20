import Foundation
import Testing
@testable import GroveKit

@Suite("Schedule engine")
struct ScheduleEngineTests {
    /// Noon UTC on a fixed day, so local-day math is stable in every zone.
    private let now = Date(timeIntervalSince1970: 1_760_011_200)

    private func calendar(_ timezone: String) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timezone)!
        return calendar
    }

    private func makeGarden(
        intervalDays: Int = 10,
        kind: CareTaskKind = .checkSoil,
        anchorDaysAgo: Int = 20
    ) -> (GardenSnapshot, Plant, CareSchedule) {
        let created = now.addingTimeInterval(-40 * 86_400)
        let plant = Plant(nickname: "Frank", createdAt: created, updatedAt: created)
        let anchor = now.addingTimeInterval(-TimeInterval(anchorDaysAgo) * 86_400)
        let schedule = CareSchedule(
            plantID: plant.id, kind: kind, intervalDays: intervalDays,
            anchorDate: anchor, createdAt: anchor, updatedAt: anchor
        )
        let snapshot = GardenSnapshot(plants: [plant], careSchedules: [schedule])
        return (snapshot, plant, schedule)
    }

    private func addEvent(
        _ snapshot: inout GardenSnapshot,
        plant: Plant,
        type: CareEventType,
        daysAgo: Int,
        relatedScheduleID: CareSchedule.ID? = nil
    ) {
        let at = now.addingTimeInterval(-TimeInterval(daysAgo) * 86_400)
        snapshot.careEvents.append(CareEvent(
            plantID: plant.id, type: type, occurredAt: at,
            relatedScheduleID: relatedScheduleID, createdAt: at
        ))
    }

    // MARK: - Due date derivation

    @Test("With no events, the cycle counts from the anchor")
    func dueFromAnchor() {
        let (snapshot, _, schedule) = makeGarden(intervalDays: 10, anchorDaysAgo: 20)
        let cal = calendar("UTC")
        let due = ScheduleEngine.nextDueDate(for: schedule, events: snapshot.careEvents, calendar: cal)
        let expected = cal.date(byAdding: .day, value: 10, to: cal.startOfDay(for: schedule.anchorDate))
        #expect(due == expected)
    }

    @Test("The last satisfying event restarts the cycle")
    func dueFromLastEvent() {
        var (snapshot, plant, schedule) = makeGarden(intervalDays: 10)
        addEvent(&snapshot, plant: plant, type: .wateredThoroughly, daysAgo: 4)
        let cal = calendar("UTC")
        let due = ScheduleEngine.nextDueDate(for: schedule, events: snapshot.careEvents, calendar: cal)
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: due).day
        #expect(days == 6)
    }

    @Test("Watering satisfies a soil-check review, but misting does not")
    func satisfactionMapping() {
        #expect(ScheduleEngine.satisfyingEventTypes(for: .checkSoil).contains(.wateredThoroughly))
        #expect(!ScheduleEngine.satisfyingEventTypes(for: .checkSoil).contains(.misted))
        #expect(!ScheduleEngine.satisfyingEventTypes(for: .mist).contains(.wateredSmallAmount))
    }

    @Test("A skip linked to the schedule restarts the cycle")
    func skipRestartsCycle() {
        var (snapshot, plant, schedule) = makeGarden(intervalDays: 10, anchorDaysAgo: 30)
        addEvent(&snapshot, plant: plant, type: .skipped, daysAgo: 2, relatedScheduleID: schedule.id)
        let cal = calendar("UTC")
        let task = ScheduleEngine.task(for: schedule, in: snapshot, calendar: cal, now: now)
        #expect(task?.state == .upcoming)
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: task!.dueDate).day
        #expect(days == 8)
    }

    // MARK: - States

    @Test("Overdue, due today, and upcoming boundaries")
    func stateBoundaries() {
        let cal = calendar("UTC")
        for (daysAgo, expected) in [(11, CareTaskState.overdue), (10, .dueToday), (9, .upcoming)] {
            var (snapshot, plant, schedule) = makeGarden(intervalDays: 10)
            addEvent(&snapshot, plant: plant, type: .wateredThoroughly, daysAgo: daysAgo)
            let task = ScheduleEngine.task(for: schedule, in: snapshot, calendar: cal, now: now)
            #expect(task?.state == expected, "watered \(daysAgo) days ago")
        }
    }

    @Test("Snooze hides the task until the chosen date")
    func snoozeState() {
        var (snapshot, _, _) = makeGarden(intervalDays: 5, anchorDaysAgo: 20)
        snapshot.careSchedules[0].snoozedUntil = now.addingTimeInterval(86_400)
        let task = ScheduleEngine.task(
            for: snapshot.careSchedules[0], in: snapshot, calendar: calendar("UTC"), now: now
        )
        #expect(task?.state == .snoozed)
    }

    @Test("A schedule pause and the garden travel pause both suspend the task")
    func pauseStates() {
        var (snapshot, _, _) = makeGarden(intervalDays: 5, anchorDaysAgo: 20)
        snapshot.careSchedules[0].pausedUntil = now.addingTimeInterval(3 * 86_400)
        let paused = ScheduleEngine.task(
            for: snapshot.careSchedules[0], in: snapshot, calendar: calendar("UTC"), now: now
        )
        #expect(paused?.state == .paused)

        snapshot.careSchedules[0].pausedUntil = nil
        snapshot.travelPauseUntil = now.addingTimeInterval(3 * 86_400)
        let travelPaused = ScheduleEngine.task(
            for: snapshot.careSchedules[0], in: snapshot, calendar: calendar("UTC"), now: now
        )
        #expect(travelPaused?.state == .paused)
    }

    @Test("Archived plants and disabled schedules produce no tasks")
    func excludedSchedules() {
        var (snapshot, _, schedule) = makeGarden()
        snapshot.plants[0].lifecycle = .archived
        #expect(ScheduleEngine.task(for: schedule, in: snapshot, calendar: calendar("UTC"), now: now) == nil)

        snapshot.plants[0].lifecycle = .active
        snapshot.careSchedules[0].isEnabled = false
        #expect(ScheduleEngine.task(
            for: snapshot.careSchedules[0], in: snapshot, calendar: calendar("UTC"), now: now
        ) == nil)
    }

    @Test("Tasks sort most urgent first")
    func taskOrdering() {
        let created = now.addingTimeInterval(-40 * 86_400)
        let plant = Plant(nickname: "Frank", createdAt: created, updatedAt: created)
        func schedule(_ kind: CareTaskKind, anchorDaysAgo: Int, interval: Int) -> CareSchedule {
            let anchor = now.addingTimeInterval(-TimeInterval(anchorDaysAgo) * 86_400)
            return CareSchedule(
                plantID: plant.id, kind: kind, intervalDays: interval,
                anchorDate: anchor, createdAt: anchor, updatedAt: anchor
            )
        }
        let snapshot = GardenSnapshot(
            plants: [plant],
            careSchedules: [
                schedule(.rotate, anchorDaysAgo: 2, interval: 30),   // upcoming
                schedule(.checkSoil, anchorDaysAgo: 12, interval: 10), // overdue
                schedule(.mist, anchorDaysAgo: 3, interval: 3),      // due today
            ]
        )
        let states = ScheduleEngine.tasks(in: snapshot, calendar: calendar("UTC"), now: now).map(\.state)
        #expect(states == [.overdue, .dueToday, .upcoming])
    }

    @Test("Every task carries a non-empty reason")
    func reasonsExist() {
        var (snapshot, plant, schedule) = makeGarden(intervalDays: 10)
        let bare = ScheduleEngine.task(for: schedule, in: snapshot, calendar: calendar("UTC"), now: now)
        #expect(bare?.reason.contains("No check soil recorded yet") == true)

        addEvent(&snapshot, plant: plant, type: .wateredThoroughly, daysAgo: 9)
        let informed = ScheduleEngine.task(for: schedule, in: snapshot, calendar: calendar("UTC"), now: now)
        #expect(informed?.reason.contains("Watered thoroughly 9 days ago") == true)
    }

    // MARK: - Timezones and DST

    @Test("A 10-day interval spans DST spring-forward as 10 calendar days")
    func dstSpringForward() {
        // US DST began 2026-03-08. Water on 2026-03-04 in New York; the review
        // must fall on 2026-03-14 local — even though only 9×24+23 hours pass.
        let cal = calendar("America/New_York")
        var comps = DateComponents(year: 2026, month: 3, day: 4, hour: 18)
        comps.timeZone = cal.timeZone
        let watered = cal.date(from: comps)!
        let plant = Plant(nickname: "Frank", createdAt: watered, updatedAt: watered)
        let schedule = CareSchedule(
            plantID: plant.id, kind: .water, intervalDays: 10,
            anchorDate: watered, createdAt: watered, updatedAt: watered
        )
        var snapshot = GardenSnapshot(plants: [plant], careSchedules: [schedule])
        snapshot.careEvents.append(CareEvent(
            plantID: plant.id, type: .wateredThoroughly, occurredAt: watered, createdAt: watered
        ))

        let due = ScheduleEngine.nextDueDate(for: schedule, events: snapshot.careEvents, calendar: cal)
        let dueComps = cal.dateComponents([.year, .month, .day], from: due)
        #expect(dueComps.year == 2026 && dueComps.month == 3 && dueComps.day == 14)

        let elapsed = due.timeIntervalSince(cal.startOfDay(for: watered))
        #expect(elapsed == 10 * 86_400 - 3_600, "spring forward removes one hour")
    }

    @Test("A review crossing DST fall-back still lands on the right local day")
    func dstFallBack() {
        // US DST ends 2026-11-01. Water on 2026-10-28; due 2026-11-04 local.
        let cal = calendar("America/New_York")
        var comps = DateComponents(year: 2026, month: 10, day: 28, hour: 9)
        comps.timeZone = cal.timeZone
        let watered = cal.date(from: comps)!
        let schedule = CareSchedule(
            plantID: Plant.ID(), kind: .water, intervalDays: 7,
            anchorDate: watered, createdAt: watered, updatedAt: watered
        )
        let due = ScheduleEngine.nextDueDate(for: schedule, events: [], calendar: cal)
        let dueComps = cal.dateComponents([.year, .month, .day], from: due)
        #expect(dueComps.year == 2026 && dueComps.month == 11 && dueComps.day == 4)
    }

    @Test("Half-hour and 45-minute offset timezones behave identically")
    func unusualOffsets() {
        for zone in ["Asia/Kathmandu", "Australia/Adelaide", "Pacific/Chatham"] {
            let cal = calendar(zone)
            let (snapshot, _, schedule) = makeGarden(intervalDays: 7, anchorDaysAgo: 3)
            let due = ScheduleEngine.nextDueDate(for: schedule, events: snapshot.careEvents, calendar: cal)
            let days = cal.dateComponents(
                [.day], from: cal.startOfDay(for: schedule.anchorDate), to: due
            ).day
            #expect(days == 7, zone)
        }
    }

    @Test("The same instant produces day-consistent due dates across zones")
    func crossZoneConsistency() {
        let (snapshot, _, schedule) = makeGarden(intervalDays: 10, anchorDaysAgo: 20)
        for zone in ["UTC", "America/Los_Angeles", "Asia/Tokyo"] {
            let cal = calendar(zone)
            let due = ScheduleEngine.nextDueDate(for: schedule, events: snapshot.careEvents, calendar: cal)
            let days = cal.dateComponents(
                [.day], from: cal.startOfDay(for: schedule.anchorDate), to: due
            ).day
            #expect(days == 10, zone)
        }
    }
}
