import SwiftUI

/// Chooses between bootstrap states, first-run, and the main tab shell.
struct RootView: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    var body: some View {
        Group {
            switch appEnvironment.garden.phase {
            case .loading:
                LoadingStateView(label: "Opening your garden")
            case .failed(let message):
                ErrorStateView(message: message) {
                    Task { await appEnvironment.garden.retryBootstrap() }
                }
            case .ready:
                if appEnvironment.garden.hasCompletedFirstRun {
                    MainTabView()
                } else {
                    FirstRunView()
                }
            }
        }
        .task {
            await appEnvironment.garden.bootstrap()
        }
    }
}

struct MainTabView: View {
    enum Tab: Hashable {
        case today, garden, scan, profile
    }

    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var selection: Tab = .today

    var body: some View {
        TabView(selection: $selection) {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.horizon") }
                .tag(Tab.today)
            GardenView()
                .tabItem { Label("Garden", systemImage: "leaf") }
                .tag(Tab.garden)
            ScanView()
                .tabItem { Label("Scan", systemImage: "camera.viewfinder") }
                .tag(Tab.scan)
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(Tab.profile)
        }
        .tint(GroveColor.brand)
        .onChange(of: appEnvironment.notificationCoordinator.pendingPlantID) {
            // A tapped notification always lands on Today, which opens the plant.
            if appEnvironment.notificationCoordinator.pendingPlantID != nil {
                selection = .today
            }
        }
    }
}

#Preview("Main tabs") {
    MainTabView()
        .environment(AppEnvironment.preview())
}
