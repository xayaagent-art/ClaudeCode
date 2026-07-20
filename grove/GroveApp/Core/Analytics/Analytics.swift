import Foundation

/// Privacy-aware analytics boundary (PRD 21). Events are bounded names only —
/// no notes, no photos, no locations. Milestone 1 ships the no-op implementation;
/// a real backend can be swapped in without touching call sites.
enum AnalyticsEvent: String {
    case onboardingStarted = "onboarding_started"
    case plantCreated = "plant_created"
    case plantArchived = "plant_archived"
    case demoGardenInstalled = "demo_garden_installed"
    case careEventLogged = "care_event_logged"
    case careTaskSnoozed = "care_task_snoozed"
    case careScheduleCreated = "care_schedule_created"
}

protocol AnalyticsTracking: Sendable {
    func track(_ event: AnalyticsEvent)
}

struct NoOpAnalytics: AnalyticsTracking {
    func track(_ event: AnalyticsEvent) {}
}
