import SwiftUI

/// First launch: one calm screen, value first, action before setup (PRD 10.1).
/// No account, no questionnaire, no permission prompts.
struct FirstRunView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var showAddPlant = false
    @State private var isInstallingDemo = false

    var body: some View {
        VStack(spacing: GroveSpacing.xl) {
            Spacer()
            VStack(spacing: GroveSpacing.md) {
                Image(systemName: "leaf.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(GroveColor.brand)
                    .accessibilityHidden(true)
                Text("Grove")
                    .font(.largeTitle.weight(.bold))
                Text("Know every plant. Care for it confidently.\nYour garden stays private and on your device.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            VStack(spacing: GroveSpacing.sm) {
                Button {
                    showAddPlant = true
                } label: {
                    Label("Add your first plant", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(GroveColor.brand)
                .controlSize(.large)

                Button {
                    installDemo()
                } label: {
                    Group {
                        if isInstallingDemo {
                            ProgressView()
                        } else {
                            Text("Explore a demo garden")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isInstallingDemo)

                Button("Start with an empty garden") {
                    Task { await appEnvironment.garden.completeFirstRun() }
                }
                .font(.subheadline)
                .padding(.top, GroveSpacing.xxs)
            }
        }
        .padding(GroveSpacing.xl)
        .sheet(isPresented: $showAddPlant) {
            PlantFormView(mode: .create) {
                // First plant saved: onboarding is done.
                Task { await appEnvironment.garden.completeFirstRun() }
            }
        }
    }

    private func installDemo() {
        isInstallingDemo = true
        Task {
            defer { isInstallingDemo = false }
            try? await appEnvironment.garden.installDemoGarden()
            appEnvironment.analytics.track(.demoGardenInstalled)
            await appEnvironment.garden.completeFirstRun()
        }
    }
}

#Preview("First run") {
    FirstRunView()
        .environment(AppEnvironment.preview(seeded: false))
}
