# Spec Delta

## Purpose

Defines the per-account limits the usage strip shows (5 hours, 7 days and per model), where each number comes from (the hub's reading of the account and the readings the machines' statuslines publish), and how the panel guards against a reading published under the wrong account.

## ADDED Requirements

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

#### Scenario: A reading from after the weekly reset

- **GIVEN** the hub read account s2 with a 7-day reset that has already passed
- **AND** a statusline published, under s2's email, a reading with a later 7-day reset
- **WHEN** the panel shows the usage strip
- **THEN** the reading is not treated as foreign

#### Scenario: A reading whose own window has ended

- **GIVEN** a statusline reading under s2's email whose 7-day and 5-hour resets have already passed
- **WHEN** the hub compares it with its reading of s2
- **THEN** the reading is not treated as foreign

#### Scenario: An email two accounts share

- **GIVEN** two accounts the hub keeps share one email
- **WHEN** a statusline publishes a reading under that email
- **THEN** the hub does not compare it, and the panel keeps ignoring statusline readings for both rows

#### Scenario: An account the hub has no reading of

- **GIVEN** the hub has no 5-hour or 7-day reading of the account with the reading's email
- **WHEN** a statusline publishes a reading under that email
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

- **GIVEN** the statusline of `drangleic-claude` published a foreign reading under s2's email
- **WHEN** the user looks at s2's row
- **THEN** the row shows ⚠, its tooltip names `drangleic-claude` and explains the problem
- **AND** s2's menu shows the same explanation

#### Scenario: The warning goes away when the reading is corrected

- **GIVEN** s2's row warns about a foreign reading from `drangleic-claude`
- **WHEN** a Claude on `drangleic-claude` publishes, under s2's email, a reading that matches the hub's reading of s2
- **THEN** the warning disappears from s2's row and menu

#### Scenario: The warning lasts as long as the reading

- **GIVEN** s2's row warns about a foreign reading from `drangleic-claude`
- **AND** no Claude on that machine publishes again under s2's email
- **WHEN** hours pass while the reading's windows are still current
- **THEN** the warning stays
