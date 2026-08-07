Feature: Sunlit felt FreeCell presentation
  OL FreeCell keeps its familiar game while presenting a light, welcoming table.

  Scenario: Launch the daily FreeCell table
    Given I launch OL FreeCell at the root
    Then the daily FreeCell table is visible
    And all 52 cards are dealt across eight tableau columns
    And the gameplay controls retain their accessible names

  Scenario: Show the emerald sunlit felt theme
    Given I launch OL FreeCell at the root
    Then the emerald theme uses the sunlit felt palette
    And the table uses cream cards with soft shadows
    And selected cards and legal drop targets remain unmistakable

  Scenario: Soften the user-selectable Midnight theme
    Given I launch OL FreeCell at the root
    When I open the menu
    And I choose the Midnight theme
    Then the Midnight table is softer than the old severe theme
    And warm gold remains reserved for emphasis

  @native
  Scenario: Ignore physical device rotation
    Given I launch OL FreeCell at the root on an iPhone in portrait
    When I rotate the physical device to landscape left
    Then the native app remains portrait
    And the visible interface does not move or reflow
