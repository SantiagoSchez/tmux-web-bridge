# Spec Delta

## MODIFIED Requirements

### Requirement: A message that cannot launch says so

When a scheduled message cannot launch (its machine is not connected or no longer in the panel, its folder is gone, the launch fails), the hub SHALL record the error in the message's result, add it to the activity list, and send a push notification saying the scheduled message could not launch, unless the mute or the quiet schedule holds it back.

#### Scenario: The machine is not connected

- **GIVEN** a scheduled message on machine `mac`, which is not connected
- **WHEN** its time arrives
- **THEN** the message's result is an error saying `mac` is not connected
- **AND** the activity list shows the error
- **AND** the hub sends a push notification saying the scheduled message could not launch

#### Scenario: The machine is not connected while muted

- **GIVEN** a scheduled message on machine `mac`, which is not connected
- **AND** push notifications are muted
- **WHEN** its time arrives
- **THEN** the message's result is an error saying `mac` is not connected
- **AND** the activity list shows the error
- **AND** the hub sends no push notification
