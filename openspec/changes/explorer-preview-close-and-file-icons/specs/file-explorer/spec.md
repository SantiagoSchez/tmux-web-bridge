# Spec Delta

## ADDED Requirements

### Requirement: The preview closes

The explorer's preview SHALL have a close button next to «Abrir». Pressing it, or tapping the selected file again, SHALL deselect the file and close the preview, and the list SHALL then take the whole explorer, as before any file was selected.

#### Scenario: Closing with the button

- **GIVEN** the explorer on a phone, showing `~/videos` with `INDICE.md` selected and its preview below the list
- **WHEN** the user taps the preview's close button
- **THEN** the preview closes, no file is selected and the list fills the explorer

#### Scenario: Tapping the selected file again

- **GIVEN** the explorer on a wide screen with `shot.png` selected and its preview to the right of the list
- **WHEN** the user clicks `shot.png` again
- **THEN** the preview closes and no file is selected

#### Scenario: Tapping another file

- **GIVEN** the explorer with `shot.png` selected
- **WHEN** the user taps `INDICE.md`
- **THEN** `INDICE.md` is selected and the preview shows it

### Requirement: Each file shows its type's icon

Each file in the explorer's list SHALL show an icon of its type, decided by its name's extension, ignoring letter case: image, video, audio, PDF, Markdown, code, archive, or a generic file for any other name. The icons SHALL be line drawings in the style of the panel's other icons. Folders SHALL keep their folder icon.

#### Scenario: A folder of mixed files

- **GIVEN** a folder holding `captura.PNG`, `actual.mp4`, `nota.m4a`, `factura.pdf`, `INDICE.md`, `app.ts`, `backup.tar.gz` and `notas.txt`
- **WHEN** the explorer shows it
- **THEN** each file shows, in that order, the icon of an image, a video, an audio, a PDF, Markdown, code, an archive and a generic file

#### Scenario: A file with no extension

- **GIVEN** a folder holding `LICENSE`
- **WHEN** the explorer shows it
- **THEN** `LICENSE` shows the generic file icon

## MODIFIED Requirements

### Requirement: The explorer goes back one screen at a time

The explorer SHALL be a screen of the file viewer's stack: every way of closing the sheet on top closes only that screen, as the file viewer's other screens do. While the explorer shows a preview, the phone's back button and Escape SHALL close the preview first, and the next press SHALL close the screen; a tap outside the sheet, dragging it down and its «Atrás» SHALL still close the whole screen.

#### Scenario: Back from a file opened in the explorer

- **GIVEN** a file opened with «Abrir» from the explorer opened from the window header
- **WHEN** the user presses the phone's back button three times
- **THEN** the first press shows the explorer with the file's preview, the second closes the preview, and the third closes the viewer

#### Scenario: Escape with a preview open

- **GIVEN** the explorer opened from the window header, with `INDICE.md` selected and its preview shown
- **WHEN** the user presses Escape twice
- **THEN** the first press closes the preview and leaves the explorer open, and the second closes the viewer

#### Scenario: A tap outside with a preview open

- **GIVEN** the explorer on a wide screen, opened from the window header, with `INDICE.md` selected and its preview shown
- **WHEN** the user taps outside the explorer's sheet
- **THEN** the viewer closes

### Requirement: The folder pickers browse with the explorer

Ajustes › Carpetas and «Nueva carpeta» SHALL browse the machine with the file explorer, files and preview included. Their confirming button SHALL use the folder the explorer shows, never a selected file. «Abrir» in a picker's preview SHALL open the file in the file viewer over the picker, and closing the viewer SHALL show the picker as it was. While a picker's explorer shows a preview, the phone's back button and Escape SHALL close the preview first, and the next press SHALL do what it does with no preview: close «Nueva carpeta», or leave Ajustes › Carpetas.

#### Scenario: Adding a folder in Ajustes › Carpetas

- **GIVEN** Ajustes › Carpetas browsing `~/projects/shop`, with `README.md` selected
- **WHEN** the user taps the button that adds the folder
- **THEN** the folder added is `~/projects/shop`

#### Scenario: Files in «Nueva carpeta»

- **GIVEN** «Nueva carpeta» browsing a folder that holds files
- **WHEN** the user looks at the list and taps one of the files
- **THEN** the files are listed with their sizes and the one tapped is previewed

#### Scenario: Opening a file from a picker

- **GIVEN** «Nueva carpeta» browsing `~/projects` with `notes.md` selected
- **WHEN** the user taps «Abrir» and then closes the file
- **THEN** «Nueva carpeta» shows `~/projects` with `notes.md` selected

#### Scenario: Back in a picker with a preview open

- **GIVEN** «Nueva carpeta» on a phone, browsing `~/projects` with `notes.md` selected and its preview shown
- **WHEN** the user presses the phone's back button twice
- **THEN** the first press closes the preview and leaves «Nueva carpeta» on `~/projects`, and the second closes «Nueva carpeta»
