## MODIFIED Requirements

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
