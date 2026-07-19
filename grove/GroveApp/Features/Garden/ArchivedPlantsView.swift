import SwiftUI
import GroveKit

/// Archived plants keep their full record and can be restored or, explicitly
/// and irreversibly, deleted.
struct ArchivedPlantsView: View {
    @Environment(AppEnvironment.self) private var appEnvironment
    @State private var plantPendingDelete: Plant?

    private var garden: GardenModel { appEnvironment.garden }

    private var archived: [Plant] {
        garden.plants(GardenQuery(filter: .archived))
    }

    var body: some View {
        Group {
            if archived.isEmpty {
                EmptyStateView(
                    systemImage: "archivebox",
                    title: "No archived plants",
                    message: "When you archive a plant, it moves here with its record intact."
                )
            } else {
                List {
                    ForEach(archived) { plant in
                        NavigationLink(value: plant.id) {
                            PlantListRow(
                                plant: plant,
                                roomName: garden.roomName(for: plant),
                                status: garden.status(for: plant).status
                            )
                        }
                        .swipeActions(edge: .trailing) {
                            Button("Restore") {
                                Task { try? await garden.restorePlant(plant) }
                            }
                            .tint(GroveColor.brand)
                            Button("Delete", role: .destructive) {
                                plantPendingDelete = plant
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Archived")
        .navigationDestination(for: Plant.ID.self) { plantID in
            PlantDetailView(plantID: plantID)
        }
        .confirmationDialog(
            "Delete \(plantPendingDelete?.displayName ?? "") permanently?",
            isPresented: .init(
                get: { plantPendingDelete != nil },
                set: { if !$0 { plantPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete permanently", role: .destructive) {
                if let plant = plantPendingDelete {
                    plantPendingDelete = nil
                    Task { try? await garden.deletePlant(plant) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This cannot be undone.")
        }
    }
}

#Preview("Archived") {
    NavigationStack {
        ArchivedPlantsView()
    }
    .environment(AppEnvironment.preview())
}
