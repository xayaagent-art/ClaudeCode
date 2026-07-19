import Foundation

/// The central object of Grove. Everything in the product attaches to a plant record.
public struct Plant: Identifiable, Hashable, Codable, Sendable {
    public typealias ID = Identifier<Plant>

    public var id: ID
    /// The user's chosen name. Never overwritten by identification.
    public var nickname: String?
    public var commonName: String?
    public var scientificName: String?
    public var identification: IdentificationStatus
    public var origin: PlantOrigin
    public var locationID: PlantLocation.ID?
    public var lifecycle: LifecycleStatus
    public var acquisitionDate: Date?
    public var acquisitionSource: String?
    public var notes: String
    public var coverAssetID: MediaAsset.ID?
    public var care: CareAttributes
    public var createdAt: Date
    public var updatedAt: Date
    public var archivedAt: Date?

    public init(
        id: ID = ID(),
        nickname: String? = nil,
        commonName: String? = nil,
        scientificName: String? = nil,
        identification: IdentificationStatus = .unidentified,
        origin: PlantOrigin = .userCreated,
        locationID: PlantLocation.ID? = nil,
        lifecycle: LifecycleStatus = .active,
        acquisitionDate: Date? = nil,
        acquisitionSource: String? = nil,
        notes: String = "",
        coverAssetID: MediaAsset.ID? = nil,
        care: CareAttributes = CareAttributes(),
        createdAt: Date,
        updatedAt: Date,
        archivedAt: Date? = nil
    ) {
        self.id = id
        self.nickname = nickname
        self.commonName = commonName
        self.scientificName = scientificName
        self.identification = identification
        self.origin = origin
        self.locationID = locationID
        self.lifecycle = lifecycle
        self.acquisitionDate = acquisitionDate
        self.acquisitionSource = acquisitionSource
        self.notes = notes
        self.coverAssetID = coverAssetID
        self.care = care
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.archivedAt = archivedAt
    }

    /// User-visible name. Common name first per PRD naming conventions,
    /// but the user's nickname always wins.
    public var displayName: String {
        for candidate in [nickname, commonName, scientificName] {
            if let candidate, !candidate.trimmed.isEmpty {
                return candidate.trimmed
            }
        }
        return "Unnamed plant"
    }

    /// Secondary identity line shown under the display name, if distinct from it.
    public var secondaryName: String? {
        let display = displayName
        for candidate in [commonName, scientificName] {
            if let candidate, !candidate.trimmed.isEmpty, candidate.trimmed != display {
                return candidate.trimmed
            }
        }
        return nil
    }

    public var isArchived: Bool { lifecycle == .archived }
}

/// How the plant's identity was established. AI-backed cases arrive in Milestone 4;
/// the cases exist now so records created today survive that migration.
public enum IdentificationStatus: String, Codable, Sendable, Hashable {
    /// No species information at all.
    case unidentified
    /// The user typed or picked the species themselves.
    case userProvided
    /// A future AI identification the user has confirmed.
    case aiConfirmed
    /// A future AI candidate the user has not yet confirmed.
    case aiCandidate
}

public enum PlantOrigin: String, Codable, Sendable, Hashable {
    case userCreated
    case demo
    case propagation
    case transferred
}

public enum LifecycleStatus: String, Codable, Sendable, Hashable {
    case active
    case archived
}

extension String {
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
