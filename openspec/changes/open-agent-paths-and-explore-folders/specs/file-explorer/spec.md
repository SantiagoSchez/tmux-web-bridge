# Spec Delta

## Purpose

Browsing a machine's folders and files from the panel: the file explorer, the preview of the file selected in it, where it opens from, and the folder pickers that browse with it.

## ADDED Requirements

### Requirement: The explorer lists a folder's contents

The file explorer SHALL list the folders and then the files of the folder it shows, each group in name order, ignoring letter case, with each file's size. It SHALL show the folder's whole path, with `~` for the home folder. A folder with more than 2000 folders or more than 2000 files SHALL list the first 2000 of each kind in name order and say how many entries it leaves out.

#### Scenario: Folders first, then files with their size

- **GIVEN** a folder `~/videos` holding the folder `frames`, the file `actual.mp4` of 284 MB and the file `INDICE.md` of 2 KB
- **WHEN** the explorer shows `~/videos`
- **THEN** it lists `frames` first, then `actual.mp4` with «284 MB» and `INDICE.md` with «2 KB»
- **AND** its title shows `~/videos`

#### Scenario: A folder of thousands of frames

- **GIVEN** a folder `~/videos/frames` holding 18 000 files `f00001.png` to `f18000.png`
- **WHEN** the explorer shows it
- **THEN** it lists `f00001.png` to `f02000.png` with their sizes
- **AND** it says 16 000 entries are left out

#### Scenario: Empty folder

- **GIVEN** an empty folder
- **WHEN** the explorer shows it
- **THEN** it says the folder is empty

#### Scenario: Folder that does not exist

- **GIVEN** a path that is no folder of the machine
- **WHEN** the explorer is asked to show it
- **THEN** it shows an error that names the path and the machine

### Requirement: The explorer moves freely across the machine

Tapping a folder in the explorer SHALL show that folder, and «..» SHALL show the folder that contains the one shown, up to `/`. A path typed in the explorer's path field SHALL show that folder.

#### Scenario: Into a folder and back up

- **GIVEN** the explorer showing `~/videos`
- **WHEN** the user taps `frames` and then «..»
- **THEN** it shows `~/videos/frames` and then `~/videos` again

#### Scenario: Above the home folder

- **GIVEN** the explorer showing `~`
- **WHEN** the user taps «..» until it stops offering it
- **THEN** it shows the folders above the home folder one by one, ending at `/`, which has no «..»

#### Scenario: A typed path

- **WHEN** the user types `/var/log` in the path field and confirms it
- **THEN** the explorer shows `/var/log`

### Requirement: The explorer filters and hides hidden entries

The explorer SHALL hide the folders and files whose name starts with `.` until «Mostrar ocultos» is checked. A name filter SHALL keep only the entries whose name holds every word typed, ignoring letter case and accents. Moving to another folder SHALL clear the filter.

#### Scenario: Hidden entries

- **GIVEN** a folder holding `.git`, `.env` and `src`
- **WHEN** the explorer shows it
- **THEN** it lists only `src`
- **AND** after the user checks «Mostrar ocultos» it lists `.git`, `.env` and `src`

#### Scenario: Name filter

- **GIVEN** a folder holding `Cámara.mp4`, `camara-2.mp4` and `notes.md`
- **WHEN** the user types `camara` in the filter
- **THEN** the explorer lists `Cámara.mp4` and `camara-2.mp4`

#### Scenario: The filter is cleared in another folder

- **GIVEN** the explorer filtered by `mp4`
- **WHEN** the user taps a folder
- **THEN** the filter is empty and the new folder's entries are all listed

### Requirement: The selected file shows its preview

Tapping a file in the explorer SHALL select it and show its preview next to the list: to the right of the list when the explorer is at least 720 px wide (the file viewer on a computer), below the list when it is narrower (the phone, and the folder pickers of Ajustes and «Nueva carpeta» on any screen). The preview SHALL show what the file viewer shows for that kind of file, and an «Abrir» button.

#### Scenario: Preview on the phone

- **GIVEN** the explorer on a phone, showing a folder with `INDICE.md`
- **WHEN** the user taps `INDICE.md`
- **THEN** the list stays at the top and the bottom shows `INDICE.md` rendered, with «Abrir»

#### Scenario: Preview on a wide screen

- **GIVEN** the explorer on a wide screen, showing a folder with `shot.png`
- **WHEN** the user clicks `shot.png`
- **THEN** the image shows to the right of the list, with «Abrir»

#### Scenario: Preview in a folder picker on a computer

- **GIVEN** Ajustes › Carpetas on a computer, browsing a folder with `notes.md`
- **WHEN** the user clicks `notes.md`
- **THEN** the preview shows below the list, with «Abrir»

#### Scenario: Another folder clears the preview

- **GIVEN** a file selected in the explorer
- **WHEN** the user taps a folder
- **THEN** the explorer shows the new folder with no file selected and no preview

### Requirement: «Abrir» opens the whole file over the explorer

«Abrir» in the preview SHALL open the selected file in the file viewer, in a sheet over the explorer. Going back from the file SHALL show the explorer as it was: its folder, its filter, its selected file and its scroll position.

#### Scenario: Back to the explorer

- **GIVEN** the explorer in `~/videos`, filtered by `mp4`, with `actual.mp4` selected
- **WHEN** the user taps «Abrir» and then goes back
- **THEN** the explorer shows `~/videos`, filtered by `mp4`, with `actual.mp4` selected and its preview

### Requirement: A folder link opens the explorer in that folder

Tapping a folder link in the terminal SHALL open the explorer in that folder. A relative folder path SHALL be looked up first in the folder of the pane the path is written in, then in the window's other panes' folders, like a relative file path.

#### Scenario: Absolute folder link

- **WHEN** the user taps `~/Downloads/tests/render/` in the terminal
- **THEN** the explorer opens in `~/Downloads/tests/render`

#### Scenario: Relative folder link

- **GIVEN** a pane whose folder is `~/shop` and holds the folder `docs`
- **WHEN** the user taps `docs/` written in that pane
- **THEN** the explorer opens in `~/shop/docs`

#### Scenario: Folder link that does not exist

- **GIVEN** a pane whose folder does not hold `missing/`
- **WHEN** the user taps `missing/` written in that pane
- **THEN** the explorer shows an error saying the folder does not exist

### Requirement: A folder opened as a file shows the explorer

When the file viewer is asked to open a path that is a folder of the machine, it SHALL show the explorer in that folder instead of an error.

#### Scenario: Folder path without a trailing slash

- **GIVEN** a terminal showing `~/Downloads/tests` and that path is a folder
- **WHEN** the user taps it
- **THEN** the explorer opens in `~/Downloads/tests`

### Requirement: Each window opens the explorer in its folder

The header of each window SHALL have a folder button, next to the changed files button, that opens the explorer in the folder of the window's pane. The button SHALL be there whether or not the folder is a git repository.

#### Scenario: Window in a repository

- **GIVEN** a window whose pane's folder is `~/shop`, a git repository
- **WHEN** the user taps the folder button of its header
- **THEN** the explorer opens in `~/shop`

#### Scenario: Window outside a repository

- **GIVEN** a window whose pane's folder is `~/Downloads`, not a git repository
- **THEN** its header shows the folder button and no changed files button

#### Scenario: Split window

- **GIVEN** a window split into a pane in `~/shop` and a selected pane in `~/blog`
- **WHEN** the user taps the folder button
- **THEN** the explorer opens in `~/blog`

### Requirement: The explorer goes back one screen at a time

The explorer SHALL be a screen of the file viewer's stack: every way of closing the sheet on top closes only that screen, as the file viewer's other screens do.

#### Scenario: Back from a file opened in the explorer

- **GIVEN** a file opened with «Abrir» from the explorer opened from the window header
- **WHEN** the user presses the phone's back button twice
- **THEN** the first press shows the explorer and the second closes the viewer

### Requirement: The folder pickers browse with the explorer

Ajustes › Carpetas and «Nueva carpeta» SHALL browse the machine with the file explorer, files and preview included. Their confirming button SHALL use the folder the explorer shows, never a selected file. «Abrir» in a picker's preview SHALL open the file in the file viewer over the picker, and closing the viewer SHALL show the picker as it was.

#### Scenario: Adding a folder in Ajustes › Carpetas

- **GIVEN** Ajustes › Carpetas browsing `~/projects/shop`, with `README.md` selected
- **WHEN** the user taps the button that adds the folder
- **THEN** the folder added is `~/projects/shop`

#### Scenario: Files in «Nueva carpeta»

- **GIVEN** «Nueva carpeta» browsing a folder that holds files
- **THEN** the files are listed with their sizes and can be previewed

#### Scenario: Opening a file from a picker

- **GIVEN** «Nueva carpeta» browsing `~/projects` with `notes.md` selected
- **WHEN** the user taps «Abrir» and then closes the file
- **THEN** «Nueva carpeta» shows `~/projects` with `notes.md` selected
