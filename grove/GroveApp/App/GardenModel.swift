import Foundation
import SwiftUI
import GroveKit

/// Main-actor face of `GardenService` for SwiftUI. Keeps the latest snapshot in
/// memory so list filtering and search are synchronous, while every mutation
/// goes through the service actor and persists before the UI settles.
@Observable
@MainActor
final class GardenModel {
    enum Phase: Equatable {
        case loading
        case ready
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var snapshot = GardenSnapshot()
    var storageWarning: String?
    /// Set after an archive so the UI can offer a short undo window.
    var pendingUndo: UndoAction?

    private let service: GardenService
    private let media: any MediaStoring
    private let analytics: any AnalyticsTracking
    private let clock: any ClockProviding

    init(
        service: GardenService,
        media: any MediaStoring,
        analytics: any AnalyticsTracking,
        clock: any ClockProviding = SystemClock()
    ) {
        self.service = service
        self.media = media
        self.analytics = analytics
        self.clock = clock
    }

    struct UndoAction: Identifiable, Equatable {
        enum Kind: Equatable {
            case restorePlant(Plant.ID)
            case deleteEvent(CareEvent.ID)
        }

        let id = UUID()
        let message: String
        let kind: Kind
    }

    // MARK: - Lifecycle

    func bootstrap() async {
        guard phase == .loading else { return }
        do {
            try await service.bootstrap()
            snapshot = try await service.currentSnapshot()
            phase = .ready
        } catch {
            phase = .failed(
                "Grove could not read your saved garden. Your data file was left untouched."
            )
        }
    }

    func retryBootstrap() async {
        phase = .loading
        await bootstrap()
    }

    func bootstrapForPreview(seedDemo: Bool) {
        Task {
            try? await service.bootstrap()
            if seedDemo {
                _ = try? await service.installDemoGarden()
                try? await service.markFirstRunComplete()
            }
            snapshot = (try? await service.currentSnapshot()) ?? GardenSnapshot()
            phase = .ready
        }
    }

    // MARK: - Reading (synchronous over the cached snapshot)

    var hasCompletedFirstRun: Bool { snapshot.hasCompletedFirstRun }

    var activePlants: [Plant] { plants(GardenQuery()) }

    func plants(_ query: GardenQuery) -> [Plant] {
        GardenSearch.run(query, over: snapshot, asOf: clock.now)
    }

    func plant(id: Plant.ID) -> Plant? {
        snapshot.plants.first { $0.id == id }
    }

    var locations: [PlantLocation] {
        snapshot.locations
            .filter { $0.archivedAt == nil }
            .sorted { ($0.sortOrder, $0.name) < ($1.sortOrder, $1.name) }
    }

    func location(id: PlantLocation.ID?) -> PlantLocation? {
        guard let id else { return nil }
        return snapshot.locations.first { $0.id == id }
    }

    func roomName(for plant: Plant) -> String? {
        location(id: plant.locationID)?.name
    }

    func plantCount(in locationID: PlantLocation.ID) -> Int {
        snapshot.plants.filter { !$0.isArchived && $0.locationID == locationID }.count
    }

    func status(for plant: Plant) -> DerivedStatus {
        StatusEngine.status(for: plant, in: snapshot, calendar: .current, asOf: clock.now)
    }

    var hasDemoPlants: Bool {
        snapshot.plants.contains { $0.origin == .demo }
    }

    /// Counts backing the Today screen's garden status module.
    struct GardenStatusSummary {
        var doingWell = 0
        var reviewDue = 0
        var gettingToKnow = 0
        var needsAttention = 0
        var total: Int { doingWell + reviewDue + gettingToKnow + needsAttention }
    }

    var statusSummary: GardenStatusSummary {
        var summary = GardenStatusSummary()
        for plant in activePlants {
            switch status(for: plant).status {
            case .doingWell, .recovering: summary.doingWell += 1
            case .reviewDue: summary.reviewDue += 1
            case .needsAttention: summary.needsAttention += 1
            case .unknown, .dormant: summary.gettingToKnow += 1
            }
        }
        return summary
    }

    // MARK: - Intents

    @discardableResult
    func addPlant(_ draft: PlantDraft, imageData: Data?) async throws -> Plant {
        var draft = draft
        if let imageData {
            let asset = try await service.registerMediaAsset(pixelWidth: nil, pixelHeight: nil)
            try await media.saveImageData(imageData, for: asset.id)
            draft.coverAssetID = asset.id
        }
        let plant = try await service.addPlant(draft)
        analytics.track(.plantCreated)
        await refresh()
        return plant
    }

    @discardableResult
    func updatePlant(_ plant: Plant, newImageData: Data?) async throws -> Plant {
        var plant = plant
        if let newImageData {
            let asset = try await service.registerMediaAsset(pixelWidth: nil, pixelHeight: nil)
            try await media.saveImageData(newImageData, for: asset.id)
            plant.coverAssetID = asset.id
        }
        let updated = try await service.updatePlant(plant)
        await refresh()
        return updated
    }

    func archivePlant(_ plant: Plant) async throws {
        _ = try await service.archivePlant(id: plant.id)
        analytics.track(.plantArchived)
        await refresh()
        pendingUndo = UndoAction(
            message: "\(plant.displayName) archived",
            kind: .restorePlant(plant.id)
        )
    }

    func performUndo(_ undo: UndoAction) async {
        pendingUndo = nil
        switch undo.kind {
        case .restorePlant(let plantID):
            _ = try? await service.restorePlant(id: plantID)
        case .deleteEvent(let eventID):
            try? await service.deleteCareEvent(id: eventID)
        }
        await refresh()
    }

    func restorePlant(_ plant: Plant) async throws {
        _ = try await service.restorePlant(id: plant.id)
        await refresh()
    }

    func deletePlant(_ plant: Plant) async throws {
        try await service.deletePlant(id: plant.id)
        if let assetID = plant.coverAssetID {
            await media.deleteImageData(for: assetID)
        }
        await refresh()
    }

    func movePlant(_ plant: Plant, to locationID: PlantLocation.ID?) async throws {
        _ = try await service.movePlant(id: plant.id, to: locationID)
        await refresh()
    }

    @discardableResult
    func addLocation(name: String, type: LocationType) async throws -> PlantLocation {
        let location = try await service.addLocation(name: name, type: type)
        await refresh()
        return location
    }

    func updateLocation(_ location: PlantLocation) async throws {
        _ = try await service.updateLocation(location)
        await refresh()
    }

    func archiveLocation(_ location: PlantLocation) async throws {
        try await service.archiveLocation(id: location.id)
        await refresh()
    }

    func installDemoGarden() async throws {
        _ = try await service.installDemoGarden()
        await refresh()
    }

    func removeDemoGarden() async throws {
        try await service.removeDemoGarden()
        await refresh()
    }

    func completeFirstRun() async {
        try? await service.markFirstRunComplete()
        await refresh()
    }

    func resetFirstRun() async {
        try? await service.resetFirstRun()
        await refresh()
    }

    // MARK: - Care events and schedules (Milestone 2)

    /// Notification scheduler, injected after init to avoid a construction cycle.
    var notifications: (any NotificationScheduling)?

    var careTasks: [CareTaskItem] {
        ScheduleEngine.tasks(in: snapshot, calendar: .current, now: clock.now)
    }

    /// Tasks for the Today queue: overdue and due today.
    var dueTasks: [CareTaskItem] {
        careTasks.filter { $0.state == .overdue || $0.state == .dueToday }
    }

    /// Upcoming tasks within the next week, for the "Coming up" section.
    var upcomingTasks: [CareTaskItem] {
        let horizon = clock.now.addingTimeInterval(7 * 86_400)
        return careTasks.filter { $0.state == .upcoming && $0.dueDate <= horizon }
    }

    var travelPauseUntil: Date? { snapshot.travelPauseUntil }

    var isTravelPaused: Bool {
        guard let until = snapshot.travelPauseUntil else { return false }
        return until > clock.now
    }

    func events(for plantID: Plant.ID) -> [CareEvent] {
        snapshot.careEvents
            .filter { $0.plantID == plantID }
            .sorted { $0.occurredAt > $1.occurredAt }
    }

    func schedules(for plantID: Plant.ID) -> [CareSchedule] {
        snapshot.careSchedules
            .filter { $0.plantID == plantID }
            .sorted { $0.createdAt < $1.createdAt }
    }

    /// Quick log with undo (PRD 10.7): the event saves immediately and the
    /// toast offers a short window to take it back.
    func logEvent(
        plantID: Plant.ID,
        type: CareEventType,
        note: String = "",
        relatedScheduleID: CareSchedule.ID? = nil
    ) async throws {
        let event = try await service.logCareEvent(
            plantID: plantID, type: type, note: note, relatedScheduleID: relatedScheduleID
        )
        analytics.track(.careEventLogged)
        await refresh()
        let name = plant(id: plantID)?.displayName ?? "Plant"
        pendingUndo = UndoAction(
            message: "\(type.displayName) — \(name)",
            kind: .deleteEvent(event.id)
        )
    }

    func deleteEvent(id: CareEvent.ID) async throws {
        try await service.deleteCareEvent(id: id)
        await refresh()
    }

    func completeTask(_ task: CareTaskItem, with type: CareEventType) async throws {
        try await logEvent(
            plantID: task.plantID, type: type, relatedScheduleID: task.schedule.id
        )
    }

    func snoozeTask(_ task: CareTaskItem, days: Int) async throws {
        let until = Calendar.current.date(
            byAdding: .day, value: days, to: Calendar.current.startOfDay(for: clock.now)
        ) ?? clock.now
        _ = try await service.snoozeSchedule(id: task.schedule.id, until: until)
        analytics.track(.careTaskSnoozed)
        await refresh()
    }

    func skipTask(_ task: CareTaskItem) async throws {
        _ = try await service.skipSchedule(id: task.schedule.id)
        await refresh()
    }

    @discardableResult
    func addSchedule(
        plantID: Plant.ID,
        kind: CareTaskKind,
        intervalDays: Int,
        customTitle: String? = nil
    ) async throws -> CareSchedule {
        let schedule = try await service.addSchedule(
            plantID: plantID, kind: kind, intervalDays: intervalDays, customTitle: customTitle
        )
        await refresh()
        return schedule
    }

    func updateSchedule(_ schedule: CareSchedule) async throws {
        _ = try await service.updateSchedule(schedule)
        await refresh()
    }

    func deleteSchedule(id: CareSchedule.ID) async throws {
        try await service.deleteSchedule(id: id)
        await refresh()
    }

    func setTravelPause(until: Date?) async throws {
        try await service.setTravelPause(until: until)
        await refresh()
    }

    // MARK: - Private

    private func refresh() async {
        snapshot = (try? await service.currentSnapshot()) ?? snapshot
        refreshNotifications()
    }

    /// Re-plans local notifications to mirror the live queue. Fire-and-forget:
    /// notification failures must never affect in-app behavior.
    private func refreshNotifications() {
        guard let notifications else { return }
        let tasks = careTasks
        let names = Dictionary(
            uniqueKeysWithValues: snapshot.plants.map { ($0.id, $0.displayName) }
        )
        Task {
            await notifications.refresh(tasks: tasks, plantNames: names)
        }
    }
}
