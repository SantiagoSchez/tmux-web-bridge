# dictation-button Specification

## Purpose

What the 🎤 button of a window shows while a dictation is in progress, so the owner knows that it is listening, for how long, and that the hub is working on what was said.

## Requirements

### Requirement: Recording clock

While a dictation records, the 🎤 button SHALL be red and show `●` followed by the time since the recording started, as minutes and two-digit seconds, and the time SHALL advance every second until the recording stops. This SHALL hold in both modes of the button: hold to talk and tap to start.

#### Scenario: Hold mode clock advances

- **GIVEN** the dictation button in hold mode
- **WHEN** the owner holds it and talks for three seconds
- **THEN** the button shows `● 0:00`, then `● 0:01`, `● 0:02` and `● 0:03` as each second passes

#### Scenario: Tap mode clock advances

- **GIVEN** the dictation button in tap mode
- **WHEN** the owner taps it and talks for three seconds
- **THEN** the button shows `● 0:03` after three seconds

#### Scenario: Recording started with the shortcut

- **GIVEN** the dictation button in hold mode
- **WHEN** the owner starts a dictation with the dictation shortcut and talks for two seconds
- **THEN** the button shows `● 0:02`

### Requirement: Transcribing indicator

From the moment a recording is sent until the text arrives or the dictation fails, the 🎤 button SHALL show a spinning ring in place of its label, on the button's normal background, and SHALL not take a tap. When the dictation ends, the button SHALL show its idle label again: 🎤, or the label the key bar sets for it. A discarded recording SHALL not show the ring.

#### Scenario: Ring while the hub transcribes

- **GIVEN** a dictation recording
- **WHEN** the owner releases the button (hold mode) or taps it (tap mode)
- **THEN** the button shows a spinning ring on its normal background, not red, and a tap on it does nothing

#### Scenario: Back to the label when the text arrives

- **GIVEN** the button showing the ring
- **WHEN** the hub returns the text and it is typed into the pane
- **THEN** the button shows 🎤 again, or the key bar's label for it

#### Scenario: Back to the label when the dictation fails

- **GIVEN** the button showing the ring
- **WHEN** the hub answers with an error
- **THEN** the error is shown and the button shows its idle label again

#### Scenario: Discarded recording

- **GIVEN** a dictation recording
- **WHEN** the owner discards it (sliding off the button, «✕» or Escape)
- **THEN** the button shows its idle label without showing the ring
