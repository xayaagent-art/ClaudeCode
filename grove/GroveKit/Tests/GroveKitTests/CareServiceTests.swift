import Foundation
import Testing
@testable import GroveKit

@Suite("Care event logging")
struct CareEventServiceTests {
    @Test("Logging an event persists immediately and appears in the timeline")
    func logAndRead() async throws {
        let (service, store, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let event = try await service.logCareEvent(plantID: plant.id, type: .wateredThoroughly)

        let timeline = try await service.careEvents(for: plant.id)
        #expect(timeline.map(\.id) == [event.id])
        #expect(try await store.load().careEvents.count == 1)
    }

    @Test("Undo removes the event")
    func undoDeletes() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let event = try await service.logCareEvent(plantID: plant.id, type: .wateredThoroughly)
        try await service.deleteCareEvent(id: event.id)
        #expect(try await service.careEvents(for: plant.id).isEmpty)
    }

    @Test("Editing keeps createdAt and stamps editedAt")
    func editEvent() async throws {
        let (service, _, clock) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let event = try await service.logCareEvent(plantID: plant.id, type: .soilCheckedDry)
        clock.advance(byDays: 1)
        var edited = event
        edited.note = "Very dry at the bottom"
        let updated = try await service.updateCareEvent(edited)
        #expect(updated.createdAt == event.createdAt)
        #expect(updated.editedAt == clock.now)
    }

    @Test("Logging against a missing plant fails cleanly")
    func missingPlant() async throws {
        let (service, _, _) = try await makeService()
        await #expect(throws: GardenError.plantNotFound) {
            try await service.logCareEvent(plantID: Plant.ID(), type: .misted)
        }
    }

    @Test("Timeline sorts newest first")
    func timelineOrder() async throws {
        let (service, _, clock) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        _ = try await service.logCareEvent(plantID: plant.id, type: .wateredThoroughly)
        clock.advance(byDays: 2)
        _ = try await service.logCareEvent(plantID: plant.id, type: .rotated)
        let types = try await service.careEvents(for: plant.id).map(\.type)
        #expect(types == [.rotated, .wateredThoroughly])
    }

    @Test("Completing a review clears its snooze")
    func completionClearsSnooze() async throws {
        let (service, _, clock) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let schedule = try await service.addSchedule(plantID: plant.id, kind: .checkSoil, intervalDays: 7)
        _ = try await service.snoozeSchedule(id: schedule.id, until: clock.now.addingTimeInterval(86_400))
        _ = try await service.logCareEvent(plantID: plant.id, type: .wateredThoroughly)
        let refreshed = try await service.schedules(for: plant.id)[0]
        #expect(refreshed.snoozedUntil == nil)
    }
}

@Suite("Care schedules")
struct CareScheduleServiceTests {
    @Test("Creating a repeating review schedule")
    func createSchedule() async throws {
        let (service, _, clock) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let schedule = try await service.addSchedule(plantID: plant.id, kind: .checkSoil, intervalDays: 10)
        #expect(schedule.anchorDate == clock.now)
        #expect(schedule.isEnabled)
        #expect(try await service.schedules(for: plant.id).count == 1)
    }

    @Test("Zero or negative intervals are rejected")
    func invalidInterval() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        await #expect(throws: GardenError.invalidInterval) {
            try await service.addSchedule(plantID: plant.id, kind: .water, intervalDays: 0)
        }
    }

    @Test("Skip records a linked skip event that restarts the cycle")
    func skipLogsEvent() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let schedule = try await service.addSchedule(plantID: plant.id, kind: .fertilize, intervalDays: 30)
        let event = try await service.skipSchedule(id: schedule.id)
        #expect(event.type == .skipped)
        #expect(event.relatedScheduleID == schedule.id)
    }

    @Test("Travel pause suspends every task and resuming clears it")
    func travelPause() async throws {
        let (service, _, clock) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        _ = try await service.addSchedule(plantID: plant.id, kind: .checkSoil, intervalDays: 1)
        clock.advance(byDays: 3)

        try await service.setTravelPause(until: clock.now.addingTimeInterval(7 * 86_400))
        var snapshot = try await service.currentSnapshot()
        var states = ScheduleEngine.tasks(in: snapshot, calendar: .current, now: clock.now).map(\.state)
        #expect(states == [.paused])

        try await service.setTravelPause(until: nil)
        snapshot = try await service.currentSnapshot()
        states = ScheduleEngine.tasks(in: snapshot, calendar: .current, now: clock.now).map(\.state)
        #expect(states == [.overdue])
    }

    @Test("Deleting a schedule keeps its history events")
    func deleteScheduleKeepsEvents() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        let schedule = try await service.addSchedule(plantID: plant.id, kind: .water, intervalDays: 7)
        _ = try await service.logCareEvent(
            plantID: plant.id, type: .wateredThoroughly, relatedScheduleID: schedule.id
        )
        try await service.deleteSchedule(id: schedule.id)
        #expect(try await service.schedules(for: plant.id).isEmpty)
        #expect(try await service.careEvents(for: plant.id).count == 1)
    }
}

@Suite("Care-aware status")
struct CareStatusTests {
    private let base = Date(timeIntervalSince1970: 1_760_011_200)

    @Test("A due review reads as 'Check soon', never as unhealthy")
    func overdueIsCheckSoonNotDanger() {
        let created = base.addingTimeInterval(-60 * 86_400)
        let plant = Plant(nickname: "Frank", createdAt: created, updatedAt: created)
        let anchor = base.addingTimeInterval(-30 * 86_400)
        let snapshot = GardenSnapshot(
            plants: [plant],
            careSchedules: [CareSchedule(
                plantID: plant.id, kind: .checkSoil, intervalDays: 7,
                anchorDate: anchor, createdAt: anchor, updatedAt: anchor
            )]
        )
        let derived = StatusEngine.status(for: plant, in: snapshot, calendar: .current, asOf: base)
        #expect(derived.status == .reviewDue)
        #expect(derived.status != .needsAttention)
    }

    @Test("Recent care reads as doing well with the event as the reason")
    func recentCareDoingWell() {
        let created = base.addingTimeInterval(-60 * 86_400)
        let plant = Plant(nickname: "Frank", createdAt: created, updatedAt: created)
        let wateredAt = base.addingTimeInterval(-2 * 86_400)
        let snapshot = GardenSnapshot(
            plants: [plant],
            careEvents: [CareEvent(
                plantID: plant.id, type: .wateredThoroughly,
                occurredAt: wateredAt, createdAt: wateredAt
            )]
        )
        let derived = StatusEngine.status(for: plant, in: snapshot, calendar: .current, asOf: base)
        #expect(derived.status == .doingWell)
        #expect(derived.reason.contains("Watered thoroughly"))
    }
}

@Suite("Snapshot migration")
struct SnapshotMigrationTests {
    @Test("A v1 document without care fields loads with empty care data")
    func v1DocumentLoads() throws {
        let v1JSON = """
        {
          "schemaVersion": 1,
          "plants": [],
          "locations": [],
          "mediaAssets": [],
          "hasCompletedFirstRun": true
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let snapshot = try decoder.decode(GardenSnapshot.self, from: Data(v1JSON.utf8))
        #expect(snapshot.careEvents.isEmpty)
        #expect(snapshot.careSchedules.isEmpty)
        #expect(snapshot.travelPauseUntil == nil)
        #expect(snapshot.hasCompletedFirstRun)
    }

    @Test("Demo garden install now includes care history and schedules")
    func demoIncludesCare() async throws {
        let (service, _, _) = try await makeService()
        _ = try await service.installDemoGarden()
        let snapshot = try await service.currentSnapshot()
        #expect(!snapshot.careEvents.isEmpty)
        #expect(!snapshot.careSchedules.isEmpty)

        let tasks = ScheduleEngine.tasks(in: snapshot, calendar: .current, now: Date(timeIntervalSince1970: 1_760_000_000))
        #expect(tasks.contains { $0.state == .overdue || $0.state == .dueToday })

        try await service.removeDemoGarden()
        let cleared = try await service.currentSnapshot()
        #expect(cleared.careEvents.isEmpty)
        #expect(cleared.careSchedules.isEmpty)
    }
}
