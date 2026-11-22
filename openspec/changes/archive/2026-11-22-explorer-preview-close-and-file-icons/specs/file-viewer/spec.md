# Spec Delta

## ADDED Requirements

### Requirement: A changed file shows its type's icon

Each row of «Ficheros cambiados» SHALL show the icon of its file's type, the same the file explorer shows for that name, between the git status letter and the file's name.

#### Scenario: A modified source file and a new image

- **GIVEN** a repository whose changes are `src/app.ts` modified and `docs/captura.png` new
- **WHEN** «Ficheros cambiados» lists them
- **THEN** the row of `app.ts` shows «M», then the code icon, then `app.ts`
- **AND** the row of `captura.png` shows «N», then the image icon, then `captura.png`

## MODIFIED Requirements

### Requirement: Closing the sheet on top goes back one screen

Every way of closing the file viewer's sheet on top SHALL close only that sheet and show the one below: its «Atrás», Escape, a tap outside it, dragging it down on the phone and the phone's back button. Closing the only sheet left SHALL close the viewer. The one exception is an explorer screen with a file's preview open: there the phone's back button and Escape SHALL close the preview first, as the file explorer's requirements say.

#### Scenario: Escape on a diff goes back to the list

- **GIVEN** a diff opened from «Ficheros cambiados»
- **WHEN** the user presses Escape
- **THEN** the diff closes and «Ficheros cambiados» stays open

#### Scenario: A tap outside a diff goes back to the list

- **GIVEN** a diff opened from «Ficheros cambiados» on a wide screen
- **WHEN** the user taps outside the diff's sheet
- **THEN** the diff closes and «Ficheros cambiados» stays open

#### Scenario: Dragging a diff down goes back to the list

- **GIVEN** a diff opened from «Ficheros cambiados» on the phone
- **WHEN** the user drags the diff down by its top far enough to close it
- **THEN** the diff closes and «Ficheros cambiados» stays open

#### Scenario: A drag closes one screen only

- **GIVEN** a diff opened from «Ficheros cambiados» on the phone, dragged down far enough to close it
- **WHEN** the user taps the list or presses Escape while the diff is still sliding away
- **THEN** only the diff closes and «Ficheros cambiados» stays open

#### Scenario: The phone's back button goes back one screen at a time

- **GIVEN** a file opened from a diff opened from «Ficheros cambiados»
- **WHEN** the user presses the phone's back button three times
- **THEN** the first press shows the diff, the second the list, and the third closes the viewer

#### Scenario: Closing the last sheet closes the viewer

- **GIVEN** «Ficheros cambiados» open with no diff over it
- **WHEN** the user presses Escape
- **THEN** the viewer closes

#### Scenario: Escape on an explorer with a preview

- **GIVEN** the explorer open in the viewer with a file's preview shown
- **WHEN** the user presses Escape
- **THEN** the preview closes and the explorer stays open
