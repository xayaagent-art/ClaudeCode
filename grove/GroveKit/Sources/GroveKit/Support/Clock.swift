import Foundation

/// Injectable time source so schedule and status logic is testable
/// across timezones and fixed instants.
public protocol ClockProviding: Sendable {
    var now: Date { get }
}

public struct SystemClock: ClockProviding {
    public init() {}
    public var now: Date { Date() }
}

/// A clock fixed at a specific instant, for tests and previews.
public struct FixedClock: ClockProviding {
    public var now: Date
    public init(now: Date) {
        self.now = now
    }
}
