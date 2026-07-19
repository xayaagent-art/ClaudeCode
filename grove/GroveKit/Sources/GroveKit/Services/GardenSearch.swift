import Foundation

/// A garden query: free text, one filter, optional room scope, and a sort.
public struct GardenQuery: Sendable, Equatable {
    public var searchText: String
    public var filter: GardenFilter
    public var locationID: PlantLocation.ID?
    public var sort: GardenSort

    public init(
        searchText: String = "",
        filter: GardenFilter = .active,
        locationID: PlantLocation.ID? = nil,
        sort: GardenSort = .name
    ) {
        self.searchText = searchText
        self.filter = filter
        self.locationID = locationID
        self.sort = sort
    }
}

public enum GardenFilter: Sendable, Equatable, Hashable, CaseIterable {
    /// Active plants only — the default garden view.
    case active
    /// Added within the last 14 days.
    case recentlyAdded
    /// No species information recorded yet.
    case unidentified
    /// Archived plants only.
    case archived

    public var displayName: String {
        switch self {
        case .active: "All"
        case .recentlyAdded: "Recently added"
        case .unidentified: "Unidentified"
        case .archived: "Archived"
        }
    }

    public static let recentlyAddedDays = 14
}

public enum GardenSort: Sendable, Equatable, Hashable {
    case name
    case recentlyAdded
    case recentlyUpdated
}

/// Pure query engine over a snapshot. Kept free of state so it is trivially testable.
public enum GardenSearch {
    public static func run(
        _ query: GardenQuery,
        over snapshot: GardenSnapshot,
        asOf now: Date
    ) -> [Plant] {
        let locationNames = Dictionary(
            uniqueKeysWithValues: snapshot.locations.map { ($0.id, $0.name) }
        )

        var plants = snapshot.plants.filter { plant in
            matchesFilter(plant, filter: query.filter, asOf: now)
        }

        if let locationID = query.locationID {
            plants = plants.filter { $0.locationID == locationID }
        }

        let needle = fold(query.searchText)
        if !needle.isEmpty {
            plants = plants.filter { plant in
                let roomName = plant.locationID.flatMap { locationNames[$0] }
                return haystack(for: plant, roomName: roomName)
                    .contains { $0.contains(needle) }
            }
        }

        return sorted(plants, by: query.sort)
    }

    // MARK: - Private

    private static func matchesFilter(_ plant: Plant, filter: GardenFilter, asOf now: Date) -> Bool {
        switch filter {
        case .active:
            return !plant.isArchived
        case .archived:
            return plant.isArchived
        case .recentlyAdded:
            let cutoff = now.addingTimeInterval(-TimeInterval(GardenFilter.recentlyAddedDays) * 86_400)
            return !plant.isArchived && plant.createdAt >= cutoff
        case .unidentified:
            return !plant.isArchived && plant.identification == .unidentified
        }
    }

    private static func haystack(for plant: Plant, roomName: String?) -> [String] {
        [plant.nickname, plant.commonName, plant.scientificName, plant.notes, roomName]
            .compactMap { $0 }
            .map(fold)
            .filter { !$0.isEmpty }
    }

    /// Case- and diacritic-insensitive normalization so "Fráncés" matches "frances".
    private static func fold(_ text: String) -> String {
        text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func sorted(_ plants: [Plant], by sort: GardenSort) -> [Plant] {
        switch sort {
        case .name:
            plants.sorted {
                ($0.displayName.lowercased(), $0.createdAt) < ($1.displayName.lowercased(), $1.createdAt)
            }
        case .recentlyAdded:
            plants.sorted { $0.createdAt > $1.createdAt }
        case .recentlyUpdated:
            plants.sorted { $0.updatedAt > $1.updatedAt }
        }
    }
}
