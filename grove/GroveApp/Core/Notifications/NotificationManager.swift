import Foundation
import UserNotifications
import GroveKit

/// Local-notification boundary (PRD 10.6, 22). Notifications mirror the live
/// task queue; they are a convenience layer, and a denied permission must
/// never reduce in-app functionality.
protocol NotificationScheduling: Sendable {
    /// Asks for permission if not yet determined. Returns whether granted.
    func requestAuthorization() async -> Bool
    func authorizationStatus() async -> UNAuthorizationStatus
    /// Re-plans pending notifications to match the current tasks.
    func refresh(tasks: [CareTaskItem], plantNames: [Plant.ID: String]) async
}

/// UNUserNotificationCenter-backed scheduler. One notification per task, fired
/// at a calm mid-morning hour on the due day. Copy always reflects uncertainty:
/// reviews "may be ready", plants are never declared thirsty (PRD 10.6).
actor UNNotificationScheduler: NotificationScheduling {
    static let categoryIdentifier = "grove.care.review"
    static let notificationHour = 9

    private let center = UNUserNotificationCenter.current()

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func refresh(tasks: [CareTaskItem], plantNames: [Plant.ID: String]) async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }

        // Replace only Grove's care notifications; leave anything else alone.
        let pending = await center.pendingNotificationRequests()
        let careIDs = pending
            .filter { $0.identifier.hasPrefix("care-") }
            .map(\.identifier)
        center.removePendingNotificationRequests(withIdentifiers: careIDs)

        let calendar = Calendar.current
        let startOfTomorrow = calendar.date(
            byAdding: .day, value: 1, to: calendar.startOfDay(for: Date())
        ) ?? Date()

        // Future due dates only — the app itself surfaces anything already due.
        let upcoming = tasks
            .filter { ($0.state == .upcoming || $0.state == .snoozed) && $0.dueDate >= startOfTomorrow }
            .sorted { $0.dueDate < $1.dueDate }
            .prefix(20)

        for task in upcoming {
            let plantName = plantNames[task.plantID] ?? "Your plant"
            let content = UNMutableNotificationContent()
            content.title = "\(plantName) may be ready"
            content.body = notificationBody(for: task, plantName: plantName)
            content.categoryIdentifier = Self.categoryIdentifier
            content.userInfo = ["plantID": task.plantID.rawValue.uuidString]
            content.sound = nil

            var components = calendar.dateComponents([.year, .month, .day], from: task.dueDate)
            components.hour = Self.notificationHour
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(
                identifier: "care-\(task.schedule.id.rawValue.uuidString)",
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
    }

    private func notificationBody(for task: CareTaskItem, plantName: String) -> String {
        let action = task.schedule.displayTitle.lowercased()
        if let lastEvent = task.lastEvent {
            let days = Calendar.current.dateComponents(
                [.day], from: lastEvent.occurredAt, to: task.dueDate
            ).day ?? task.schedule.intervalDays
            return "A \(action) review is due. \(lastEvent.type.displayName) \(days) days before."
        }
        return "A \(action) review is due for \(plantName)."
    }
}

/// No-op scheduler for previews and UI tests.
struct NoOpNotificationScheduler: NotificationScheduling {
    func requestAuthorization() async -> Bool { false }
    func authorizationStatus() async -> UNAuthorizationStatus { .notDetermined }
    func refresh(tasks: [CareTaskItem], plantNames: [Plant.ID: String]) async {}
}

/// Routes notification taps into the UI: the delegate stores the target plant,
/// and the tab shell navigates when it changes (deep link, PRD Milestone 2).
@Observable
@MainActor
final class NotificationCoordinator {
    var pendingPlantID: Plant.ID?

    fileprivate func handle(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo["plantID"] as? String, let uuid = UUID(uuidString: raw) else {
            return
        }
        pendingPlantID = Plant.ID(rawValue: uuid)
    }
}

/// UNUserNotificationCenter delegate bridging into the coordinator.
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    private let coordinator: NotificationCoordinator

    init(coordinator: NotificationCoordinator) {
        self.coordinator = coordinator
        super.init()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        await MainActor.run {
            coordinator.handle(userInfo: userInfo)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        // If the app is open, the Today queue already shows the task.
        [.banner]
    }
}
