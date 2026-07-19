import SwiftUI
import GroveKit

/// Profile and settings. Milestone 1 contains only things that actually work:
/// garden data management, onboarding reset, and honest privacy information.
struct ProfileView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var confirmRemoveDemo = false
    @State private var infoMessage: String?

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        NavigationStack {
            List {
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
