import Foundation

/// A strongly typed UUID wrapper so a `Plant.ID` can never be passed where a
/// `PlantLocation.ID` is expected.
public struct Identifier<Entity>: RawRepresentable, Hashable, Sendable {
    public let rawValue: UUID

    public init(rawValue: UUID) {
        self.rawValue = rawValue
    }

    public init() {
        self.init(rawValue: UUID())
    }
}

extension Identifier: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(rawValue: try container.decode(UUID.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

extension Identifier: CustomStringConvertible {
    public var description: String { rawValue.uuidString }
}
