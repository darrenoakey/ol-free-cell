Feature: Daily rollover
  One deterministic proven deal per local day. A started daily that is still
  unsolved fails at 11:59:59 of its own local day with a bad-luck result. It is
  never resumed on a later day, solved days are never overwritten, and a day
  that was never started is never failed. The boundary is the device's local
  calendar, correct across time zones and DST.

  # Rule 1: one deal per local day, seeded only by the date.

  Scenario: The daily deal is deterministic for a date
    Given the date is "2026-11-04" at "09:00"
    And I launch OL FreeCell at the root
    When I note the foundation start
    And I reload the app
    Then the daily deal is the same as before

  Scenario: Every device gets the same deal for the same local date
    Given the date is "2026-11-04" at "09:00"
    When I note the foundation start
    And the device time zone is "America/New_York"
    And the date is "2026-11-04" at "21:00"
    Then the daily deal is the same as before

  Scenario: The next local date is a different deal
    Given the date is "2026-11-04" at "09:00"
    When I note the foundation start
    And the date becomes "2026-11-05" at "09:00"
    And I reload the app
    Then the table shows a fresh deal for "2026-11-05"
    And the daily deal differs from before

  # Rules 2 and 3: the app stays open while midnight passes.

  Scenario: A started daily fails when midnight passes with the app open
    Given the date is "2026-11-04" at "23:59"
    And I launch OL FreeCell at the root
    And I leave the daily in progress with saved progress
    When the clock passes midnight
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the failure for "2026-11-04" is stamped 11:59:59 of that day
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"
    And the daily deal differs from before

  Scenario: A daily that was never started is not failed at midnight
    Given the date is "2026-11-04" at "23:59"
    When I note the foundation start
    And the clock passes midnight
    Then the table shows a fresh deal for "2026-11-05"
    And the day "2026-11-04" has no record
    And no bad luck toast is shown

  Scenario: A restarted daily still counts as started
    Given the date is "2026-11-04" at "23:59"
    And I leave the daily in progress with saved progress
    When I restart the daily
    And the clock passes midnight
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the table shows a fresh deal for "2026-11-05"

  Scenario: Pressing restart on an untouched daily does not start it
    Given the date is "2026-11-04" at "23:59"
    When I restart the daily
    And the clock passes midnight
    Then the table shows a fresh deal for "2026-11-05"
    And the day "2026-11-04" has no record
    And no bad luck toast is shown

  Scenario: A started daily still fails at midnight while playing practice
    Given the date is "2026-11-04" at "23:59"
    And I leave the daily in progress with saved progress
    When I switch to practice
    And the clock passes midnight
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"

  Scenario: Replaying a solved day past midnight keeps it solved with no bad luck
    Given the date is "2026-11-04" at "23:59"
    And I have solved the open daily
    When I replay the solved daily with a move
    And the clock passes midnight
    Then the table shows a fresh deal for "2026-11-05"
    And the day "2026-11-04" is recorded as solved
    And the stale progress is cleared
    And no bad luck toast is shown

  # Rule 4: the app comes back on a later day.

  Scenario: A suspended daily is killed when the app resumes on a later day
    Given the date is "2026-11-04" at "20:00"
    And I leave the daily in progress with saved progress
    When the device was suspended until "2026-11-06" at "08:00"
    And Capacitor resumes the app
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the failure for "2026-11-04" is stamped 11:59:59 of that day
    And the day "2026-11-05" has no record
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-06"

  Scenario: A suspended daily is killed when the page becomes visible on a later day
    Given the date is "2026-11-04" at "20:00"
    And I leave the daily in progress with saved progress
    When the device was suspended until "2026-11-05" at "07:00"
    And the page becomes visible
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"

  Scenario: A move after midnight cannot land on the dead daily
    Given the date is "2026-11-04" at "23:59"
    And I leave the daily in progress with saved progress
    When the device was suspended until "2026-11-05" at "00:00"
    And I try a move on the table
    Then the move did not land
    When the page becomes visible
    Then the day "2026-11-04" is recorded as failed
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"

  Scenario: Restarting after midnight cannot erase the dead daily
    Given the date is "2026-11-04" at "23:59"
    And I leave the daily in progress with saved progress
    When the device was suspended until "2026-11-05" at "00:00"
    And I press restart
    And the page becomes visible
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"

  Scenario: Opening the archive after midnight cannot resume the dead daily
    Given the date is "2026-11-04" at "23:59"
    And I leave the daily in progress with saved progress
    When the device was suspended until "2026-11-05" at "00:00"
    And I open the archive day "2026-11-04"
    Then the table shows a fresh deal for "2026-11-04"
    When the page becomes visible
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-05"

  Scenario: A suspended daily is killed on a later relaunch
    Given the date is "2026-11-04" at "20:00"
    And I launch OL FreeCell at the root
    And I leave the daily in progress with saved progress
    When the date becomes "2026-11-06" at "08:00"
    And I reload the app
    Then a bad luck toast is shown
    And the day "2026-11-04" is recorded as failed
    And the day "2026-11-05" has no record
    And the stale progress is cleared
    And the table shows a fresh deal for "2026-11-06"
    And the daily deal differs from before

  Scenario: A killed daily is never resumed from the archive
    Given the date is "2026-11-04" at "20:00"
    And I leave the daily in progress with saved progress
    When the date becomes "2026-11-05" at "08:00"
    And I reload the app
    And I open the archive day "2026-11-04"
    Then the table shows a fresh deal for "2026-11-04"
    And the day "2026-11-04" is recorded as failed

  Scenario: Solving an expired day from the archive leaves the failure in place
    Given the date is "2026-11-04" at "20:00"
    And I leave the daily in progress with saved progress
    When the date becomes "2026-11-05" at "08:00"
    And I reload the app
    And I open the archive day "2026-11-04"
    And I have solved the open daily
    Then the day "2026-11-04" is recorded as failed

  Scenario: A solved day is never overwritten by expiry
    Given the date is "2026-11-04" at "10:00"
    And I launch OL FreeCell at the root
    When I have a solved record for "2026-11-04" with unfinished progress
    And the date becomes "2026-11-05" at "08:00"
    And I reload the app
    Then the table shows a fresh deal for "2026-11-05"
    And the day "2026-11-04" is recorded as solved
    And the stale progress is cleared
    And no bad luck toast is shown

  Scenario: A day that was never started is not failed by a later relaunch
    Given the date is "2026-11-04" at "20:00"
    When the date becomes "2026-11-06" at "08:00"
    And I reload the app
    Then the table shows a fresh deal for "2026-11-06"
    And the day "2026-11-04" has no record
    And no bad luck toast is shown

  # Archive games replay a past day. They never count as a started daily.

  Scenario: Abandoning an archive game does not fail that past day
    Given the date is "2026-11-04" at "09:00"
    When the date becomes "2026-11-06" at "09:00"
    And I reload the app
    And I open the archive day "2026-11-04"
    And I leave the archive game in progress
    And I open today's daily
    Then the table shows a fresh deal for "2026-11-06"
    And the day "2026-11-04" has no record
    And the stale progress is cleared
    And no bad luck toast is shown

  Scenario: An archive save from an older build is discarded without failing its day
    Given the date is "2026-11-06" at "09:00"
    And an old build saved an archive game for "2026-11-04"
    When I reload the app
    Then the table shows a fresh deal for "2026-11-06"
    And the day "2026-11-04" has no record
    And the stale progress is cleared
    And no bad luck toast is shown

  Scenario: An archive game open at midnight does not fail its past day
    Given the date is "2026-11-04" at "09:00"
    When the date becomes "2026-11-06" at "23:59"
    And I reload the app
    And I open the archive day "2026-11-04"
    And I leave the archive game in progress
    And the clock passes midnight
    Then the table shows a fresh deal for "2026-11-07"
    And the day "2026-11-04" has no record
    And no bad luck toast is shown

  Scenario: Getting stuck in an archive game does not fail that past day
    Given the date is "2026-11-04" at "09:00"
    When the date becomes "2026-11-06" at "09:00"
    And I reload the app
    And I open the archive day "2026-11-04"
    And the game on the table gets stuck
    Then the day "2026-11-04" has no record

  Scenario: A missed day can still be solved from the archive
    Given the date is "2026-11-04" at "09:00"
    When the date becomes "2026-11-06" at "09:00"
    And I reload the app
    And I open the archive day "2026-11-04"
    And I have solved the open daily
    Then the day "2026-11-04" is recorded as solved

  # DST: the day ends at wall-clock midnight, not 24 elapsed hours after it began.

  Scenario Outline: A daily fails at wall-clock midnight on a DST change day
    Given the device time zone is "<zone>"
    And the date is "<day>" at "00:05"
    And I leave the daily in progress with saved progress
    When the wall clock reaches "<day>" at "23:30"
    Then the day "<day>" has no record
    And the table is still the daily for "<day>"
    When the clock passes midnight
    Then a bad luck toast is shown
    And the day "<day>" is recorded as failed
    And the failure for "<day>" is stamped 11:59:59 of that day
    And the table shows a fresh deal for "<next>"

    Examples:
      | zone             | day        | next       |
      | Australia/Sydney | 2026-04-05 | 2026-04-06 |
      | Australia/Sydney | 2026-10-04 | 2026-10-05 |
      | America/New_York | 2026-03-08 | 2026-03-09 |
      | America/New_York | 2026-11-01 | 2026-11-02 |
