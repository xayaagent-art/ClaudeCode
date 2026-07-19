import Foundation
import Testing
@testable import GroveKit

@Suite("JSON garden store")
struct JSONGardenStoreTests {
    private func temporaryFileURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("grove-tests-\(UUID().uuidString)", isDirectory: true)
            .appendingPathComponent("garden.json")
    }

    private func sampleSnapshot() -> GardenSnapshot {
        let now = Date(timeIntervalSince1970: 1_760_000_000)
        let kitchen = PlantLocation(name: "Kitchen", defaultLightLevel: .medium)
        let plant = Plant(
            nickname: "Frank",
            commonName: "Rubber Plant",
            scientificName: "Ficus elastica",
            identification: .userProvided,
            locationID: kitchen.id,
            notes: "Round-trip me",
            care: CareAttributes(
                water: CareAttribute(value: "Weekly check", source: .userProvided),
                toxicity: CareAttribute(value: "Mildly toxic to pets", source: .speciesBaseline)
            ),
            createdAt: now,
            updatedAt: now
        )
        return GardenSnapshot(plants: [plant], locations: [kitchen], hasCompletedFirstRun: true)
    }

    @Test("Save and load round-trips losslessly")
    func roundTrip() async throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = JSONGardenStore(fileURL: url)
        let original = sampleSnapshot()

        try await store.save(original)
        let loaded = try await store.load()
        #expect(loaded == original)
    }

    @Test("Loading with no file returns an empty garden")
    func missingFileIsEmpty() async throws {
        let store = JSONGardenStore(fileURL: temporaryFileURL())
        let snapshot = try await store.load()
        #expect(snapshot.plants.isEmpty)
        #expect(!snapshot.hasCompletedFirstRun)
    }

    @Test("Repeated saves overwrite atomically")
    func repeatedSaves() async throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = JSONGardenStore(fileURL: url)

        try await store.save(sampleSnapshot())
        var second = sampleSnapshot()
        second.plants = []
        try await store.save(second)

        let loaded = try await store.load()
        #expect(loaded.plants.isEmpty)

        let contents = try FileManager.default
            .contentsOfDirectory(atPath: url.deletingLastPathComponent().path)
        #expect(contents == [url.lastPathComponent])
    }

    @Test("A corrupted store file surfaces a typed error")
    func corruptedFile() async throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("not json".utf8).write(to: url)

        let store = JSONGardenStore(fileURL: url)
        await #expect(throws: GardenRepositoryError.self) {
            try await store.load()
        }
    }

    @Test("A newer schema version is refused, not misread")
    func newerSchemaRefused() async throws {
        let url = temporaryFileURL()
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let store = JSONGardenStore(fileURL: url)
        var future = sampleSnapshot()
        future.schemaVersion = GardenSnapshot.currentSchemaVersion + 1
        try await store.save(future)

        await #expect(throws: GardenRepositoryError.unsupportedSchema(
            found: GardenSnapshot.currentSchemaVersion + 1,
            supported: GardenSnapshot.currentSchemaVersion
        )) {
            try await store.load()
        }
    }
}

@Suite("Demo garden")
struct DemoGardenTests {
    @Test("Install is idempotent")
    func installIdempotent() async throws {
        let (service, _, _) = try await makeService()
        let first = try await service.installDemoGarden()
        let second = try await service.installDemoGarden()
        #expect(first.count == 8)
        #expect(second.map(\.id) == first.map(\.id))
        #expect(try await service.plants().count == 8)
    }

    @Test("Demo reuses rooms the user already has")
    func reusesExistingRooms() async throws {
        let (service, _, _) = try await makeService()
        let livingRoom = try await service.addLocation(name: "Living room")
        _ = try await service.installDemoGarden()

        let rooms = try await service.locations()
        #expect(rooms.filter { $0.name == "Living room" }.count == 1)
        #expect(rooms.first { $0.name == "Living room" }?.id == livingRoom.id)
    }

    @Test("Removing the demo keeps user plants and rooms")
    func removeKeepsUserData() async throws {
        let (service, _, _) = try await makeService()
        let kitchen = try await service.addLocation(name: "Kitchen")
        let mine = try await service.addPlant(PlantDraft(nickname: "Mine", locationID: kitchen.id))
        _ = try await service.installDemoGarden()

        try await service.removeDemoGarden()

        let remaining = try await service.plants()
        #expect(remaining.map(\.id) == [mine.id])
        let roomNames = try await service.locations().map(\.name)
        #expect(roomNames.contains("Kitchen"))
        #expect(!roomNames.contains("Bedroom"))
    }

    @Test("Demo plants carry species-baseline care guidance")
    func demoCareSources() async throws {
        let (service, _, _) = try await makeService()
        let plants = try await service.installDemoGarden()
        for plant in plants {
            #expect(!plant.care.isEmpty)
            #expect(plant.care.entries.allSatisfy { $0.attribute.source == .speciesBaseline })
        }
    }
}
