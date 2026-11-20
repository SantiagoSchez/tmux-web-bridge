# Spec Delta

## ADDED Requirements

### Requirement: The account's row shows its spare logins

Each account's row in the limits strip SHALL show how many spare logins the hub keeps of it, the logins no machine is using, as a number after the account's name and plan, and the row's tooltip SHALL say it in words («1 sesión libre», «2 sesiones libres»). An account with no spare login SHALL show no number and no such text.

#### Scenario: An account with two spare logins

- **GIVEN** the hub keeps three logins of account s2, one in use on a machine and two spare
- **WHEN** the panel shows the limits strip
- **THEN** s2's row shows `·2` after its name and plan, and its tooltip includes «2 sesiones libres»

#### Scenario: An account with one spare login

- **GIVEN** the hub keeps one spare login of account s3
- **WHEN** the panel shows the limits strip
- **THEN** s3's row shows `·1`, and its tooltip includes «1 sesión libre»

#### Scenario: An account whose only login is in use

- **GIVEN** the hub keeps one login of account s1, in use on a machine
- **WHEN** the panel shows the limits strip
- **THEN** s1's row shows no number after its name and plan, and its tooltip says nothing about spare logins

#### Scenario: The count follows the hub

- **GIVEN** s2's row shows `·1`
- **WHEN** a machine switches to s2 and takes that spare login
- **THEN** s2's row shows no number, and the row of the account the machine left shows one more

### Requirement: An account's menu adds a login of that account

An account's menu SHALL offer «Añadir una sesión de esta cuenta», which opens the Claude login dialog for that account, naming its email. A login of that account SHALL be kept as one more spare login of it, in the same row. While the account needs a new login, the menu SHALL offer «Iniciar sesión otra vez» in its place. The menu SHALL NOT offer to add another account.

#### Scenario: Adding a second login of a known account

- **GIVEN** the hub knows account s2, with one login in use on a machine and no spare one
- **WHEN** the owner chooses «Añadir una sesión de esta cuenta» in s2's menu and completes the Claude login with s2's email
- **THEN** the panel confirms the login was kept, the strip still has a single row for s2, and that row shows `·1`

#### Scenario: Logging in with another account from that dialog

- **GIVEN** the login dialog opened from s2's menu
- **WHEN** the owner completes the Claude login with account s3
- **THEN** the login is kept under s3, no machine changes account, and the panel warns that the login was of s3 and not of s2

#### Scenario: An account that needs a new login

- **GIVEN** the hub has no working login of account s1 and marks it as needing a new one
- **WHEN** the owner opens s1's menu
- **THEN** the menu offers «Iniciar sesión otra vez» and not «Añadir una sesión de esta cuenta»

#### Scenario: No new account from an account's menu

- **GIVEN** the strip shows account s1
- **WHEN** the owner opens s1's menu
- **THEN** the menu has no item to add another account

### Requirement: A new account is added from Ajustes › Máquinas

The «Cambio automático de cuenta» section of Ajustes › Máquinas SHALL have a button «Añadir una cuenta de Claude» that opens the Claude login dialog for no particular account. A login of an account the hub does not know SHALL add that account, with a row of its own in the limits strip; a login of a known account SHALL be kept as one more spare login of it.

#### Scenario: Adding a new account

- **GIVEN** the hub knows accounts s1 and s2
- **WHEN** the owner chooses «Añadir una cuenta de Claude» in Ajustes › Máquinas and completes the Claude login with account s3
- **THEN** the panel says that account s3 was added, the strip shows a row for s3 with `·1`, and no machine changes account

#### Scenario: Logging in with a known account from Ajustes

- **GIVEN** the hub knows account s2, with no spare login
- **WHEN** the owner chooses «Añadir una cuenta de Claude» and completes the Claude login with s2
- **THEN** the panel says that a session of s2 was kept, not that an account was added, the strip still has a single row for s2, and that row shows `·1`

#### Scenario: A row for an account only a statusline knows

- **GIVEN** a machine's statusline publishes the limits of an account the hub keeps no login of
- **WHEN** the owner taps that account's name in the strip
- **THEN** the panel opens the Claude login dialog for no particular account
