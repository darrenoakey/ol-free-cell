import XCTest

final class AppUITests: XCTestCase {
    private var app = XCUIApplication()

    @MainActor
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        try launchUntilMenuReady()
    }

    @MainActor
    override func tearDownWithError() throws {
        XCUIDevice.shared.orientation = .portrait
        app.terminate()
    }

    @MainActor
    func testPhysicalRotationLeavesVisibleInterfaceUnchanged() throws {
        let menuButton = app.buttons["Menu"]
        XCTAssertTrue(menuButton.exists, "Menu missing after launch")

        let originalWindowFrame = try stableWindowFrame()
        let originalMenuFrame = try stableFrame(menuButton)
        XCTAssertGreaterThan(originalWindowFrame.height, originalWindowFrame.width)

        XCUIDevice.shared.orientation = .landscapeLeft
        RunLoop.current.run(until: Date().addingTimeInterval(0.6))
        try ensureMenuStillReachable()

        let rotatedWindowFrame = try stableWindowFrame()
        let rotatedMenuFrame = try stableFrame(menuButton)
        XCTAssertGreaterThan(rotatedWindowFrame.height, rotatedWindowFrame.width)
        XCTAssertEqual(rotatedWindowFrame, originalWindowFrame, accuracy: 3.0)
        XCTAssertEqual(rotatedMenuFrame, originalMenuFrame, accuracy: 3.0)

        XCUIDevice.shared.orientation = .portrait
    }

    @MainActor
    private func launchUntilMenuReady() throws {
        var lastError = "Menu never became reachable"
        for attempt in 1...3 {
            app.terminate()
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
            app = XCUIApplication()
            app.launchArguments = ["-UITesting"]
            app.launch()
            if waitForExistence(app.buttons["Menu"], timeout: attempt == 1 ? 12 : 18) {
                return
            }
            lastError = "Menu never became reachable after launch attempt \(attempt)"
        }
        XCTFail(lastError)
        throw XCTestError(.failureWhileWaiting)
    }

    @MainActor
    private func ensureMenuStillReachable() throws {
        if waitForExistence(app.buttons["Menu"], timeout: 4) { return }
        try launchUntilMenuReady()
    }

    @MainActor
    @discardableResult
    private func waitForExistence(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if app.state != .runningForeground {
                RunLoop.current.run(until: Date().addingTimeInterval(0.2))
                continue
            }
            if element.exists { return true }
            if element.waitForExistence(timeout: 0.5) { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return element.exists
    }

    @MainActor
    private func stableWindowFrame() throws -> CGRect {
        var last = CGRect.null
        for _ in 0..<8 {
            let frame = safeFrame { app.windows.element(boundBy: 0).frame }
            if !frame.isEmpty, frame == last { return frame }
            last = frame
            RunLoop.current.run(until: Date().addingTimeInterval(0.12))
        }
        let frame = safeFrame { app.windows.element(boundBy: 0).frame }
        XCTAssertFalse(frame.isEmpty, "Window frame never stabilized")
        return frame
    }

    @MainActor
    private func stableFrame(_ element: XCUIElement) throws -> CGRect {
        var last = CGRect.null
        for _ in 0..<8 {
            let frame = safeFrame { element.frame }
            if !frame.isEmpty, frame == last { return frame }
            last = frame
            RunLoop.current.run(until: Date().addingTimeInterval(0.12))
        }
        let frame = safeFrame { element.frame }
        XCTAssertFalse(frame.isEmpty, "Element frame never stabilized")
        return frame
    }

    @MainActor
    private func safeFrame(_ read: () -> CGRect) -> CGRect {
        let frame = read()
        if frame.isNull || frame.isInfinite { return .null }
        return frame
    }
}

private func XCTAssertEqual(_ lhs: CGRect, _ rhs: CGRect, accuracy: CGFloat, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(lhs.origin.x, rhs.origin.x, accuracy: accuracy, file: file, line: line)
    XCTAssertEqual(lhs.origin.y, rhs.origin.y, accuracy: accuracy, file: file, line: line)
    XCTAssertEqual(lhs.size.width, rhs.size.width, accuracy: accuracy, file: file, line: line)
    XCTAssertEqual(lhs.size.height, rhs.size.height, accuracy: accuracy, file: file, line: line)
}
