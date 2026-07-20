#if DEBUG
import SwiftUI
import GroveKit

/// Developer-only component gallery (Milestone 0). Shows every design-system
/// component in its main states for review in light/dark and large text.
/// Never ships: the entire file is compiled out of release builds.
struct ComponentGalleryView: View {
    var body: some View {
        List {
            Section("Status pills") {
                ForEach(PlantStatus.allCases, id: \.self) { status in
                    StatusPill(status: status)
                }
            }

            Section("Plant card") {
                PlantCard(
                    plant: samplePlant,
                    roomName: "Living room",
                    status: .doingWell
                )
                .frame(width: 180)
                PlantCard(
                    plant: Plant(commonName: "Monstera", createdAt: .now, updatedAt: .now),
                    roomName: nil,
                    status: .unknown
                )
                .frame(width: 180)
            }

            Section("Plant list row") {
                PlantListRow(plant: samplePlant, roomName: "Bedroom", status: .doingWell)
                PlantListRow(
                    plant: Plant(nickname: "Mystery", createdAt: .now, updatedAt: .now),
                    roomName: nil,
                    status: .unknown
                )
            }

            Section("Care task card") {
                CareTaskCard(
                    task: sampleTask,
                    plant: samplePlant,
                    onComplete: { _ in },
                    onSnooze: { _ in },
                    onSkip: {},
                    onOpenPlant: {}
                )
            }

            Section("Timeline rows") {
                TimelineEventRow(event: CareEvent(
                    plantID: samplePlant.id,
                    type: .wateredThoroughly,
                    occurredAt: .now,
                    createdAt: .now
                ))
                TimelineEventRow(event: CareEvent(
                    plantID: samplePlant.id,
                    type: .soilCheckedDry,
                    occurredAt: .now.addingTimeInterval(-86_400),
                    note: "Top half fully dry",
                    createdAt: .now
                ))
            }

            Section("Care attribute rows") {
                CareAttributeRow(
                    field: .water,
                    attribute: CareAttribute(value: "Let the top half dry out", source: .speciesBaseline)
                )
                CareAttributeRow(
                    field: .light,
                    attribute: CareAttribute(value: "Bright indirect, east window", source: .userProvided)
                )
            }

            Section("Filter chips") {
                HStack {
                    FilterChip(title: "All", isSelected: true) {}
                    FilterChip(title: "Archived", isSelected: false) {}
                }
            }

            Section("Undo toast") {
                UndoToast(message: "Frank archived") {}
            }

            Section("Empty state") {
                EmptyStateView(
                    systemImage: "leaf",
                    title: "No plants yet",
                    message: "Add your first plant to start your garden.",
                    primaryActionTitle: "Add a plant",
                    primaryAction: {}
                )
            }

            Section("Error state") {
                ErrorStateView(message: "Something went wrong while loading.", retry: {})
            }

            Section("Loading state") {
                LoadingStateView()
                    .frame(height: 80)
            }

            Section("Motion tokens") {
                Text("immediate 0.12s · quick 0.2s · standard 0.3s · emphasis 0.45s")
                    .font(.caption)
                Text("springResponsive · springGentle · springCelebratory")
                    .font(.caption)
            }
        }
        .navigationTitle("Components")
    }

    private var samplePlant: Plant {
        Plant(
            nickname: "Frank",
            commonName: "Rubber Plant",
            scientificName: "Ficus elastica",
            createdAt: .now,
            updatedAt: .now
        )
    }

    private var sampleTask: CareTaskItem {
        let plant = samplePlant
        let anchor = Date().addingTimeInterval(-10 * 86_400)
        let schedule = CareSchedule(
            plantID: plant.id,
            kind: .checkSoil,
            intervalDays: 10,
            anchorDate: anchor,
            createdAt: anchor,
            updatedAt: anchor
        )
        return CareTaskItem(
            schedule: schedule,
            plantID: plant.id,
            dueDate: Date(),
            state: .dueToday,
            reason: "Watered thoroughly 10 days ago. You review this every 10 days.",
            lastEvent: nil
        )
    }
}

#Preview("Component gallery") {
    NavigationStack {
        ComponentGalleryView()
    }
    .environment(AppEnvironment.preview())
}
#endif
