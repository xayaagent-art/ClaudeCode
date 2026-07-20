import SwiftUI
import GroveKit

/// A care queue card (PRD 10.2): plant photo and name, the action, the reason,
/// honest urgency, primary completion options, and snooze/skip alternatives.
struct CareTaskCard: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    let task: CareTaskItem
    let plant: Plant
    let onComplete: (CareEventType) -> Void
    let onSnooze: (Int) -> Void
    let onSkip: () -> Void
    let onOpenPlant: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.sm) {
            Button(action: onOpenPlant) {
                HStack(spacing: GroveSpacing.sm) {
                    PlantImageView(assetID: plant.coverAssetID)
                        .frame(width: 48, height: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(task.schedule.displayTitle) — \(plant.displayName)")
                            .font(.headline)
                            .multilineTextAlignment(.leading)
                        Text(urgencyLabel)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(urgencyColor)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            Text(task.reason)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: GroveSpacing.xs) {
                ForEach(task.schedule.kind.completionOptions.prefix(2), id: \.self) { option in
                    Button(option.shortName) {
                        onComplete(option)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(GroveColor.brand)
                    .controlSize(.small)
                }
                Spacer()
                Menu {
                    Button("Snooze 1 day") { onSnooze(1) }
                    Button("Snooze 3 days") { onSnooze(3) }
                    Button("Skip this time", role: .destructive) { onSkip() }
                } label: {
                    Label("More options", systemImage: "ellipsis.circle")
                        .labelStyle(.iconOnly)
                }
                .accessibilityLabel("Snooze or skip")
            }
        }
        .padding(GroveSpacing.md)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            "\(task.schedule.displayTitle) for \(plant.displayName), \(urgencyLabel). \(task.reason)"
        )
    }

    /// Calm urgency copy: an overdue review is "waiting", never an emergency
    /// (PRD 10.4: no red state from a missed date alone).
    private var urgencyLabel: String {
        switch task.state {
        case .overdue:
            let days = Calendar.current.dateComponents(
                [.day], from: task.dueDate, to: Date()
            ).day ?? 0
            return days <= 1 ? "Waiting since yesterday" : "Waiting \(days) days"
        case .dueToday: return "Due today"
        case .upcoming: return "Coming up \(task.dueDate.formatted(date: .abbreviated, time: .omitted))"
        case .snoozed: return "Snoozed"
        case .paused: return "Paused"
        }
    }

    private var urgencyColor: Color {
        switch task.state {
        case .overdue, .dueToday: .orange
        case .upcoming, .snoozed, .paused: .secondary
        }
    }
}

/// Compact row for upcoming tasks.
struct UpcomingTaskRow: View {
    let task: CareTaskItem
    let plant: Plant

    var body: some View {
        HStack(spacing: GroveSpacing.sm) {
            Image(systemName: task.schedule.kind.symbolName)
                .foregroundStyle(GroveColor.brand)
                .frame(width: 24)
                .accessibilityHidden(true)
            Text("\(task.schedule.displayTitle) — \(plant.displayName)")
                .font(.subheadline)
                .lineLimit(1)
            Spacer()
            Text(task.dueDate.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, GroveSpacing.xxs)
        .accessibilityElement(children: .combine)
    }
}
