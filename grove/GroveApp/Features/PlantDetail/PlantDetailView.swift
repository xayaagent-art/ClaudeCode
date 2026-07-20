import SwiftUI
import GroveKit

/// Plant detail: photography-led header, explained status, care snapshot with
/// guidance sources, and record details (PRD 10.4, Milestone 1 scope).
struct PlantDetailView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @Environment(\.dismiss) private var dismiss

    let plantID: Plant.ID

    @State private var showEdit = false
    @State private var showQuickLog = false
    @State private var showNewSchedule = false
    @State private var editingSchedule: CareSchedule?
    @State private var confirmArchive = false
    @State private var confirmDelete = false
    @State private var errorMessage: String?

    private var garden: GardenModel { appEnvironment.garden }

    var body: some View {
        if let plant = garden.plant(id: plantID) {
            detail(for: plant)
        } else {
            // The plant was deleted while this screen was open (e.g. undo flow).
            EmptyStateView(
                systemImage: "leaf",
                title: "Plant not found",
                message: "This plant is no longer in your garden."
            )
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func detail(for plant: Plant) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: GroveSpacing.lg) {
                header(for: plant)

                statusSection(for: plant)

                if !plant.isArchived {
                    quickActions(for: plant)
                    nextActionSection(for: plant)
                }

                if !plant.care.isEmpty {
                    careSnapshot(for: plant)
                } else {
                    careEmptyState
                }

                schedulesSection(for: plant)

                timelineSection(for: plant)

                detailsSection(for: plant)

                if !plant.notes.isEmpty {
                    notesSection(for: plant)
                }

                actionsSection(for: plant)
            }
            .padding(.horizontal, GroveSpacing.screenMargin)
            .padding(.bottom, GroveSpacing.xxl)
        }
        .navigationTitle(plant.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        showEdit = true
                    } label: {
                        Label("Edit", systemImage: "pencil")
                    }
                    moveMenu(for: plant)
                    Divider()
                    if plant.isArchived {
                        Button {
                            restore(plant)
                        } label: {
                            Label("Restore", systemImage: "arrow.uturn.backward")
                        }
                        Button(role: .destructive) {
                            confirmDelete = true
                        } label: {
                            Label("Delete permanently", systemImage: "trash")
                        }
                    } else {
                        Button {
                            confirmArchive = true
                        } label: {
                            Label("Archive", systemImage: "archivebox")
                        }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showEdit) {
            PlantFormView(mode: .edit(plant))
        }
        .sheet(isPresented: $showQuickLog) {
            QuickLogSheet(plantID: plant.id)
        }
        .sheet(isPresented: $showNewSchedule) {
            ScheduleSheet(mode: .create(plant.id))
        }
        .sheet(item: $editingSchedule) { schedule in
            ScheduleSheet(mode: .edit(schedule))
        }
        .confirmationDialog(
            "Archive \(plant.displayName)?",
            isPresented: $confirmArchive,
            titleVisibility: .visible
        ) {
            Button("Archive") { archive(plant) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Archived plants keep their full record and can be restored anytime.")
        }
        .confirmationDialog(
            "Delete \(plant.displayName) permanently?",
            isPresented: $confirmDelete,
            titleVisibility: .visible
        ) {
            Button("Delete permanently", role: .destructive) { delete(plant) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes the plant and its record forever. This cannot be undone.")
        }
        .alert("Something went wrong", isPresented: .init(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: - Sections

    private func header(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.sm) {
            PlantImageView(assetID: plant.coverAssetID, cornerRadius: GroveRadius.card)
                .aspectRatio(4 / 3, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(
                    plant.coverAssetID == nil
                        ? "\(plant.displayName), no photo yet"
                        : "\(plant.displayName), plant photo"
                )
            VStack(alignment: .leading, spacing: GroveSpacing.xxs) {
                Text(plant.displayName)
                    .font(.title.weight(.bold))
                if let secondary = plant.secondaryName {
                    Text(secondary)
                        .font(.title3)
                        .italic(plant.scientificName == secondary)
                        .foregroundStyle(.secondary)
                }
                if let room = garden.roomName(for: plant) {
                    Label(room, systemImage: "square.split.2x2")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.top, GroveSpacing.xs)
    }

    private func statusSection(for plant: Plant) -> some View {
        let derived = garden.status(for: plant)
        return VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            StatusPill(status: derived.status)
            Text(derived.reason)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(GroveSpacing.md)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Quick actions (PRD 10.4): the two most common logs plus the full sheet.
    private func quickActions(for plant: Plant) -> some View {
        HStack(spacing: GroveSpacing.xs) {
            Button {
                logQuick(plant, .wateredThoroughly)
            } label: {
                Label("Watered", systemImage: "drop")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(GroveColor.brand)

            Button {
                logQuick(plant, .soilCheckedDry)
            } label: {
                Label("Soil dry", systemImage: "hand.point.up.left")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                showQuickLog = true
            } label: {
                Label("Log care", systemImage: "plus.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .controlSize(.small)
    }

    /// One primary recommendation with action, why, and defer (PRD 10.4
    /// "Next action") — only when a review is actually due.
    @ViewBuilder
    private func nextActionSection(for plant: Plant) -> some View {
        let due = garden.dueTasks.filter { $0.plantID == plant.id }
        if let task = due.first {
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
                onOpenPlant: {}
            )
        }
    }

    /// Review schedules for this plant (PRD 10.6): visible cadence, pause,
    /// edit, delete. No hidden automation.
    private func schedulesSection(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            HStack {
                sectionTitle("Care reviews")
                Spacer()
                if !plant.isArchived {
                    Button {
                        showNewSchedule = true
                    } label: {
                        Label("Add", systemImage: "plus")
                            .font(.subheadline)
                    }
                }
            }
            let schedules = garden.schedules(for: plant.id)
            if schedules.isEmpty {
                Text("No repeating reviews yet. Add one — like a soil check every 10 days — and it appears on Today when due.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(GroveSpacing.md)
                    .background(
                        Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
                    )
            } else {
                VStack(spacing: 0) {
                    ForEach(schedules) { schedule in
                        scheduleRow(schedule)
                        if schedule.id != schedules.last?.id {
                            Divider()
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

    private func scheduleRow(_ schedule: CareSchedule) -> some View {
        HStack(spacing: GroveSpacing.sm) {
            Image(systemName: schedule.kind.symbolName)
                .foregroundStyle(GroveColor.brand)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(schedule.displayTitle)
                    .font(.subheadline.weight(.medium))
                Text(scheduleSubtitle(schedule))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Menu {
                Button {
                    editingSchedule = schedule
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                if let pausedUntil = schedule.pausedUntil, pausedUntil > Date() {
                    Button {
                        updatePause(schedule, until: nil)
                    } label: {
                        Label("Resume", systemImage: "play")
                    }
                } else {
                    Button {
                        updatePause(schedule, until: Date().addingTimeInterval(7 * 86_400))
                    } label: {
                        Label("Pause for a week", systemImage: "pause")
                    }
                }
                Divider()
                Button(role: .destructive) {
                    deleteSchedule(schedule)
                } label: {
                    Label("Delete review", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .accessibilityLabel("Options for \(schedule.displayTitle)")
        }
        .padding(.vertical, GroveSpacing.xxs)
    }

    private func scheduleSubtitle(_ schedule: CareSchedule) -> String {
        var text = "Every \(schedule.intervalDays) day\(schedule.intervalDays == 1 ? "" : "s")"
        if let pausedUntil = schedule.pausedUntil, pausedUntil > Date() {
            text += " · paused until \(pausedUntil.formatted(date: .abbreviated, time: .omitted))"
        } else if let snoozedUntil = schedule.snoozedUntil, snoozedUntil > Date() {
            text += " · snoozed until \(snoozedUntil.formatted(date: .abbreviated, time: .omitted))"
        }
        return text
    }

    /// Recent care with a link to the full timeline (PRD 10.4 "Timeline").
    private func timelineSection(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            HStack {
                sectionTitle("Timeline")
                Spacer()
                if !garden.events(for: plant.id).isEmpty {
                    NavigationLink {
                        TimelineListView(plantID: plant.id)
                    } label: {
                        Text("See all")
                            .font(.subheadline)
                    }
                }
            }
            let recent = Array(garden.events(for: plant.id).prefix(3))
            if recent.isEmpty {
                Text("Care you log appears here, newest first.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(GroveSpacing.md)
                    .background(
                        Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous)
                    )
            } else {
                VStack(spacing: 0) {
                    ForEach(recent) { event in
                        TimelineEventRow(event: event)
                        if event.id != recent.last?.id {
                            Divider()
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

    private func careSnapshot(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            sectionTitle("Care snapshot")
            VStack(alignment: .leading, spacing: 0) {
                ForEach(plant.care.entries, id: \.field) { entry in
                    CareAttributeRow(field: entry.field, attribute: entry.attribute)
                    if entry.field != plant.care.entries.last?.field {
                        Divider()
                    }
                }
            }
            .padding(GroveSpacing.md)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        }
    }

    private var careEmptyState: some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            sectionTitle("Care snapshot")
            VStack(alignment: .leading, spacing: GroveSpacing.xs) {
                Text("No care details yet")
                    .font(.subheadline.weight(.medium))
                Text("Add watering, light, or soil notes so this plant's needs are always at hand.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Add care details") { showEdit = true }
                    .buttonStyle(.bordered)
                    .padding(.top, GroveSpacing.xxs)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GroveSpacing.md)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        }
    }

    private func detailsSection(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            sectionTitle("Record")
            VStack(spacing: GroveSpacing.xs) {
                recordRow("Added", value: plant.createdAt.formatted(date: .abbreviated, time: .omitted))
                if let acquired = plant.acquisitionDate {
                    recordRow("Acquired", value: acquired.formatted(date: .abbreviated, time: .omitted))
                }
                if let source = plant.acquisitionSource {
                    recordRow("From", value: source)
                }
                if plant.origin == .demo {
                    recordRow("Origin", value: "Demo garden")
                }
                if plant.isArchived, let archivedAt = plant.archivedAt {
                    recordRow("Archived", value: archivedAt.formatted(date: .abbreviated, time: .omitted))
                }
            }
            .padding(GroveSpacing.md)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        }
    }

    private func notesSection(for plant: Plant) -> some View {
        VStack(alignment: .leading, spacing: GroveSpacing.xs) {
            sectionTitle("Notes")
            Text(plant.notes)
                .font(.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(GroveSpacing.md)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: GroveRadius.card, style: .continuous))
        }
    }

    private func actionsSection(for plant: Plant) -> some View {
        VStack(spacing: GroveSpacing.sm) {
            Button {
                showEdit = true
            } label: {
                Label("Edit plant", systemImage: "pencil")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            if plant.isArchived {
                Button {
                    restore(plant)
                } label: {
                    Label("Restore to garden", systemImage: "arrow.uturn.backward")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(GroveColor.brand)
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.headline)
    }

    private func recordRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
        .font(.subheadline)
    }

    private func moveMenu(for plant: Plant) -> some View {
        Menu {
            Button("No room") {
                move(plant, to: nil)
            }
            ForEach(garden.locations) { location in
                Button(location.name) {
                    move(plant, to: location.id)
                }
            }
        } label: {
            Label("Move to room", systemImage: "arrow.right.square")
        }
    }

    // MARK: - Actions

    private func archive(_ plant: Plant) {
        Task {
            do {
                try await garden.archivePlant(plant)
                GroveHaptics.lightImpact()
                dismiss()
            } catch {
                errorMessage = "The plant could not be archived. Please try again."
            }
        }
    }

    private func restore(_ plant: Plant) {
        Task {
            do {
                try await garden.restorePlant(plant)
                GroveHaptics.lightImpact()
            } catch {
                errorMessage = "The plant could not be restored. Please try again."
            }
        }
    }

    private func delete(_ plant: Plant) {
        Task {
            do {
                try await garden.deletePlant(plant)
                dismiss()
            } catch {
                errorMessage = "The plant could not be deleted. Please try again."
            }
        }
    }

    private func move(_ plant: Plant, to locationID: PlantLocation.ID?) {
        Task {
            try? await garden.movePlant(plant, to: locationID)
        }
    }

    private func logQuick(_ plant: Plant, _ type: CareEventType) {
        Task {
            try? await garden.logEvent(plantID: plant.id, type: type)
        }
        GroveHaptics.lightImpact()
    }

    private func updatePause(_ schedule: CareSchedule, until: Date?) {
        var updated = schedule
        updated.pausedUntil = until
        Task {
            try? await garden.updateSchedule(updated)
        }
    }

    private func deleteSchedule(_ schedule: CareSchedule) {
        Task {
            try? await garden.deleteSchedule(id: schedule.id)
        }
    }
}

#Preview("Plant detail") {
    let environment = AppEnvironment.preview()
    return NavigationStack {
        PlantDetailPreviewHost()
    }
    .environment(environment)
}

/// Resolves the first demo plant asynchronously for the preview.
private struct PlantDetailPreviewHost: View {
    @Environment(AppEnvironment.self) private var appEnvironment

    var body: some View {
        if let plant = appEnvironment.garden.activePlants.first {
            PlantDetailView(plantID: plant.id)
        } else {
            LoadingStateView()
        }
    }
}
