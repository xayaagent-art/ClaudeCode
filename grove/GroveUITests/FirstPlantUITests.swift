import XCTest

/// Milestone 1 critical path: a brand-new user creates their first plant
/// and finds it in the Garden (PRD Milestone 1 acceptance criteria).
final class FirstPlantUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testCreateFirstPlantFromFirstRun() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-reset"]
        app.launch()

        // First-run screen offers adding a plant without an account.
        let addFirstPlant = app.buttons["Add your first plant"]
        XCTAssertTrue(addFirstPlant.waitForExistence(timeout: 10))
        addFirstPlant.tap()

        // Only a name is required.
        let nameField = app.textFields["plantNameField"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap()
        nameField.typeText("Frank")

        let save = app.buttons["savePlantButton"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        // After saving the first plant, the main shell appears.
        let gardenTab = app.tabBars.buttons["Garden"]
        XCTAssertTrue(gardenTab.waitForExistence(timeout: 10))
        gardenTab.tap()

        XCTAssertTrue(app.staticTexts["Frank"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testDemoGardenPathShowsPlants() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-reset"]
        app.launch()

        let demo = app.buttons["Explore a demo garden"]
        XCTAssertTrue(demo.waitForExistence(timeout: 10))
        demo.tap()

        let gardenTab = app.tabBars.buttons["Garden"]
        XCTAssertTrue(gardenTab.waitForExistence(timeout: 10))
        gardenTab.tap()

        XCTAssertTrue(app.staticTexts["Frank"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Monstera"].exists)
    }
}
