import Foundation
import GroveKit

/// Local image storage keyed by media asset ID. Pixel data stays out of the
/// garden document so the JSON store remains small and fast.
protocol MediaStoring: Sendable {
    func saveImageData(_ data: Data, for id: MediaAsset.ID) async throws
    func imageData(for id: MediaAsset.ID) async -> Data?
    func deleteImageData(for id: MediaAsset.ID) async
}

/// Stores JPEG data as one file per asset under Application Support.
actor FileMediaStore: MediaStoring {
    private let directory: URL
    private let fileManager: FileManager

    init(directory: URL, fileManager: FileManager = .default) {
        self.directory = directory
        self.fileManager = fileManager
    }

    private func fileURL(for id: MediaAsset.ID) -> URL {
        directory.appendingPathComponent("\(id.rawValue.uuidString).jpg")
    }

    func saveImageData(_ data: Data, for id: MediaAsset.ID) async throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try data.write(to: fileURL(for: id), options: .atomic)
    }

    func imageData(for id: MediaAsset.ID) async -> Data? {
        try? Data(contentsOf: fileURL(for: id))
    }

    func deleteImageData(for id: MediaAsset.ID) async {
        try? fileManager.removeItem(at: fileURL(for: id))
    }
}

/// For previews and tests.
actor InMemoryMediaStore: MediaStoring {
    private var storage: [MediaAsset.ID: Data] = [:]

    func saveImageData(_ data: Data, for id: MediaAsset.ID) async throws {
        storage[id] = data
    }

    func imageData(for id: MediaAsset.ID) async -> Data? {
        storage[id]
    }

    func deleteImageData(for id: MediaAsset.ID) async {
        storage[id] = nil
    }
}
