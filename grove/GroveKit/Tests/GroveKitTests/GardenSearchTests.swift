import Foundation
import Testing
@testable import GroveKit

@Suite("Garden search")
struct GardenSearchTests {
    private func seededService() async throws -> (GardenService, TestClock) {
        let (service, _, clock) = try await makeService()
        let kitchen = try await service.addLocation(name: "Kitchen")
        _ = try await service.addPlant(PlantDraft(
            nickname: "Frank",
            commonName: "Rubber Plant",
            scientificName: "Ficus elastica",
            locationID: kitchen.id
        ))
        _ = try await service.addPlant(PlantDraft(
            commonName: "Monstera",
            notes: "Gift from Émilie"
        ))
        return (service, clock)
    }

    @Test("Search matches nickname, common name, and scientific name")
    func matchesNames() async throws {
        let (service, _) = try await seededService()
        for term in ["frank", "rubber", "ficus"] {
            let results = try await service.plants(GardenQuery(searchText: term))
            #expect(results.count == 1, "term: \(term)")
            #expect(results.first?.displayName == "Frank")
        }
    }

    @Test("Search matches room name and notes")
    func matchesRoomAndNotes() async throws {
        let (service, _) = try await seededService()
        let byRoom = try await service.plants(GardenQuery(searchText: "kitchen"))
        #expect(byRoom.first?.displayName == "Frank")

        let byNotes = try await service.plants(GardenQuery(searchText: "gift"))
        #expect(byNotes.first?.displayName == "Monstera")
    }

    @Test("Search ignores case and diacritics")
    func foldsDiacritics() async throws {
        let (service, _) = try await seededService()
        let results = try await service.plants(GardenQuery(searchText: "emilie"))
        #expect(results.count == 1)
        #expect(results.first?.displayName == "Monstera")
    }

    @Test("No match returns an empty list, not an error")
    func noMatches() async throws {
        let (service, _) = try await seededService()
        #expect(try await service.plants(GardenQuery(searchText: "orchid")).isEmpty)
    }

    @Test("Recently-added filter respects the 14-day window")
    func recentlyAddedWindow() async throws {
        let (service, clock) = try await seededService()
        clock.advance(byDays: 13)
        #expect(try await service.plants(GardenQuery(filter: .recentlyAdded)).count == 2)
        clock.advance(byDays: 2)
        #expect(try await service.plants(GardenQuery(filter: .recentlyAdded)).isEmpty)
    }

    @Test("Unidentified filter finds plants without species info")
    func unidentifiedFilter() async throws {
        let (service, _) = try await seededService()
        _ = try await service.addPlant(PlantDraft(nickname: "Mystery"))
        let results = try await service.plants(GardenQuery(filter: .unidentified))
        #expect(results.map(\.displayName) == ["Mystery"])
    }

    @Test("Room scope restricts results")
    func roomScope() async throws {
        let (service, _) = try await seededService()
        let kitchen = try await service.locations().first
        let kitchenID = try #require(kitchen?.id)
        let results = try await service.plants(GardenQuery(locationID: kitchenID))
        #expect(results.map(\.displayName) == ["Frank"])
    }

    @Test("Default sort is alphabetical by display name")
    func nameSort() async throws {
        let (service, _) = try await seededService()
        let names = try await service.plants().map(\.displayName)
        #expect(names == ["Frank", "Monstera"])
    }

    @Test("Recently-added sort puts newest first")
    func recencySort() async throws {
        let (service, clock) = try await seededService()
        clock.advance(byDays: 1)
        _ = try await service.addPlant(PlantDraft(nickname: "Aloe"))
        let names = try await service.plants(GardenQuery(sort: .recentlyAdded)).map(\.displayName)
        #expect(names.first == "Aloe")
    }
}

@Suite("Status derivation")
struct StatusEngineTests {
    private let base = Date(timeIntervalSince1970: 1_760_000_000)

    private func plant(daysOld: Int, care: CareAttributes = CareAttributes(), archived: Bool = false) -> Plant {
        let created = base.addingTimeInterval(-TimeInterval(daysOld) * 86_400)
        return Plant(
            nickname: "Test",
            lifecycle: archived ? .archived : .active,
            care: care,
            createdAt: created,
            updatedAt: created,
            archivedAt: archived ? created : nil
        )
    }

    @Test("Archived plants read as dormant")
    func archivedIsDormant() {
        let derived = StatusEngine.status(for: plant(daysOld: 100, archived: true), asOf: base)
        #expect(derived.status == .dormant)
    }

    @Test("A brand-new plant is 'getting to know', not judged")
    func newPlantIsUnknown() {
        let derived = StatusEngine.status(for: plant(daysOld: 2), asOf: base)
        #expect(derived.status == .unknown)
        #expect(!derived.reason.isEmpty)
    }

    @Test("A settled plant without care data stays unknown with an explanation")
    func noDataStaysUnknown() {
        let derived = StatusEngine.status(for: plant(daysOld: 30), asOf: base)
        #expect(derived.status == .unknown)
        #expect(derived.reason.contains("Not enough information"))
    }

    @Test("A settled plant with care data and no problems reads as doing well")
    func settledPlantDoingWell() {
        let care = CareAttributes(water: CareAttribute(value: "Weekly check"))
        let derived = StatusEngine.status(for: plant(daysOld: 30, care: care), asOf: base)
        #expect(derived.status == .doingWell)
    }

    @Test("Every status has a display name")
    func statusDisplayNames() {
        for status in PlantStatus.allCases {
            #expect(!status.displayName.isEmpty)
        }
    }
}
