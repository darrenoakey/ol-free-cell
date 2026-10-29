Feature: iPhone Duo FreeCell workspace
  An unfolded iPhone Duo keeps the live FreeCell table beside a useful second
  workspace. Folding preserves the same game, card geometry and daily progress.

  Scenario: Folded play keeps one full-width table
    Given I launch OL FreeCell at the root
    Then the daily FreeCell table is visible
    And the Duo companion is hidden
    And the FreeCell table uses the folded width

  Scenario: Unfolding reveals non-destructive live move replay
    Given I launch OL FreeCell at the root
    When I unfold the Duo workspace
    Then the Duo companion is visible beside the FreeCell table
    And the Move history tab is selected
    When I drag a playable card to an empty freecell
    Then the move history records the actual card move
    When I select the first move for review
    Then the replay shows the position after move 1
    And the live table remains at move 1
    When I step back to the initial deal
    Then the replay shows the initial deal
    And the live table remains at move 1
    When I return to the live position
    Then the replay shows the position after move 1
    When I fold the Duo workspace
    Then the Duo companion is hidden
    And the FreeCell table uses the folded width
    When I unfold the Duo workspace
    Then the move history records the actual card move

  Scenario: Daily progress uses real OL.History records
    Given my FreeCell history has two solved days this month
    And I launch OL FreeCell at the root
    When I unfold the Duo workspace
    And I select the Daily progress tab
    Then the Duo calendar marks both solved days
    And the Duo statistics show 2 solved days
    When I choose the first solved day in the Duo calendar
    Then the Duo calendar shows that day's time and move count
    When I fold the Duo workspace
    And I unfold the Duo workspace
    Then the Duo calendar still shows that day's time and move count

  Scenario: Legacy in-progress deals survive and gain a persistent journal
    Given a legacy FreeCell deal is in progress at move 4
    And I launch OL FreeCell at the root
    Then the live table remains at move 4
    When I unfold the Duo workspace
    Then the move history says it begins with the next move
    When I drag a playable card to an empty freecell
    Then the live table remains at move 5
    And the move history records the actual card move
    When I reopen OL FreeCell
    Then the live table remains at move 5
    And the move history records the actual card move
