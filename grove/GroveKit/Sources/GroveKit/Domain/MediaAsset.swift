import Foundation

/// Metadata for a locally stored image. Pixel data lives in the app's media store,
/// keyed by this asset's ID (PRD 17.10, reduced to the Milestone 1 subset).
public struct MediaAsset: Identifiable, Hashable, Codable, Sendable {
    public typealias ID = Identifier<MediaAsset>

    public var id: ID
    public var pixelWidth: Int?
    public var pixelHeight: Int?
    public var capturedAt: Date?
    public var createdAt: Date

    public init(
        id: ID = ID(),
        pixelWidth: Int? = nil,
        pixelHeight: Int? = nil,
        capturedAt: Date? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.capturedAt = capturedAt
        self.createdAt = createdAt
    }
}
