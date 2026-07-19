import Foundation
@testable import GroveKit

/// Advanceable clock for exercising time-dependent logic deterministically.
final class TestClock: ClockProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _now: Date

    init(now: Date = Date(timeIntervalSince1970: 1_760_000_000)) {
        _now = now
    }

    var now: Date {
        lock.lock()
        defer { lock.unlock() }
        return _now
    }

    func advance(bySeconds seconds: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        _now = _now.addingTimeInterval(seconds)
    }

    func advance(byDays days: Int) {
        advance(bySeconds: TimeInterval(days) * 86_400)
    }
}

func makeService(
    store: InMemoryGardenStore = InMemoryGardenStore(),
    clock: TestClock = TestClock()
) async throws -> (GardenService, InMemoryGardenStore, TestClock) {
    let service = GardenService(repository: store, clock: clock)
    try await service.bootstrap()
    return (service, store, clock)
}
