import SwiftUI
import GroveKit

/// One timeline entry: icon, event name, relative time, optional note.
struct TimelineEventRow: View {
    let event: CareEvent

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: GroveSpacing.sm) {
            Image(systemName: event.type.symbolName)
                .foregroundStyle(GroveColor.brand)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.type.displayName)
                    .font(.subheadline.weight(.medium))
                if !event.note.isEmpty {
                    Text(event.note)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: GroveSpacing.xxs) {
                    Text(event.occurredAt.formatted(date: .abbreviated, time: .shortened))
                    if event.editedAt != nil {
                        Text("· edited")
                    }
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
            Spacer()
        }
        .padding(.vertical, GroveSpacing.xxs)
        .accessibilityElement(children: .combine)
    }
}

/// Full care timeline for a plant (PRD 10.4 "Timeline"). Events stay editable
/// and deletable here — the undo toast is a convenience, not the only path.
struct TimelineListView: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    let plantID: Plant.ID

    private var events: [CareEvent] {
        appEnvironment.garden.events(for: plantID)
    }

    var body: some View {
        Group {
            if events.isEmpty {
                EmptyStateView(
                    systemImage: "clock",
                    title: "No care recorded yet",
                    message: "Care you log for this plant appears here, newest first."
                )
            } else {
                List {
                    ForEach(events) { event in
                        TimelineEventRow(event: event)
                            .swipeActions(edge: .trailing) {
                                Button("Delete", role: .destructive) {
                                    Task {
                                        try? await appEnvironment.garden.deleteEvent(id: event.id)
                                    }
                                }
                            }
                    }
                }
            }
        }
        .navigationTitle("Timeline")
        .navigationBarTitleDisplayMode(.inline)
    }
}
