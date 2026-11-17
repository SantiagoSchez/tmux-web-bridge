# Spec Delta

## Purpose

The panel's file viewer: a file opened from the terminal, the changed files of a window's repository and each file's diff, and how its screens open over one another and close.

## ADDED Requirements

### Requirement: A file's diff opens over the changed files

Tapping a file in «Ficheros cambiados» SHALL open its diff in a sheet of its own over the list, and SHALL leave the list as it was underneath: its files, its filter, its tab, its branch and its scroll position. Going back from the diff SHALL show the list as it was without asking the hub for the changes again and without showing «Cargando…».

#### Scenario: The list keeps its scroll after a diff

- **GIVEN** «Ficheros cambiados» listing 80 files, scrolled down to the 50th
- **WHEN** the user taps that file and then closes its diff
- **THEN** the list shows the 50th file at the same place, without «Cargando…»

#### Scenario: Going back does not reload the list

- **GIVEN** «Ficheros cambiados» open, and a file changed on the machine after the list was read
- **WHEN** the user opens a diff and goes back to the list
- **THEN** the list still shows what it showed before the diff, and the panel sent no new request for the changes

#### Scenario: «Volver a mirar» still refreshes the list

- **GIVEN** the user back on the list after a diff, and a file changed on the machine meanwhile
- **WHEN** the user taps «Volver a mirar»
- **THEN** the list shows the changed file

#### Scenario: The filter is kept

- **GIVEN** «Ficheros cambiados» filtered by «dialog»
- **WHEN** the user opens a diff and goes back
- **THEN** the search box still reads «dialog» and the list shows the same files

### Requirement: A file opens over its diff

«Ver el fichero» in a diff SHALL open the file in a sheet of its own over the diff, and SHALL leave the diff as it was underneath, scroll position included. Going back from the file SHALL show the diff as it was without asking the hub for it again.

#### Scenario: The diff keeps its scroll after the file

- **GIVEN** a diff scrolled down to its third hunk
- **WHEN** the user taps «Ver el fichero» and then closes the file
- **THEN** the diff shows its third hunk at the same place, without «Cargando…»

### Requirement: Closing the sheet on top goes back one screen

Every way of closing the file viewer's sheet on top SHALL close only that sheet and show the one below: its «Atrás», Escape, a tap outside it, dragging it down on the phone and the phone's back button. Closing the only sheet left SHALL close the viewer.

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

### Requirement: Only the sheet on top can be used

While the file viewer shows several sheets, only the one on top SHALL dim the page and take input: the sheets below SHALL add no shade of their own and SHALL NOT be reached by the keyboard, the pointer or a screen reader until they are on top again.

#### Scenario: The keyboard stays in the diff

- **GIVEN** a diff opened from «Ficheros cambiados» on a wide screen
- **WHEN** the user moves the focus with Tab
- **THEN** the focus never reaches the search box or the files of the list below

#### Scenario: The page is dimmed once

- **GIVEN** a file opened from a diff opened from «Ficheros cambiados»
- **WHEN** the user looks at the page behind the sheets
- **THEN** it is as dimmed as behind a single sheet
