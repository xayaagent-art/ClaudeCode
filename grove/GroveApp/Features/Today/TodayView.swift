import SwiftUI
import GroveKit

/// Today answers "what should I do for my plants?" (PRD 10.2). In Milestone 1
/// there is no care queue yet, so Today gives a truthful garden overview and
/// recent additions — it never invents work to drive engagement.
struct TodayView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var showAddPlant = false

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        NavigationStack {
            Group {
                if garden.activePlants.isEmpty {
                    emptyState
                } else {
                    overview
                }
            }
            .navigationTitle(greeting)
            .navigationDestination(for: Plant.ID.self) { plantID in
                PlantDetailView(plantID: plantID)
            }
            .sheet(isPresented: $showAddPlant) {
                PlantFormView(mode: .create)
            }
        }
        .undoToastHost()
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<18: return "Good afternoon"
        default: return "Good evening"
        }
    }

    private var overview: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GroveSpacing.lg) {
                if let warning = garden.storageWarning {
                    storageWarningCard(warning)
                }
                gardenStatusCard
                quietStateCard
                recentPlantsSection
            }
            .padding(.horizontal, GroveSpacing.screenMargin)
            .padding(.bottom, GroveSpacing.xxl)
        }
    }

    // MARK: - Garden status (PRD 10.2 "Garden status" module)

    private var gardenStatusCard: some View {
        let summary = garden.statusSummary
        return VStack(alignment: .leading, spacing: GroveSpacing.sm) {
            Text("Your garden")
                .font(.headline)
            HStack(spacing: GroveSpacing.lg) {
                statusCount(
                    count: summary.total,
                    label: summary.total == 1 ? "plant" : "plants",
                    symbol: "leaf"
                )
                if summary.doingWell > 0 {
                    statusCount(count: summary.doingWell, label: "doing well", symbol: "checkmark.circle")
                }
                if summary.gettingToKnow > 0 {
                    statusCount(count: summary.gettingToKnow, label: "getting to know", symbol: "sparkle.magnifyingglass")
                }
                if summary.needsAttention > 0 {
                    statusCount(count: summary.needsAttention, label: "needs attention", symbol: "exclamationmark.circle")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(GroveSpacing.md)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func statusCount(count: Int, label: String, symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(count)")
                .font(.title2.weight(.semibold).monospacedDigit())
            Label(label, systemImage: symbol)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    /// Honest "no tasks" state: care scheduling ships in the next milestone, and
    /// Grove does not fake urgency in the meantime (PRD 10.2 empty state rules).
    private var quietStateCard: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            Text("Nothing needs attention right now")
                .font(.subheadline.weight(.medium))
            Text("Care reminders are coming in a future update. Until then, your plants' details and notes are always at hand in the Garden tab.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(GroveSpacing.md)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
    }

    private func storageWarningCard(_ warning: String) -> some View {
        Label(warning, systemImage: "exclamationmark.triangle")
            .font(.subheadline)
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GroveSpacing.md)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
    }

    // MARK: - Recently added

    private var recentPlantsSection: some View {
        let recent = garden.plants(GardenQuery(filter: .recentlyAdded, sort: .recentlyAdded))
        return Group {
            if !recent.isEmpty {
                VStack(alignment: .leading, spacing: GroveSpacing.sm) {
                    Text("Recently added")
                        .font(.headline)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: GroveSpacing.md) {
                            ForEach(recent) { plant in
                                NavigationLink(value: plant.id) {
                                    PlantCard(
                                        plant: plant,
                                        roomName: garden.roomName(for: plant),
                                        status: garden.status(for: plant).status
                                    )
                                    .frame(width: 150)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Empty state (PRD 10.2)

    private var emptyState: some View {
        EmptyStateView(
            systemImage: "sun.horizon",
            title: "Welcome to Grove",
            message: "Add your first plant and Grove will keep its care details, photos, and story in one place.",
            primaryActionTitle: "Add your first plant",
            primaryAction: { showAddPlant = true },
            secondaryActionTitle: garden.hasDemoPlants ? nil : "Explore a demo garden",
            secondaryAction: garden.hasDemoPlants ? nil : {
                Task { try? await garden.installDemoGarden() }
            }
        )
    }
}

#Preview("Today") {
    TodayView()
        .environment(AppEnvironment.preview())
}

#Preview("Today — empty") {
    TodayView()
        .environment(AppEnvironment.preview(seeded: false))
}
