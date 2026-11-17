# Spec Delta

## Purpose

Defines when the hub sends a push notification for a pane's question, permission request or finished Claude Code turn, and when it holds one back because the owner is already looking at that pane.

## ADDED Requirements

### Requirement: Only a terminal showing the pane counts as looking at it

A machine SHALL report a notice as already seen only when a terminal attached to its tmux, other than the panel's web terminal, currently shows the notifying pane and the owner is in front of it: on macOS, Ghostty is visible; elsewhere, that terminal had input in the last 120 seconds. The web terminal never makes a notice count as seen; whether the web app shows the pane is the hub's decision.

#### Scenario: The web terminal is still connected after the owner locks the phone

- **GIVEN** a pane of a Linux machine is open only in the panel's web terminal
- **AND** the owner typed in it 60 seconds ago and then locked the phone
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as not seen
- **AND** the hub sends the push notification

#### Scenario: A terminal on the machine shows the pane and was just used

- **GIVEN** a terminal attached to a Linux machine's tmux shows the pane
- **AND** it had input 30 seconds ago
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as seen
- **AND** the hub sends no push notification

#### Scenario: A terminal on the machine shows another pane

- **GIVEN** a terminal attached to a Linux machine's tmux, with input 30 seconds ago, shows another window of the same session
- **WHEN** Claude Code finishes its turn in the pane
- **THEN** the machine reports the notice as not seen

#### Scenario: A terminal shows the pane but has been idle

- **GIVEN** a terminal attached to a Linux machine's tmux shows the pane
- **AND** its last input was 150 seconds ago
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the machine reports the notice as not seen

### Requirement: A finished pane keeps its mark unless a terminal shows it

When Claude Code finishes its turn in a pane, the pane SHALL show the finished mark (✅) unless a terminal attached to the machine's tmux, other than the panel's web terminal, currently shows that pane; in that case it shows the idle Claude mark (🤖).

#### Scenario: Finished while only the web terminal shows the pane

- **GIVEN** a pane is open only in the panel's web terminal
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the pane's window shows ✅

#### Scenario: Finished while a terminal on the machine shows the pane

- **GIVEN** a terminal attached to the machine's tmux shows the pane
- **WHEN** Claude Code finishes its turn in that pane
- **THEN** the pane's window shows 🤖

### Requirement: A notice the hub holds back leaves a log line

When the hub receives a notice from a machine and sends no push notification for it, it SHALL write one `[push]` log line that names the notice and the reason in Spanish: the machine is not one of the hub's machines, the machine reported it as seen, the pane is open in the web app, or the web app is on screen at the device where the owner is working.

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
