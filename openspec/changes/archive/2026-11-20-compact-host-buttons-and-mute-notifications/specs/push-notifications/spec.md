# Spec Delta

## ADDED Requirements

### Requirement: The owner can mute push notifications for a while

The panel's top bar SHALL have a button that mutes push notifications for 1, 2, 3 or 5 hours, or until further notice, chosen from a menu. The hub SHALL keep the mute, measured on its own clock, and apply it to every device. While a mute lasts, the hub SHALL send no push notification. A mute with an end SHALL stop applying at that time without any action.

#### Scenario: Muting for two hours

- **GIVEN** push notifications are not muted
- **WHEN** the owner chooses to mute them for 2 hours at 15:00
- **AND** Claude Code finishes its turn in a pane at 16:30, reported as not seen
- **THEN** the hub sends no push notification
- **AND** the pane's window shows ✅

#### Scenario: The mute ends on its own

- **GIVEN** the owner muted push notifications for 1 hour at 15:00
- **WHEN** Claude Code asks a question in a pane at 16:00, reported as not seen
- **THEN** the hub sends the push notification

#### Scenario: Muting until further notice

- **GIVEN** the owner muted push notifications until further notice
- **WHEN** Claude Code asks for permission in a pane two days later, reported as not seen
- **THEN** the hub sends no push notification

#### Scenario: Muting from one device mutes every device

- **GIVEN** the panel is open on a phone and on a computer
- **WHEN** the owner mutes push notifications from the phone
- **THEN** the computer's top bar shows them as muted
- **AND** no subscribed device receives a push notification while the mute lasts

### Requirement: The mute button says until when and unmutes with one tap

While push notifications are muted, the top bar's button SHALL look muted and say until when the mute lasts (a time, or that it lasts until further notice). A tap on it SHALL end the mute at once, on every device. When a mute ends on its own, the button SHALL stop looking muted without reloading the panel.

#### Scenario: Unmuting before the end

- **GIVEN** the owner muted push notifications for 5 hours at 15:00
- **WHEN** the owner taps the mute button at 16:00
- **AND** Claude Code finishes its turn in a pane at 16:05, reported as not seen
- **THEN** the hub sends the push notification
- **AND** the button no longer looks muted on any device

#### Scenario: The button when the mute ends

- **GIVEN** the owner muted push notifications for 1 hour at 15:00 and the panel stays open
- **WHEN** it is 16:00
- **THEN** the button no longer looks muted

#### Scenario: Until when

- **GIVEN** the owner muted push notifications for 3 hours at 15:00
- **WHEN** the owner looks at the mute button
- **THEN** it says the notifications are muted until 18:00

### Requirement: The mute covers every push except the test

The mute SHALL silence the same push notifications as the quiet schedule: Claude Code's question, attention and finished-turn notices, and the notice that an automation or a scheduled message could not launch. The test notification sent from «Enviar prueba» SHALL always be sent. Muting does not change pane marks, the pending list or the activity list.

#### Scenario: An automation fails while muted

- **GIVEN** push notifications are muted
- **WHEN** an automation cannot launch because its machine is not connected
- **THEN** the hub sends no push notification
- **AND** the activity list shows the automation's error

#### Scenario: The test notification while muted

- **GIVEN** push notifications are muted
- **WHEN** the owner presses «Enviar prueba» on a subscribed device
- **THEN** the hub sends the test notification to that device

## MODIFIED Requirements

### Requirement: A notice the hub holds back leaves a log line

When the hub receives a notice from a machine and sends no push notification for it, it SHALL write one `[push]` log line that names the notice and the reason in Spanish: the machine is not one of the hub's machines, the machine reported it as seen, the pane is open in the web app, the web app is on screen at the device where the owner is working, the notifications are muted, or it is inside the quiet schedule. When the notifications are muted inside the quiet schedule, the line SHALL say they are muted.

#### Scenario: The machine reports the notice as seen

- **GIVEN** a machine reports a finished turn as seen
- **WHEN** the hub receives the notice
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line saying it was not sent because it was already seen at the terminal

#### Scenario: The pane is open in the web app

- **GIVEN** the pane is open in a visible tab of the web app
- **WHEN** the hub receives a notice for that pane reported as not seen
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming the pane's window and saying it is open in the web app

#### Scenario: The notice comes from a machine the hub does not have

- **GIVEN** a machine whose id is not among the hub's machines (renamed or removed from the panel) still has the notify token
- **WHEN** the hub receives a notice from it
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming that machine id and saying it is not one of the panel's machines

#### Scenario: The notice arrives inside the quiet schedule

- **GIVEN** the quiet schedule is on and it is inside its window
- **WHEN** the hub receives a notice for a pane reported as not seen and not open in the web app
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming the pane's window and saying it is inside the quiet schedule

#### Scenario: The notice arrives while muted

- **GIVEN** push notifications are muted
- **WHEN** the hub receives a notice for a pane reported as not seen and not open in the web app
- **THEN** the hub sends no push notification
- **AND** its log has a `[push]` line naming the pane's window and saying the notifications are muted

#### Scenario: Muted inside the quiet schedule

- **GIVEN** the quiet schedule is on and it is inside its window
- **AND** push notifications are muted
- **WHEN** the hub receives a notice for a pane reported as not seen and not open in the web app
- **THEN** its log has a `[push]` line saying the notifications are muted
