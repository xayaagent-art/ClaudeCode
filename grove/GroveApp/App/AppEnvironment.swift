import Foundation
import SwiftUI
import GroveKit

/// Composition root. Builds the dependency graph once and hands the pieces to
/// SwiftUI through the environment — no singletons, no service locators in views.
@Observable
@MainActor
final class AppEnvironment {
    let garden: GardenModel
    let media: any MediaStoring
    let analytics: any AnalyticsTracking
    let notifications: any NotificationScheduling
    let notificationCoordinator: NotificationCoordinator

    init(
        garden: GardenModel,
        media: any MediaStoring,
        analytics: any AnalyticsTracking,
        notifications: any NotificationScheduling = NoOpNotificationScheduler(),
        notificationCoordinator: NotificationCoordinator = NotificationCoordinator()
    ) {
        self.garden = garden
        self.media = media
        self.analytics = analytics
        self.notifications = notifications
        self.notificationCoordinator = notificationCoordinator
        garden.notifications = notifications
    }

    static func live() -> AppEnvironment {
        let analytics: any AnalyticsTracking = NoOpAnalytics()

        if ProcessInfo.processInfo.arguments.contains("--uitest-reset") {
            // UI tests get a fresh, throwaway garden every launch.
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("grove-uitest-\(UUID().uuidString)", isDirectory: true)
            let store = JSONGardenStore(fileURL: directory.appendingPathComponent("garden.json"))
            let media = FileMediaStore(directory: directory.appendingPathComponent("Media"))
            let service = GardenService(repository: store)
            return AppEnvironment(
                garden: GardenModel(service: service, media: media, analytics: analytics),
                media: media,
                analytics: analytics
            )
        }

        do {
            let fileURL = try JSONGardenStore.defaultFileURL()
            let store = JSONGardenStore(fileURL: fileURL)
            let media = FileMediaStore(
                directory: fileURL.deletingLastPathComponent().appendingPathComponent("Media")
            )
            let service = GardenService(repository: store)
            return AppEnvironment(
                garden: GardenModel(service: service, media: media, analytics: analytics),
                media: media,
                analytics: analytics,
                notifications: UNNotificationScheduler()
            )
        } catch {
            // Application Support was unavailable — extremely rare. Fall back to
            // an in-memory garden so the app still opens, and say so honestly.
            let media = InMemoryMediaStore()
            let service = GardenService(repository: InMemoryGardenStore())
            let garden = GardenModel(service: service, media: media, analytics: analytics)
            garden.storageWarning = "Grove could not access local storage. Changes made now will not be saved."
            return AppEnvironment(garden: garden, media: media, analytics: analytics)
        }
    }

    /// In-memory environment seeded with the demo garden, for previews.
    static func preview(seeded: Bool = true) -> AppEnvironment {
        let media = InMemoryMediaStore()
        let service = GardenService(repository: InMemoryGardenStore())
        let garden = GardenModel(service: service, media: media, analytics: NoOpAnalytics())
        garden.bootstrapForPreview(seedDemo: seeded)
        return AppEnvironment(garden: garden, media: media, analytics: NoOpAnalytics())
    }
}
