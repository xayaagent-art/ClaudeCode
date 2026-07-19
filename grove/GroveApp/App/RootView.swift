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
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.horizon") }
            GardenView()
                .tabItem { Label("Garden", systemImage: "leaf") }
            ScanView()
                .tabItem { Label("Scan", systemImage: "camera.viewfinder") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .tint(GroveColor.brand)
    }
}

#Preview("Main tabs") {
    MainTabView()
        .environment(AppEnvironment.preview())
}
