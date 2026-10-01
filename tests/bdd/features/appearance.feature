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

  Scenario: Numbers and Faces are independently chosen and persist
    Given the daily app is open
    When the appearance sheet is opened
    And I pick the "emerald" table and "picture" cards
    Then the appearance sheet has the tabs Table, Look, Numbers, Faces, Back and Finish
    When I choose the "single" numbers
    And I choose the "close" faces
    Then the board numbers are "single"
    And the board faces are "close"
    And a number card shows the big suit treatment
    And a court card shows the close figure treatment
    When I reload the daily app
    Then the board numbers are "single"
    And the board faces are "close"
