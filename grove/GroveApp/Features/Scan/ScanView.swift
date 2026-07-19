import SwiftUI

/// Scan tab, Milestone 1. AI identification ships in Milestone 4; per the PRD
/// this is an explicit "coming later" state with a genuinely useful path —
/// never a placeholder pretending to work.
struct ScanView: View {
    @State private var showAddPlant = false

    var body: some View {
        NavigationStack {
            VStack(spacing: GroveSpacing.xl) {
                Spacer()
                VStack(spacing: GroveSpacing.md) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 56))
                        .foregroundStyle(GroveColor.brand)
                        .accessibilityHidden(true)
                    Text("Plant identification is coming")
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)
                    Text("A future update will identify plants from a photo, with honest confidence levels and easy corrections. Until then, you can add any plant manually — a name is all it takes.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, GroveSpacing.xl)
                Spacer()
                Button {
                    showAddPlant = true
                } label: {
                    Label("Add a plant manually", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(GroveColor.brand)
                .controlSize(.large)
                .padding(.horizontal, GroveSpacing.xl)
                .padding(.bottom, GroveSpacing.xl)
            }
            .navigationTitle("Scan")
            .sheet(isPresented: $showAddPlant) {
                PlantFormView(mode: .create)
            }
        }
    }
}

#Preview("Scan") {
    ScanView()
        .environment(AppEnvironment.preview())
}
