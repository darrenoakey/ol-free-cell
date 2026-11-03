Feature: Daily rollover
  One deterministic proven deal per local day. An unfinished daily fails at
  11:59:59 of its own local day with a bad-luck result; solved days are never
  overwritten; the boundary is local-calendar correct across time zones and DST.

  Scenario: The daily deal is deterministic for a date
    Given the date is "2026-11-04" at "09:00"
    And I launch OL FreeCell at the root
    When I note the foundation start
    And I reload the app
    Then the daily deal is the same as before

  Scenario: An unfinished daily fails at 11:59:59 while playing
    Given the date is "2026-11-04" at "23:59"
    And I launch OL FreeCell at the root
    And I leave the daily in progress with saved progress
    When the clock passes midnight
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the stale progress is cleared

  Scenario: A suspended unfinished daily fails on a later relaunch
    Given the date is "2026-11-04" at "20:00"
    And I launch OL FreeCell at the root
    And I leave the daily in progress with saved progress
    When the date becomes "2026-11-06" at "08:00"
    And I reload the app
    Then the day "2026-11-04" is recorded as failed
    And the stale progress is cleared

  Scenario: A solved day is never overwritten by expiry
    Given the date is "2026-11-04" at "10:00"
    And I launch OL FreeCell at the root
    When I have a solved record for "2026-11-04" with unfinished progress
    And the date becomes "2026-11-05" at "08:00"
    And I reload the app
    Then the day "2026-11-04" is recorded as solved
    And the stale progress is cleared

  Scenario: DST end does not double-count or skip a day
    Given the date is "2026-04-04" at "20:00"
    And I launch OL FreeCell at the root
    And I leave the daily in progress with saved progress
    When the date becomes "2026-04-06" at "09:00"
    And I reload the app
    Then the day "2026-04-04" is recorded as failed
