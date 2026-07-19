import Foundation

/// Input for creating a plant. Everything except some form of name is optional:
/// "User can create a plant with only a name" (Milestone 1 acceptance criteria).
public struct PlantDraft: Sendable {
    public var nickname: String?
    public var commonName: String?
    public var scientificName: String?
    public var locationID: PlantLocation.ID?
    public var acquisitionDate: Date?
    public var acquisitionSource: String?
    public var notes: String
    public var care: CareAttributes
    public var coverAssetID: MediaAsset.ID?

    public init(
        nickname: String? = nil,
        commonName: String? = nil,
        scientificName: String? = nil,
        locationID: PlantLocation.ID? = nil,
        acquisitionDate: Date? = nil,
        acquisitionSource: String? = nil,
        notes: String = "",
        care: CareAttributes = CareAttributes(),
        coverAssetID: MediaAsset.ID? = nil
    ) {
        self.nickname = nickname
        self.commonName = commonName
        self.scientificName = scientificName
        self.locationID = locationID
        self.acquisitionDate = acquisitionDate
        self.acquisitionSource = acquisitionSource
        self.notes = notes
        self.care = care
        self.coverAssetID = coverAssetID
    }
}

public enum GardenError: Error, Equatable {
    case nameRequired
    case plantNotFound
    case locationNotFound
    case duplicateLocationName(String)
    case notLoaded
}

/// The single owner of garden state. All mutations go through here, persist
/// immediately (local-first, offline-safe), and keep timestamps honest.
public actor GardenService {
    private let repository: any GardenRepository
    private let clock: any ClockProviding
    private var snapshot: GardenSnapshot?

    public init(repository: any GardenRepository, clock: any ClockProviding = SystemClock()) {
        self.repository = repository
        self.clock = clock
    }

    /// Loads persisted state. Must be called once before use.
    public func bootstrap() async throws {
        snapshot = try await repository.load()
    }

    // MARK: - Reading

    public func currentSnapshot() throws -> GardenSnapshot {
        guard let snapshot else { throw GardenError.notLoaded }
        return snapshot
    }

    public func plant(id: Plant.ID) throws -> Plant {
        guard let plant = try currentSnapshot().plants.first(where: { $0.id == id }) else {
            throw GardenError.plantNotFound
        }
        return plant
    }

    public func location(id: PlantLocation.ID) throws -> PlantLocation {
        guard let location = try currentSnapshot().locations.first(where: { $0.id == id }) else {
            throw GardenError.locationNotFound
        }
        return location
    }

    public func locations(includeArchived: Bool = false) throws -> [PlantLocation] {
        try currentSnapshot().locations
            .filter { includeArchived || $0.archivedAt == nil }
            .sorted { ($0.sortOrder, $0.name) < ($1.sortOrder, $1.name) }
    }

    /// Query the garden with search text, a filter, and a sort (PRD 10.3).
    public func plants(_ query: GardenQuery = GardenQuery()) throws -> [Plant] {
        let snapshot = try currentSnapshot()
        return GardenSearch.run(query, over: snapshot, asOf: clock.now)
    }

    public func hasCompletedFirstRun() throws -> Bool {
        try currentSnapshot().hasCompletedFirstRun
    }

    public func derivedStatus(for plant: Plant) -> DerivedStatus {
        StatusEngine.status(for: plant, asOf: clock.now)
    }

    // MARK: - Plant mutations

    @discardableResult
    public func addPlant(_ draft: PlantDraft) async throws -> Plant {
        guard hasAnyName(draft) else { throw GardenError.nameRequired }
        var snapshot = try currentSnapshot()
        if let locationID = draft.locationID {
            guard snapshot.locations.contains(where: { $0.id == locationID }) else {
                throw GardenError.locationNotFound
            }
        }
        let now = clock.now
        let plant = Plant(
            nickname: draft.nickname?.trimmed.nonEmpty,
            commonName: draft.commonName?.trimmed.nonEmpty,
            scientificName: draft.scientificName?.trimmed.nonEmpty,
            identification: identificationStatus(for: draft),
            origin: .userCreated,
            locationID: draft.locationID,
            acquisitionDate: draft.acquisitionDate,
            acquisitionSource: draft.acquisitionSource?.trimmed.nonEmpty,
            notes: draft.notes,
            coverAssetID: draft.coverAssetID,
            care: draft.care,
            createdAt: now,
            updatedAt: now
        )
        snapshot.plants.append(plant)
        try await persist(snapshot)
        return plant
    }

    @discardableResult
    public func updatePlant(_ updated: Plant) async throws -> Plant {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.plants.firstIndex(where: { $0.id == updated.id }) else {
            throw GardenError.plantNotFound
        }
        let hasName = [updated.nickname, updated.commonName, updated.scientificName]
            .contains { $0?.trimmed.isEmpty == false }
        guard hasName else { throw GardenError.nameRequired }
        var plant = updated
        plant.createdAt = snapshot.plants[index].createdAt
        plant.updatedAt = clock.now
        snapshot.plants[index] = plant
        try await persist(snapshot)
        return plant
    }

    @discardableResult
    public func archivePlant(id: Plant.ID) async throws -> Plant {
        try await mutatePlant(id: id) { plant, now in
            plant.lifecycle = .archived
            plant.archivedAt = now
        }
    }

    /// Archive is reversible (Milestone 1 acceptance criteria).
    @discardableResult
    public func restorePlant(id: Plant.ID) async throws -> Plant {
        try await mutatePlant(id: id) { plant, _ in
            plant.lifecycle = .active
            plant.archivedAt = nil
        }
    }

    /// Permanent removal. The app only offers this for already-archived plants.
    public func deletePlant(id: Plant.ID) async throws {
        var snapshot = try currentSnapshot()
        guard snapshot.plants.contains(where: { $0.id == id }) else {
            throw GardenError.plantNotFound
        }
        snapshot.plants.removeAll { $0.id == id }
        try await persist(snapshot)
    }

    @discardableResult
    public func movePlant(id: Plant.ID, to locationID: PlantLocation.ID?) async throws -> Plant {
        if let locationID {
            _ = try location(id: locationID)
        }
        return try await mutatePlant(id: id) { plant, _ in
            plant.locationID = locationID
        }
    }

    // MARK: - Location mutations

    @discardableResult
    public func addLocation(
        name: String,
        type: LocationType = .room,
        windowDirection: WindowDirection? = nil,
        defaultLightLevel: LightLevel? = nil
    ) async throws -> PlantLocation {
        let trimmedName = name.trimmed
        guard !trimmedName.isEmpty else { throw GardenError.nameRequired }
        var snapshot = try currentSnapshot()
        let exists = snapshot.locations.contains {
            $0.archivedAt == nil && $0.name.lowercased() == trimmedName.lowercased()
        }
        guard !exists else { throw GardenError.duplicateLocationName(trimmedName) }
        let sortOrder = (snapshot.locations.map(\.sortOrder).max() ?? -1) + 1
        let location = PlantLocation(
            name: trimmedName,
            type: type,
            windowDirection: windowDirection,
            defaultLightLevel: defaultLightLevel,
            sortOrder: sortOrder
        )
        snapshot.locations.append(location)
        try await persist(snapshot)
        return location
    }

    @discardableResult
    public func updateLocation(_ updated: PlantLocation) async throws -> PlantLocation {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.locations.firstIndex(where: { $0.id == updated.id }) else {
            throw GardenError.locationNotFound
        }
        guard !updated.name.trimmed.isEmpty else { throw GardenError.nameRequired }
        snapshot.locations[index] = updated
        try await persist(snapshot)
        return updated
    }

    /// Archiving a room never deletes plants; they become unassigned.
    public func archiveLocation(id: PlantLocation.ID) async throws {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.locations.firstIndex(where: { $0.id == id }) else {
            throw GardenError.locationNotFound
        }
        snapshot.locations[index].archivedAt = clock.now
        for plantIndex in snapshot.plants.indices where snapshot.plants[plantIndex].locationID == id {
            snapshot.plants[plantIndex].locationID = nil
        }
        try await persist(snapshot)
    }

    // MARK: - Media

    @discardableResult
    public func registerMediaAsset(pixelWidth: Int?, pixelHeight: Int?) async throws -> MediaAsset {
        var snapshot = try currentSnapshot()
        let asset = MediaAsset(pixelWidth: pixelWidth, pixelHeight: pixelHeight, createdAt: clock.now)
        snapshot.mediaAssets.append(asset)
        try await persist(snapshot)
        return asset
    }

    // MARK: - First run and demo garden

    public func markFirstRunComplete() async throws {
        var snapshot = try currentSnapshot()
        snapshot.hasCompletedFirstRun = true
        try await persist(snapshot)
    }

    public func resetFirstRun() async throws {
        var snapshot = try currentSnapshot()
        snapshot.hasCompletedFirstRun = false
        try await persist(snapshot)
    }

    /// Installs the explorable demo garden. Idempotent: never duplicates.
    @discardableResult
    public func installDemoGarden() async throws -> [Plant] {
        var snapshot = try currentSnapshot()
        let existingDemo = snapshot.plants.filter { $0.origin == .demo }
        guard existingDemo.isEmpty else { return existingDemo }
        let demo = DemoGarden.make(asOf: clock.now, existingLocations: snapshot.locations)
        snapshot.locations.append(contentsOf: demo.newLocations)
        snapshot.plants.append(contentsOf: demo.plants)
        try await persist(snapshot)
        return demo.plants
    }

    /// Removes demo plants, plus demo-created rooms no user plant still uses.
    /// User-created rooms are never touched, even if demo plants lived in them.
    public func removeDemoGarden() async throws {
        var snapshot = try currentSnapshot()
        let demoPlantIDs = Set(snapshot.plants.filter { $0.origin == .demo }.map(\.id))
        guard !demoPlantIDs.isEmpty else { return }
        snapshot.plants.removeAll { demoPlantIDs.contains($0.id) }
        let stillUsedLocationIDs = Set(snapshot.plants.compactMap(\.locationID))
        snapshot.locations.removeAll { location in
            location.isDemo && !stillUsedLocationIDs.contains(location.id)
        }
        try await persist(snapshot)
    }

    // MARK: - Private

    private func mutatePlant(
        id: Plant.ID,
        _ change: (inout Plant, Date) -> Void
    ) async throws -> Plant {
        var snapshot = try currentSnapshot()
        guard let index = snapshot.plants.firstIndex(where: { $0.id == id }) else {
            throw GardenError.plantNotFound
        }
        let now = clock.now
        var plant = snapshot.plants[index]
        change(&plant, now)
        plant.updatedAt = now
        snapshot.plants[index] = plant
        try await persist(snapshot)
        return plant
    }

    private func persist(_ newSnapshot: GardenSnapshot) async throws {
        try await repository.save(newSnapshot)
        snapshot = newSnapshot
    }

    private func hasAnyName(_ draft: PlantDraft) -> Bool {
        [draft.nickname, draft.commonName, draft.scientificName]
            .contains { $0?.trimmed.isEmpty == false }
    }

    private func identificationStatus(for draft: PlantDraft) -> IdentificationStatus {
        let hasSpecies = [draft.commonName, draft.scientificName]
            .contains { $0?.trimmed.isEmpty == false }
        return hasSpecies ? .userProvided : .unidentified
    }
}

extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
