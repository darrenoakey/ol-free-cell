Feature: Appearance persists
  FreeCell keeps a chosen table and card look across a reload.

  Scenario: A non-default theme and card look survive reload
    Given the daily app is open
    When the appearance sheet is opened
    And I pick the "twilight" table and "picture" cards
    And I reload the daily app
    Then the table theme is "twilight"
    And the card look is "picture"

  Scenario: Classic cards show only the art's own border
    Given the daily app is open
    When the appearance sheet is opened
    And I pick the "emerald" table and "classic" cards
    Then a classic card has no ring or outline
