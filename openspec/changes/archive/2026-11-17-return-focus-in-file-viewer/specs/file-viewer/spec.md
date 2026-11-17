# Spec Delta

## ADDED Requirements

### Requirement: Going back gives the focus back to what opened the screen

Closing a screen of the file viewer, by any of the ways that go back one screen, SHALL give the focus back to the element of the screen below that had it when the closed screen was opened, without scrolling the screen below. When no element had the focus then, closing SHALL NOT move the focus to any element.

#### Scenario: Back from a diff to its file in the list

- **GIVEN** «Ficheros cambiados» open, and the user moved to the file `src/app.ts` with Tab and opened its diff with Enter
- **WHEN** the user presses Escape
- **THEN** the focus is on `src/app.ts` in the list, and the next Tab moves to the file after it

#### Scenario: Back from a file to «Ver el fichero»

- **GIVEN** a diff, and the file opened from it with «Ver el fichero» by keyboard
- **WHEN** the user goes back with «Atrás»
- **THEN** the focus is on «Ver el fichero» in the diff

#### Scenario: The list does not scroll

- **GIVEN** «Ficheros cambiados» scrolled so that the file the user opened sits at the bottom edge of the list
- **WHEN** the user closes that file's diff
- **THEN** the list keeps its scroll position and the file has the focus

#### Scenario: Nothing had the focus

- **GIVEN** a browser that does not focus a button when it is clicked, and a diff opened with a click from «Ficheros cambiados»
- **WHEN** the user closes the diff
- **THEN** no element of the list gets the focus
