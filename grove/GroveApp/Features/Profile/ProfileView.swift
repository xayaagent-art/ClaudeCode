import SwiftUI
import UserNotifications
import GroveKit

/// Profile and settings. Contains only things that actually work: garden data
/// management, care pause, notification status, onboarding reset, privacy.
struct ProfileView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var confirmRemoveDemo = false
    @State private var infoMessage: String?
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    travelPauseRow
                    notificationRow
                } header: {
                    Text("Care reminders")
                } footer: {
                    Text("Travel mode pauses every review reminder until you're back. Notifications are optional — the Today queue works either way.")
                }

                Section("Garden") {
                    NavigationLink {
                        ArchivedPlantsView()
                    } label: {
                        Label("Archived plants", systemImage: "archivebox")
                    }
                    if garden.hasDemoPlants {
                        Button {
                            confirmRemoveDemo = true
                        } label: {
                            Label("Remove demo garden", systemImage: "trash")
                        }
                    } else {
                        Button {
                            installDemo()
                        } label: {
                            Label("Add demo garden", systemImage: "leaf")
                        }
                    }
                }

                Section {
                    Button("Show welcome screen again") {
                        Task { await garden.resetFirstRun() }
                    }
                } header: {
                    Text("Onboarding")
                } footer: {
                    Text("Takes you back to the first-launch screen. Your plants are not affected.")
                }

                Section {
                    LabeledContent("Storage", value: "On this device")
                    LabeledContent("Account", value: "None needed")
                } header: {
                    Text("Privacy")
                } footer: {
                    Text("Your garden is private by default and stored locally on this iPhone. Grove does not send your plants, photos, or notes anywhere. When cloud features arrive, they will be optional and clearly explained.")
                }

                Section("About") {
                    LabeledContent("Version", value: appVersion)
                    #if DEBUG
                    NavigationLink("Component gallery") {
                        ComponentGalleryView()
                    }
                    #endif
                }
            }
            .navigationTitle("Profile")
            .confirmationDialog(
                "Remove the demo garden?",
                isPresented: $confirmRemoveDemo,
                titleVisibility: .visible
            ) {
                Button("Remove demo plants", role: .destructive) {
                    Task { try? await garden.removeDemoGarden() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Demo plants and their rooms are removed. Your own plants are kept.")
            }
            .alert("Done", isPresented: .init(
                get: { infoMessage != nil },
                set: { if !$0 { infoMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(infoMessage ?? "")
            }
        }
    }

    @ViewBuilder
    private var travelPauseRow: some View {
        if garden.isTravelPaused, let until = garden.travelPauseUntil {
            HStack {
                Label("Travel mode", systemImage: "airplane")
                Spacer()
                Text("Until \(until.formatted(date: .abbreviated, time: .omitted))")
                    .foregroundStyle(.secondary)
                Button("Resume") {
                    Task { try? await garden.setTravelPause(until: nil) }
                }
            }
        } else {
            Menu {
                Button("Pause for 3 days") { pauseTravel(days: 3) }
                Button("Pause for 1 week") { pauseTravel(days: 7) }
                Button("Pause for 2 weeks") { pauseTravel(days: 14) }
            } label: {
                Label("Pause reminders for travel", systemImage: "airplane")
            }
        }
    }

    private var notificationRow: some View {
        HStack {
            Label("Notifications", systemImage: "bell")
            Spacer()
            switch notificationStatus {
            case .authorized, .provisional, .ephemeral:
                Text("On").foregroundStyle(.secondary)
            case .denied:
                Text("Off in Settings").foregroundStyle(.secondary)
            default:
                Button("Enable") {
                    Task {
                        _ = await appEnvironment.notifications.requestAuthorization()
                        notificationStatus = await appEnvironment.notifications.authorizationStatus()
                    }
                }
            }
        }
        .task {
            notificationStatus = await appEnvironment.notifications.authorizationStatus()
        }
    }

    private func pauseTravel(days: Int) {
        Task {
            try? await garden.setTravelPause(
                until: Date().addingTimeInterval(TimeInterval(days) * 86_400)
            )
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func installDemo() {
        Task {
            try? await garden.installDemoGarden()
            infoMessage = "The demo garden was added. You can remove it here anytime."
        }
    }
}

#Preview("Profile") {
    ProfileView()
        .environment(AppEnvironment.preview())
}
