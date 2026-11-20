# usage-limits Specification

## Purpose

Defines the per-account limits the usage strip shows (5 hours, 7 days and per model), where each number comes from (the hub's reading of the account and the readings the machines' statuslines publish), and how the panel guards against a reading published under the wrong account.

## Requirements

### Requirement: A statusline reading that contradicts the hub's is not shown

The hub SHALL compare each statusline reading (`RateLimits`) with its own reading (`AccountUsage`) of the one account that has the reading's email. When, for the 5-hour or the 7-day window, both resets are still ahead and they differ by more than 5 minutes, the reading is foreign: the panel never receives it and its row keeps the hub's numbers.

#### Scenario: A reading with another account's weekly reset

- **GIVEN** the hub read account s2 with a 7-day reset on 19/11 12:00, still ahead
- **AND** a machine's statusline published, under s2's email, a reading with a 7-day reset on 23/11 09:00
- **WHEN** the panel shows the usage strip
- **THEN** s2's row shows the 5-hour and 7-day values of the hub's reading, not the statusline's

#### Scenario: A reading with another account's 5-hour reset

- **GIVEN** the hub read account s2 with a 5-hour reset at 13:30, still ahead
- **AND** a statusline published, under s2's email, a reading with the same 7-day reset and a 5-hour reset at 15:40
- **WHEN** the panel shows the usage strip
- **THEN** s2's row shows the hub's reading

#### Scenario: A fresher reading of the same account still wins

- **GIVEN** the hub read account s2 five minutes ago
- **AND** a statusline published, under s2's email, a newer reading whose 5-hour and 7-day resets match the hub's
- **WHEN** the panel shows the usage strip
- **THEN** s2's row shows the statusline's values

#### Scenario: A reading whose own window has ended

- **GIVEN** a statusline reading under s2's email whose 7-day and 5-hour resets have already passed
- **WHEN** the hub compares it with its reading of s2
- **THEN** the reading is not treated as foreign

#### Scenario: An email two accounts share

- **GIVEN** two accounts the hub keeps share one email
- **WHEN** a statusline publishes a reading under that email
- **THEN** the hub does not compare it, and the panel keeps ignoring statusline readings for both rows

#### Scenario: An account the hub has never read

- **GIVEN** the hub has no reading at all of the account with the reading's email
- **WHEN** a statusline publishes a reading under that email
- **THEN** the reading is not treated as foreign

### Requirement: A window that started before the hub saw it closed is not shown

When the hub's reading of the account (`AccountUsage`), taken at time t, has no current window of a kind (none, or one that has already ended), the hub SHALL treat as foreign a statusline reading whose window of that kind started before t, or before the hub's ended window reset, whichever is later. A window starts at its reset minus its length (5 hours or 7 days), give or take one reset step: 10 minutes for 5 hours, 1 hour for 7 days.

#### Scenario: An account not used since its weekly reset

- **GIVEN** the hub read account s2 at 16/11 12:00 and it had no 7-day window
- **AND** a statusline published, under s2's email, a reading whose 7-day window resets on 23/11 09:00, so it started on 16/11 09:00
- **WHEN** the panel shows the usage strip
- **THEN** the reading is treated as foreign and s2's row shows the hub's reading

#### Scenario: A window opened after the hub's reading

- **GIVEN** the hub read account s2 at 09:40 and it had no 5-hour window
- **AND** a statusline published, under s2's email, a reading whose 5-hour window resets at 15:00, so it started at 10:00
- **WHEN** the panel shows the usage strip
- **THEN** the reading is not treated as foreign

#### Scenario: A window that overlaps the hub's ended one

- **GIVEN** the hub read account s2 with a 7-day reset on 19/11 12:00, which has already passed
- **AND** a statusline published, under s2's email, a reading whose 7-day window started on 16/11 09:00
- **WHEN** the panel shows the usage strip
- **THEN** the reading is treated as foreign

#### Scenario: A window that opened between the hub's ended one and its reading

- **GIVEN** the hub read account s2 at 12:00 and its 5-hour window had ended at 10:00
- **AND** a statusline published, under s2's email, a reading whose 5-hour window started at 11:00
- **WHEN** the panel shows the usage strip
- **THEN** the reading is treated as foreign

#### Scenario: A reading of the week after the hub's ended one

- **GIVEN** the hub read account s2 on 19/11 at 11:00, with a 7-day reset on 19/11 12:00, which has already passed
- **AND** a statusline published, under s2's email, a reading whose 7-day window started on 19/11 14:00
- **WHEN** the panel shows the usage strip
- **THEN** the reading is not treated as foreign

### Requirement: A foreign reading does not feed the forecast

The hub SHALL keep foreign statusline readings out of the usage history it uses to forecast when a limit runs out.

#### Scenario: Forecast of an account with a foreign reading

- **GIVEN** a statusline publishes, under s2's email, a reading the hub treats as foreign
- **WHEN** the hub records usage samples
- **THEN** no sample of that reading is stored for s2, and s2's forecast is computed from its own readings only

### Requirement: The account's row warns about a foreign reading

While a machine holds a foreign reading under an account's email, the panel SHALL mark that account's row with ⚠ and name the machine, both in the row's tooltip and in the account's menu, saying that a Claude there published another account's limits under this one and is probably still on the previous account.

#### Scenario: Warning in the row and in the menu

- **GIVEN** the statusline of `bot-box` published a foreign reading under s2's email
- **WHEN** the user looks at s2's row
- **THEN** the row shows ⚠, its tooltip names `bot-box` and explains the problem
- **AND** s2's menu shows the same explanation

#### Scenario: The warning goes away when the reading is corrected

- **GIVEN** s2's row warns about a foreign reading from `bot-box`
- **WHEN** a Claude on `bot-box` publishes, under s2's email, a reading that matches the hub's reading of s2
- **THEN** the warning disappears from s2's row and menu

#### Scenario: The warning lasts as long as the reading

- **GIVEN** s2's row warns about a foreign reading from `bot-box`
- **AND** no Claude on that machine publishes again under s2's email
- **WHEN** hours pass while the reading's windows are still current
- **THEN** the warning stays
