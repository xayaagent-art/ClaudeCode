import XCTest

/// Milestone 2 critical path: the demo garden surfaces a due review on Today,
/// and completing it takes two taps.
final class CareQueueUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testCompleteDueTaskFromToday() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-reset"]
        app.launch()

        // Enter through the demo garden, which includes a due soil check.
        let demo = app.buttons["Explore a demo garden"]
        XCTAssertTrue(demo.waitForExistence(timeout: 10))
        demo.tap()

        let todayTab = app.tabBars.buttons["Today"]
        XCTAssertTrue(todayTab.waitForExistence(timeout: 10))
        todayTab.tap()

        // The queue shows a completion option; one tap completes the review.
        let soilDry = app.buttons["Soil dry"].firstMatch
        let stillMoist = app.buttons["Still moist"].firstMatch
        let completion = soilDry.exists ? soilDry : stillMoist
        XCTAssertTrue(completion.waitForExistence(timeout: 5), "A due care task should be visible")
        completion.tap()

        // The undo toast confirms the log landed.
        XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 5))
    }
}
