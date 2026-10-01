Feature: OL daily contract
  A daily app that vendors OL Core shows the same calendar, stats and appearance.

  Scenario: calendar, stats and appearance are the shared chrome
    Given the daily app is open
    When the calendar is opened
    Then the calendar grid is visible
    When the statistics are opened
    Then stats tiles are present
    When the appearance sheet is opened
    Then the appearance sheet lists looks and themes

  Scenario: face-down cards reveal nothing
    Given the daily app is open
    Then face-down cards reveal nothing
