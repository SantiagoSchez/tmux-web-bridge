# Spec Delta

## Purpose

Defines when the hub switches a machine's Claude account on its own as that account nears its 5-hour or weekly limit, which account it picks, how the owner turns it on and sets its thresholds, and how the hub reports what it did.

## ADDED Requirements

### Requirement: The owner turns the automatic switch on per machine

The panel SHALL offer, in Ajustes › Máquinas, one switch per machine for the automatic account switch, off for every machine until the owner turns it on, and the same for every device. The hub SHALL never switch on its own a machine whose switch is off. A machine removed from the hub SHALL lose its switch.

#### Scenario: A machine with the switch off

- **GIVEN** `linux-box` with the automatic switch off, on account s1 at 99 % of its 5-hour limit, and account s2 spare at 10 %
- **WHEN** the hub reads s1's usage
- **THEN** `linux-box` stays on s1

#### Scenario: Turning it on from another device

- **GIVEN** the owner turns on the automatic switch of `linux-box` from the phone
- **WHEN** the panel is opened on the computer
- **THEN** Ajustes › Máquinas shows the switch of `linux-box` on

#### Scenario: A removed machine

- **GIVEN** `linux-box` with the automatic switch on
- **WHEN** the owner removes `linux-box` and later adds a machine with the same id
- **THEN** the new machine's automatic switch is off

### Requirement: Two thresholds, the same for every machine

The hub SHALL keep two thresholds, one for the 5-hour limit and one for the weekly limit, each a whole percentage from 1 to 100, 90 and 95 by default, editable in Ajustes › Máquinas and the same for every machine and device. A value outside that range or that is not a whole number SHALL be refused, keeping the previous one.

#### Scenario: Default thresholds

- **GIVEN** a hub where the owner never changed the thresholds
- **WHEN** the owner opens Ajustes › Máquinas
- **THEN** it shows 90 % for the 5-hour limit and 95 % for the weekly one

#### Scenario: A threshold out of range

- **GIVEN** the 5-hour threshold at 90 %
- **WHEN** the panel sends 150, 0 or a value that is not a whole number for it
- **THEN** the hub keeps 90 %

#### Scenario: The thresholds survive a restart

- **GIVEN** the owner set the weekly threshold to 80 %
- **WHEN** the hub restarts
- **THEN** the weekly threshold is still 80 %

### Requirement: A machine over a threshold switches to an account with margin

When a machine with the automatic switch on is on an account whose 5-hour or weekly usage reaches its threshold, the hub SHALL switch it, as the panel does and without restarting its Claude Codes, to an account it holds a spare login of whose usage is below both thresholds. Among those, it SHALL prefer one no other machine uses and, then, the one whose higher percentage is lowest.

#### Scenario: Over the 5-hour threshold

- **GIVEN** `linux-box` with the automatic switch on, on s1 at 91 % of its 5-hour limit, with thresholds of 90 % and 95 %
- **AND** s2, with a spare login and used by no machine, at 20 % of its 5-hour limit and 30 % of its weekly one
- **WHEN** the hub reads s1's usage
- **THEN** `linux-box` is switched to s2

#### Scenario: Over the weekly threshold

- **GIVEN** `linux-box` on s1 at 96 % of its weekly limit and 10 % of its 5-hour one, with thresholds of 90 % and 95 %
- **AND** s2 below both thresholds, with a spare login
- **WHEN** the hub reads s1's usage
- **THEN** `linux-box` is switched to s2

#### Scenario: Below both thresholds

- **GIVEN** `linux-box` on s1 at 89 % of its 5-hour limit and 94 % of its weekly one, with thresholds of 90 % and 95 %
- **WHEN** the hub reads s1's usage
- **THEN** `linux-box` stays on s1

#### Scenario: An account no other machine uses comes first

- **GIVEN** `linux-box` over a threshold
- **AND** s2 at 40 %, used by `mac`, and s3 at 60 %, used by no machine, both below the thresholds and with a spare login
- **WHEN** the hub decides
- **THEN** `linux-box` is switched to s3

#### Scenario: The least used one among the free ones

- **GIVEN** `linux-box` over a threshold
- **AND** s2 at 50 % and s3 at 30 %, both used by no machine, below the thresholds and with a spare login
- **WHEN** the hub decides
- **THEN** `linux-box` is switched to s3

#### Scenario: An account used by another machine when no free one is left

- **GIVEN** `linux-box` over a threshold
- **AND** s2 at 40 %, used by `mac`, the only account below the thresholds with a spare login
- **WHEN** the hub decides
- **THEN** `linux-box` is switched to s2

#### Scenario: An account without a spare login

- **GIVEN** `linux-box` over a threshold, and s2 below both thresholds but with no spare login in the hub
- **WHEN** the hub decides
- **THEN** s2 is not a target

### Requirement: The usage the decision uses

The hub SHALL take an account's usage from the freshest reading it trusts: its own reading of the account, or a statusline reading published under the account's email that it does not treat as foreign. A window whose reset has passed SHALL count as 0 %. An account with no reading, whose usage could not be read last time, or that needs a new login SHALL NOT be a target, and a machine whose own account has no reading SHALL NOT be switched. The weekly limits of a single model SHALL NOT count.

#### Scenario: A fresher statusline reading

- **GIVEN** the hub read s1 at 85 % of its 5-hour limit four minutes ago
- **AND** a statusline on `linux-box` published under s1's email, a minute ago, a reading of 92 % with the same resets
- **WHEN** the hub decides
- **THEN** it takes s1 at 92 %, over the 90 % threshold

#### Scenario: A foreign statusline reading

- **GIVEN** the hub read s1 at 50 %
- **AND** a statusline published under s1's email a reading of 97 % that the hub treats as foreign
- **WHEN** the hub decides
- **THEN** it takes s1 at 50 %, and does not switch the machine

#### Scenario: A window that already reset

- **GIVEN** the hub's last reading of s2 says 100 % of its 5-hour limit, with a reset that has passed
- **WHEN** the hub decides whether s2 is a target
- **THEN** it counts s2's 5-hour usage as 0 %

#### Scenario: An account whose usage could not be read

- **GIVEN** s2 with a spare login, whose usage the hub could not read last time
- **WHEN** a machine needs a target
- **THEN** s2 is not a target

#### Scenario: A model's weekly limit

- **GIVEN** `linux-box` on s1 with the weekly limit of one model at 100 % and both general limits below the thresholds
- **WHEN** the hub reads s1's usage
- **THEN** `linux-box` stays on s1

### Requirement: With no account below the thresholds, only a clearly less used one

When a machine is over a threshold and no target is below both thresholds, the hub SHALL switch it to the account with a spare login whose usage is lowest, only if that usage is at least 10 points below the current account's. An account's usage is the higher of its two percentages.

#### Scenario: Too little difference

- **GIVEN** `linux-box` on s1 at 97 % of its 5-hour limit, and s2, with a spare login, at 92 % of its 5-hour limit, with a 5-hour threshold of 90 %
- **WHEN** the hub decides
- **THEN** `linux-box` stays on s1

#### Scenario: Enough difference

- **GIVEN** `linux-box` on s1 at 100 % of its 5-hour limit, and s2, with a spare login, at 90 % of its 5-hour limit and 50 % of its weekly one, with a 5-hour threshold of 90 %
- **WHEN** the hub decides
- **THEN** `linux-box` is switched to s2

### Requirement: A switch to an account over a threshold is not followed by a warning

After the hub switches a machine to an account that is itself over a threshold, it SHALL NOT warn that the machine has no target while that account stays in the same window of the limit it passed: the switch's own report already says where the machine went.

#### Scenario: Right after a switch to an account over a threshold

- **GIVEN** `linux-box` was switched from s1, at 100 %, to s2, at 90 % of its 5-hour limit, with a 5-hour threshold of 90 % and no other account
- **WHEN** the hub decides again within s2's 5-hour window
- **THEN** «Actividad» shows only the switch, with no warning that `linux-box` has no target

#### Scenario: The next window

- **GIVEN** the same switch, and s2's 5-hour window then resets
- **WHEN** in the next window s2 passes the threshold again with no target
- **THEN** the hub warns that `linux-box` has no target

### Requirement: No target leaves one warning per window

When a machine is over a threshold and has no target, the hub SHALL leave it on its account and warn once, in «Actividad» and with a push notification, naming the machine, its account and the limit it passed. It SHALL NOT warn again for that machine and limit until the limit's window resets. Readings of one window whose resets differ by less than the step of Anthropic's reset grid (10 minutes for 5 hours, 1 hour for 7 days) are of the same window.

#### Scenario: Several readings in the same window

- **GIVEN** `linux-box` over its 5-hour threshold with no target
- **WHEN** the hub reads the usage again every 5 minutes for an hour, within the same window
- **THEN** «Actividad» shows a single warning, and a single push notification was sent

#### Scenario: A new window

- **GIVEN** the hub warned that `linux-box` had no target for its 5-hour limit
- **WHEN** that window resets and, in the next one, `linux-box` passes the threshold again with no target
- **THEN** the hub warns again

#### Scenario: The hub's reading and a statusline's of the same window

- **GIVEN** `linux-box` over its 5-hour threshold with no target
- **AND** the hub's reading of its account and a statusline's give resets one second apart, and each is in turn the freshest
- **WHEN** the hub decides after each of them
- **THEN** «Actividad» shows a single warning

#### Scenario: Both limits passed

- **GIVEN** `linux-box` over its weekly threshold with no target
- **WHEN** its 5-hour usage crosses its threshold up and down several times within the same windows
- **THEN** «Actividad» shows at most one warning for the 5-hour limit and one for the weekly limit

#### Scenario: Another account in the same window

- **GIVEN** the hub warned that `linux-box` had no target on s1 for its 5-hour limit
- **WHEN** `linux-box` is later on s2, whose 5-hour window resets at the same time, and s2 passes the threshold with no target
- **THEN** the hub warns about s2

### Requirement: No going back and forth

The hub SHALL NOT pick, as the target of a machine, an account that machine left in an automatic switch while that account's usage stays over a threshold. It SHALL NOT switch a machine back to the account it left on its own.

#### Scenario: The account just left is still over a threshold

- **GIVEN** `linux-box` was switched automatically from s1, at 100 %, to s2
- **WHEN** s2 passes a threshold while s1 is still over one, with s1 at least 10 points below s2
- **THEN** s1 is not a target for `linux-box`

#### Scenario: The account left resets

- **GIVEN** `linux-box` was switched automatically from s1 to s2, and s1's window then reset
- **WHEN** s2 is still below both thresholds
- **THEN** `linux-box` stays on s2

### Requirement: Machines on the same account are decided one after the other

When several machines on the same account pass a threshold, the hub SHALL decide and switch them one at a time, each decision seeing the accounts as the previous switch left them.

#### Scenario: Two machines and one spare login

- **GIVEN** `linux-box` and `mac`, both with the automatic switch on, on s1 over a threshold
- **AND** s2 below both thresholds with a single spare login, and no other target
- **WHEN** the hub decides
- **THEN** one of the two machines is switched to s2, and the other is decided with s2 in use and without a spare login

### Requirement: Each automatic switch is reported

Each automatic switch SHALL leave an entry in «Actividad» and send a push notification, both naming the machine, the account it left, the account it went to and the limit that was passed with its percentage. The push SHALL go through the quiet hours like every other push.

#### Scenario: A switch

- **GIVEN** `linux-box` on s1 at 91 % of its 5-hour limit
- **WHEN** the hub switches it to s2
- **THEN** «Actividad» shows that `linux-box` went from s1 to s2 because of the 5-hour limit at 91 %
- **AND** a push notification says the same

#### Scenario: Within the quiet hours

- **GIVEN** the quiet hours are on and it is inside them
- **WHEN** the hub switches `linux-box` automatically
- **THEN** «Actividad» shows the switch, and no push notification is sent

### Requirement: A failed automatic switch is reported once

When an automatic switch fails (the machine is not connected, the spare login no longer works, the machine refuses the write), the machine SHALL keep what it had and the hub SHALL report it, with its reason, in «Actividad» and with a push notification. It SHALL NOT report again a failure with the same reason in the same window of the same limit. A change of the machine's account, by any route, forgets what was reported.

#### Scenario: A machine not connected

- **GIVEN** `linux-box` over a threshold, not connected, with a target available
- **WHEN** the hub decides several times
- **THEN** `linux-box` keeps its account, and «Actividad» shows a single failure with the reason

#### Scenario: It works on a later try

- **GIVEN** the hub reported a failed automatic switch of `linux-box`
- **WHEN** `linux-box` connects again and the next decision switches it
- **THEN** «Actividad» shows the switch

#### Scenario: A failure with another reason

- **GIVEN** the hub reported that `linux-box` was not connected
- **WHEN** it connects and the switch then fails because the machine refuses the write
- **THEN** «Actividad» shows that second failure too

#### Scenario: The owner switches the machine by hand

- **GIVEN** the hub reported a failed switch of `linux-box` from s1
- **WHEN** the owner moves it by hand to s3 and back to s1, and the automatic switch fails again for the same reason in the same window
- **THEN** «Actividad» shows that failure again

### Requirement: A failed switch is tried again after 5 minutes

The hub SHALL try a switch of a machine that failed again no sooner than 5 minutes after the failure, however often the usage, the accounts or the machines change meanwhile, unless the machine's own account changes, which allows a new try at once.

#### Scenario: A switch that keeps failing

- **GIVEN** `linux-box` over a threshold, connected, whose switch to s2 fails every time
- **WHEN** the usage and the machine change several times in a minute
- **THEN** the hub tried the switch once in that minute, and «Actividad» shows a single failure
- **AND** after 5 minutes the next decision tries it again, without a second report

#### Scenario: The owner moves the machine by hand during the wait

- **GIVEN** a failed switch of `linux-box` from s1, less than 5 minutes ago
- **WHEN** the owner moves it by hand to s3 and back to s1
- **THEN** the next decision tries the switch at once
