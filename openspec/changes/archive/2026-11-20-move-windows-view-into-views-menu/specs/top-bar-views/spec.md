# Spec Delta

## Purpose

Defines how the panel's top bar of the list gives access to the views that do not fit in it, the windows view and «Actividad», and how it shows that the windows view is open.

## ADDED Requirements

### Requirement: The views are in the «Más vistas» menu

The top bar of the list SHALL show, among its buttons, a single entry to the views: the «Más vistas» chevron, with no separate button for the windows view, on a phone and on a computer alike. Tapping it SHALL open the «Más vistas» menu, which lists «Vista de ventanas» first and «Actividad» second. Choosing «Vista de ventanas» SHALL open the windows view; choosing «Actividad» SHALL open «Actividad». The bell, Trello, the connections and the settings SHALL keep their own buttons in the bar.

#### Scenario: The bar

- **GIVEN** the panel shows the list
- **WHEN** the owner looks at the top bar
- **THEN** it shows the «Más vistas» chevron and no windows view button, next to the bell, Trello when it is set up, the connections and the settings

#### Scenario: Opening the windows view

- **GIVEN** the panel shows the list
- **WHEN** the owner taps the chevron and chooses «Vista de ventanas»
- **THEN** the windows view opens

#### Scenario: Opening «Actividad»

- **GIVEN** the panel shows the list
- **WHEN** the owner taps the chevron and chooses «Actividad»
- **THEN** «Actividad» opens

### Requirement: The open windows view shows in the bar and in the menu

While the windows view is open beside the list, the «Más vistas» chevron SHALL be highlighted and announced as pressed, and the first entry of its menu SHALL read «Cerrar la vista de ventanas». Choosing it SHALL close the windows view, take the panel back to where it was, and leave the chevron no longer highlighted.

#### Scenario: The windows view is open

- **GIVEN** the windows view is open on a computer, beside the list
- **WHEN** the owner looks at the top bar and taps the chevron
- **THEN** the chevron is highlighted, and the menu lists «Cerrar la vista de ventanas» and «Actividad»

#### Scenario: Closing it from the menu

- **GIVEN** the owner opened the windows view from the list on a computer
- **WHEN** the owner chooses «Cerrar la vista de ventanas» in the menu
- **THEN** the panel shows the list again, and the chevron is not highlighted

#### Scenario: On a phone

- **GIVEN** the panel on a phone
- **WHEN** the owner opens the windows view from the menu
- **THEN** the windows view takes the whole screen, over the top bar, and its own «Volver a la lista» button takes the owner back to the list
