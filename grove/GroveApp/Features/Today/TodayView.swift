import SwiftUI
import GroveKit

/// Today answers "what should I do for my plants?" (PRD 10.2): a prioritized
/// care queue with reasons, a garden overview, and recent additions. When
/// nothing is due it says so — it never invents work to drive engagement.
struct TodayView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var showAddPlant = false
    @State private var path: [Plant.ID] = []

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        NavigationStack(path: $path) {
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
        .onChange(of: appEnvironment.notificationCoordinator.pendingPlantID) {
            openPendingPlant()
        }
        .onAppear {
            openPendingPlant()
        }
    }

    /// Completes a notification deep link by pushing the plant.
    private func openPendingPlant() {
        guard let plantID = appEnvironment.notificationCoordinator.pendingPlantID else { return }
        appEnvironment.notificationCoordinator.pendingPlantID = nil
        path.append(plantID)
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
                if garden.isTravelPaused {
                    travelPauseBanner
                }
                gardenStatusCard
                careQueueSection
                upcomingSection
                recentPlantsSection
            }
            .padding(.horizontal, GroveSpacing.screenMargin)
            .padding(.bottom, GroveSpacing.xxl)
        }
    }

    // MARK: - Care queue (PRD 10.2)

    @ViewBuilder
    private var careQueueSection: some View {
        let due = garden.isTravelPaused ? [] : garden.dueTasks
        if !due.isEmpty {
            VStack(alignment: .leading, spacing: GroveSpacing.sm) {
                Text("Today's care")
                    .font(.headline)
                ForEach(due) { task in
                    if let plant = garden.plant(id: task.plantID) {
                        CareTaskCard(
                            task: task,
                            plant: plant,
                            onComplete: { type in
                                Task { try? await garden.completeTask(task, with: type) }
                                GroveHaptics.lightImpact()
                            },
                            onSnooze: { days in
                                Task { try? await garden.snoozeTask(task, days: days) }
                            },
                            onSkip: {
                                Task { try? await garden.skipTask(task) }
                            },
                            onOpenPlant: {
                                path.append(plant.id)
                            }
                        )
                    }
                }
            }
        } else if !garden.careTasks.isEmpty || garden.isTravelPaused {
            quietStateCard
        } else {
            noSchedulesCard
        }
    }

    @ViewBuilder
    private var upcomingSection: some View {
        let upcoming = garden.upcomingTasks
        if !upcoming.isEmpty {
            VStack(alignment: .leading, spacing: GroveSpacing.xs) {
                Text("Coming up")
                    .font(.headline)
                VStack(spacing: 0) {
                    ForEach(upcoming) { task in
                        if let plant = garden.plant(id: task.plantID) {
                            UpcomingTaskRow(task: task, plant: plant)
                        }
                    }
                }
                .padding(GroveSpacing.md)
                .background(
                    Color(uiColor: .secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
                )
            }
        }
    }

    /// Honest "nothing due" state (PRD 10.2: do not invent work).
    private var quietStateCard: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            Text(garden.isTravelPaused ? "Reminders are paused" : "Nothing needs attention right now")
                .font(.subheadline.weight(.medium))
            if garden.isTravelPaused, let until = garden.travelPauseUntil {
                Text("Care reminders resume \(until.formatted(date: .abbreviated, time: .omitted)). You can resume earlier from Profile.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text("All reviews are up to date. Enjoy your plants.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(GroveSpacing.md)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
        )
    }

    /// Shown when no plant has a review schedule yet: a useful pointer, not
    /// manufactured urgency.
    private var noSchedulesCard: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            Text("No care reviews set up yet")
                .font(.subheadline.weight(.medium))
            Text("Open a plant and add a review schedule — like a soil check every 10 days — and it will appear here when due.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(GroveSpacing.md)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
        )
    }

    private var travelPauseBanner: some View {
        HStack(spacing: GroveSpacing.sm) {
            Image(systemName: "airplane")
                .foregroundStyle(GroveColor.brand)
            Text("Travel mode — reminders paused")
                .font(.subheadline.weight(.medium))
            Spacer()
            Button("Resume") {
                Task { try? await garden.setTravelPause(until: nil) }
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(GroveSpacing.md)
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
        )
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
                if summary.reviewDue > 0 {
                    statusCount(count: summary.reviewDue, label: "check soon", symbol: "clock")
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
        .background(
            Color(uiColor: .secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
        )
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

    private func storageWarningCard(_ warning: String) -> some View {
        Label(warning, systemImage: "exclamationmark.triangle")
            .font(.subheadline)
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GroveSpacing.md)
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
            )
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
