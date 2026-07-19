import Foundation

/// File-backed repository: one JSON document, written atomically so a crash
/// mid-save can never corrupt the garden. Suitable for Milestone 1 data sizes;
/// the repository protocol allows a database-backed replacement without
/// touching domain or UI code.
public actor JSONGardenStore: GardenRepository {
    private let fileURL: URL
    private let fileManager: FileManager

    public init(fileURL: URL, fileManager: FileManager = .default) {
        self.fileURL = fileURL
        self.fileManager = fileManager
    }

    /// The default store location inside Application Support.
    public static func defaultFileURL(fileManager: FileManager = .default) throws -> URL {
        let base = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return base
            .appendingPathComponent("Grove", isDirectory: true)
            .appendingPathComponent("garden.json", isDirectory: false)
    }

    public func load() async throws -> GardenSnapshot {
        guard fileManager.fileExists(atPath: fileURL.path) else {
            return GardenSnapshot()
        }
        let data: Data
        do {
            data = try Data(contentsOf: fileURL)
        } catch {
            throw GardenRepositoryError.unreadableStore(String(describing: error))
        }
        let snapshot: GardenSnapshot
        do {
            snapshot = try Self.decoder.decode(GardenSnapshot.self, from: data)
        } catch {
            throw GardenRepositoryError.unreadableStore(String(describing: error))
        }
        guard snapshot.schemaVersion <= GardenSnapshot.currentSchemaVersion else {
            throw GardenRepositoryError.unsupportedSchema(
                found: snapshot.schemaVersion,
                supported: GardenSnapshot.currentSchemaVersion
            )
        }
        return migrateIfNeeded(snapshot)
    }

    public func save(_ snapshot: GardenSnapshot) async throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        let data = try Self.encoder.encode(snapshot)
        // .atomic writes to a temp file and renames, so a crash mid-save can
        // never leave a truncated garden document.
        try data.write(to: fileURL, options: .atomic)
    }

    /// Hook for future schema migrations. Version 1 is current, so this is identity.
    private nonisolated func migrateIfNeeded(_ snapshot: GardenSnapshot) -> GardenSnapshot {
        var migrated = snapshot
        migrated.schemaVersion = GardenSnapshot.currentSchemaVersion
        return migrated
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
