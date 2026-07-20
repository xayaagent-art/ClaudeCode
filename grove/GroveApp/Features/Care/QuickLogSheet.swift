import SwiftUI
import GroveKit

/// Quick care logging (PRD 10.2 "Quick log"): common actions in two taps —
/// open the sheet, tap the action. A note is optional, never required.
struct QuickLogSheet: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    let plantID: Plant.ID

    @State private var note = ""
    @State private var isLogging = false

    private let columns = [
        GridItem(.adaptive(minimum: 100, maximum: 160), spacing: GroveSpacing.xs)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: GroveSpacing.md) {
                    LazyVGrid(columns: columns, spacing: GroveSpacing.xs) {
                        ForEach(CareEventType.quickLogTypes, id: \.self) { type in
                            Button {
                                log(type)
                            } label: {
                                VStack(spacing: GroveSpacing.xxs) {
                                    Image(systemName: type.symbolName)
                                        .font(.title3)
                                    Text(type.shortName)
                                        .font(.caption)
                                        .multilineTextAlignment(.center)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, GroveSpacing.sm)
                            }
                            .buttonStyle(.bordered)
                            .tint(GroveColor.brand)
                            .disabled(isLogging)
                        }
                    }

                    TextField("Add a note (optional)", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(GroveSpacing.md)
            }
            .navigationTitle("Log care")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func log(_ type: CareEventType) {
        isLogging = true
        Task {
            defer { isLogging = false }
            do {
                try await appEnvironment.garden.logEvent(
                    plantID: plantID,
                    type: type,
                    note: note.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                GroveHaptics.lightImpact()
                dismiss()
            } catch {
                // The plant disappeared mid-log (rare); closing is the safe path.
                dismiss()
            }
        }
    }
}

#Preview("Quick log") {
    let environment = AppEnvironment.preview()
    return QuickLogPreviewHost()
        .environment(environment)
}

private struct QuickLogPreviewHost: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    var body: some View {
        if let plant = appEnvironment.garden.activePlants.first {
            QuickLogSheet(plantID: plant.id)
        } else {
            LoadingStateView()
        }
    }
}
