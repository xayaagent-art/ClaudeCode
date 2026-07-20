import SwiftUI
import UserNotifications
import GroveKit

@main
struct GroveApp: App {
    @State private var environment: AppEnvironment
    private let notificationDelegate: NotificationDelegate

    init() {
        let environment = AppEnvironment.live()
        _environment = State(initialValue: environment)
        // The delegate must be set before the app finishes launching so a
        // notification tap that opened the app is delivered.
        notificationDelegate = NotificationDelegate(coordinator: environment.notificationCoordinator)
        UNUserNotificationCenter.current().delegate = notificationDelegate
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
        }
    }
}
