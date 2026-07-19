import Foundation
import Testing
@testable import GroveKit

@Suite("Plant creation")
struct PlantCreationTests {
    @Test("A plant can be created with only a name")
    func createWithOnlyName() async throws {
        let (service, store, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))

        #expect(plant.displayName == "Frank")
        #expect(plant.identification == .unidentified)
        let saved = try await store.load()
        #expect(saved.plants.count == 1)
    }

    @Test("Creation without any name is rejected")
    func createWithoutName() async throws {
        let (service, _, _) = try await makeService()
        await #expect(throws: GardenError.nameRequired) {
            try await service.addPlant(PlantDraft(nickname: "   ", notes: "no name"))
        }
    }

    @Test("Species names mark the plant as user-identified")
    func speciesNameSetsIdentification() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(
            PlantDraft(commonName: "Monstera", scientificName: "Monstera deliciosa")
        )
        #expect(plant.identification == .userProvided)
        #expect(plant.displayName == "Monstera")
        #expect(plant.secondaryName == "Monstera deliciosa")
    }

    @Test("Creating a plant in an unknown room fails")
    func unknownLocationRejected() async throws {
        let (service, _, _) = try await makeService()
        await #expect(throws: GardenError.locationNotFound) {
            try await service.addPlant(
                PlantDraft(nickname: "Ghost", locationID: PlantLocation.ID())
            )
        }
    }

    @Test("Whitespace-only optional fields are stored as nil")
    func trimsOptionalFields() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(
            PlantDraft(nickname: "Frank", commonName: "  ", acquisitionSource: " ")
        )
        #expect(plant.commonName == nil)
        #expect(plant.acquisitionSource == nil)
    }
}

@Suite("Plant updates")
struct PlantUpdateTests {
    @Test("Update preserves createdAt and refreshes updatedAt")
    func updateTimestamps() async throws {
        let (service, _, clock) = try await makeService()
        let created = try await service.addPlant(PlantDraft(nickname: "Frank"))
        clock.advance(byDays: 3)

        var edited = created
        edited.notes = "Moved closer to the window"
        let updated = try await service.updatePlant(edited)

        #expect(updated.createdAt == created.createdAt)
        #expect(updated.updatedAt == clock.now)
        #expect(updated.notes == "Moved closer to the window")
    }

    @Test("Removing every name in an edit is rejected")
    func updateWithoutName() async throws {
        let (service, _, _) = try await makeService()
        let created = try await service.addPlant(PlantDraft(nickname: "Frank"))
        var edited = created
        edited.nickname = ""
        await #expect(throws: GardenError.nameRequired) {
            try await service.updatePlant(edited)
        }
    }

    @Test("Updating a deleted plant fails cleanly")
    func updateMissingPlant() async throws {
        let (service, _, clock) = try await makeService()
        let plant = Plant(nickname: "Ghost", createdAt: clock.now, updatedAt: clock.now)
        await #expect(throws: GardenError.plantNotFound) {
            try await service.updatePlant(plant)
        }
    }
}

@Suite("Archive and restore")
struct ArchiveTests {
    @Test("Archive is reversible and preserves the record")
    func archiveRestoreRoundTrip() async throws {
        let (service, _, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank", notes: "keeper"))

        let archived = try await service.archivePlant(id: plant.id)
        #expect(archived.isArchived)
        #expect(archived.archivedAt != nil)
        #expect(try await service.plants(GardenQuery(filter: .active)).isEmpty)
        #expect(try await service.plants(GardenQuery(filter: .archived)).count == 1)

        let restored = try await service.restorePlant(id: plant.id)
        #expect(!restored.isArchived)
        #expect(restored.archivedAt == nil)
        #expect(restored.notes == "keeper")
        #expect(try await service.plants(GardenQuery(filter: .active)).count == 1)
    }

    @Test("Delete permanently removes a plant")
    func deleteRemoves() async throws {
        let (service, store, _) = try await makeService()
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank"))
        try await service.deletePlant(id: plant.id)
        let saved = try await store.load()
        #expect(saved.plants.isEmpty)
    }
}

@Suite("Rooms")
struct RoomTests {
    @Test("Plants move between rooms")
    func movePlant() async throws {
        let (service, _, _) = try await makeService()
        let kitchen = try await service.addLocation(name: "Kitchen")
        let bedroom = try await service.addLocation(name: "Bedroom")
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank", locationID: kitchen.id))

        let moved = try await service.movePlant(id: plant.id, to: bedroom.id)
        #expect(moved.locationID == bedroom.id)

        let unassigned = try await service.movePlant(id: plant.id, to: nil)
        #expect(unassigned.locationID == nil)
    }

    @Test("Duplicate room names are rejected case-insensitively")
    func duplicateRoomName() async throws {
        let (service, _, _) = try await makeService()
        _ = try await service.addLocation(name: "Kitchen")
        await #expect(throws: GardenError.duplicateLocationName("kitchen")) {
            try await service.addLocation(name: "kitchen")
        }
    }

    @Test("Archiving a room keeps its plants, unassigned")
    func archiveRoomKeepsPlants() async throws {
        let (service, _, _) = try await makeService()
        let kitchen = try await service.addLocation(name: "Kitchen")
        let plant = try await service.addPlant(PlantDraft(nickname: "Frank", locationID: kitchen.id))

        try await service.archiveLocation(id: kitchen.id)

        let kept = try await service.plant(id: plant.id)
        #expect(kept.locationID == nil)
        #expect(try await service.locations().isEmpty)
        #expect(try await service.locations(includeArchived: true).count == 1)
    }

    @Test("Rooms sort by sort order")
    func roomOrdering() async throws {
        let (service, _, _) = try await makeService()
        _ = try await service.addLocation(name: "Kitchen")
        _ = try await service.addLocation(name: "Bedroom")
        let names = try await service.locations().map(\.name)
        #expect(names == ["Kitchen", "Bedroom"])
    }
}

@Suite("Persistence behavior")
struct ServicePersistenceTests {
    @Test("Every mutation persists immediately")
    func mutationsPersist() async throws {
        let (service, store, _) = try await makeService()
        _ = try await service.addPlant(PlantDraft(nickname: "Frank"))
        #expect(await store.saveCount == 1)
        _ = try await service.addLocation(name: "Kitchen")
        #expect(await store.saveCount == 2)
    }

    @Test("State survives a service restart on the same store")
    func survivesRestart() async throws {
        let store = InMemoryGardenStore()
        let (service, _, _) = try await makeService(store: store)
        _ = try await service.addPlant(PlantDraft(nickname: "Frank"))
        try await service.markFirstRunComplete()

        let (rebooted, _, _) = try await makeService(store: store)
        #expect(try await rebooted.plants().count == 1)
        #expect(try await rebooted.hasCompletedFirstRun())
    }

    @Test("Using the service before bootstrap fails cleanly")
    func requiresBootstrap() async throws {
        let service = GardenService(repository: InMemoryGardenStore())
        await #expect(throws: GardenError.notLoaded) {
            try await service.plants()
        }
    }
}
