import XCTest

/// Real iPhone Duo posture tests. Run this class on the unfolded/folded Duo
/// simulator separately; the ordinary-phone gate runs AppUITests only.
final class DuoWorkspaceUITests: XCTestCase {
    private var app = XCUIApplication()

    @MainActor
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["-UITesting"]
        app.launch()
        XCTAssertTrue(waitForExistence(app.buttons["Menu"], timeout: 20))
    }

    @MainActor
    override func tearDownWithError() throws {
        XCUIDevice.shared.orientation = .portrait
        app.terminate()
    }

    @MainActor
    func testFoldedIPhoneDuoKeepsOnlyTheLiveTable() {
        XCTAssertTrue(app.buttons["Menu"].isHittable)
        XCTAssertTrue(app.buttons["Undo"].exists)
        XCTAssertFalse(app.buttons["Move history"].exists)
        XCTAssertFalse(app.buttons["Daily progress"].exists)
        let window = app.windows.element(boundBy: 0).frame
        XCTAssertGreaterThan(window.height, window.width)
    }

    @MainActor
    func testUnfoldedIPhoneDuoShowsCompanionBesideLiveTable() {
        XCUIDevice.shared.orientation = .landscapeLeft
        let movesTab = app.buttons["Move history"]
        XCTAssertTrue(waitForExistence(movesTab, timeout: 15))
        XCTAssertTrue(movesTab.isHittable)
        XCTAssertTrue(app.buttons["Menu"].exists)
        XCTAssertTrue(app.buttons["Undo"].exists)
        XCTAssertTrue(app.staticTexts["Live · move 0"].exists)

        let dailyTab = app.buttons["Daily progress"]
        XCTAssertTrue(dailyTab.isHittable)
        dailyTab.tap()
        XCTAssertTrue(waitForExistence(app.staticTexts["Daily calendar"], timeout: 5))
        XCTAssertTrue(app.staticTexts["Solved"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Win rate"].firstMatch.exists)

        movesTab.tap()
        XCTAssertTrue(waitForExistence(app.staticTexts["READ-ONLY REPLAY"], timeout: 5))
        XCTAssertTrue(app.buttons["Previous review position"].exists)
        XCTAssertTrue(app.buttons["Next review position"].exists)
        let window = app.windows.element(boundBy: 0).frame
        XCTAssertGreaterThan(window.width, window.height)
    }

    @MainActor
    private func waitForExistence(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists { return true }
            if element.waitForExistence(timeout: 0.5) { return true }
        }
        return element.exists
    }
}
