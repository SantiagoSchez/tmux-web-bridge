# Spec Delta

## ADDED Requirements

### Requirement: An HTML file opens rendered

The file viewer SHALL show a file whose name ends in `.html` or `.htm`, in any letter case, rendered as a page inside the viewer, with a «Ver el texto» button that shows its source with line numbers. In the source, the button SHALL read «Ver renderizado» and SHALL bring the rendered page back. The explorer's preview SHALL show the page rendered, as it shows what the viewer shows.

#### Scenario: A report opens as a page

- **GIVEN** a machine with `~/informe.html`, a page with a heading «Resumen» and a table
- **WHEN** the user opens `~/informe.html` in the file viewer
- **THEN** the viewer shows the heading «Resumen» and the table as a page, not their HTML tags
- **AND** a «Ver el texto» button is shown

#### Scenario: The source on demand

- **GIVEN** `~/informe.html` open in the file viewer, rendered
- **WHEN** the user taps «Ver el texto»
- **THEN** the viewer shows the file's HTML with its line numbers and a «Ver renderizado» button
- **AND** tapping «Ver renderizado» shows the page again

#### Scenario: Upper-case extension

- **GIVEN** a machine with `~/PORTADA.HTM`
- **WHEN** the user opens it in the file viewer
- **THEN** the viewer shows it rendered

### Requirement: «Abrir aparte» opens an HTML file rendered

«Abrir aparte» on an HTML file SHALL open the rendered page, whole, in a new browser tab, with the same limits as the page inside the viewer.

#### Scenario: The page in a tab of its own

- **GIVEN** `~/informe.html` open in the file viewer
- **WHEN** the user taps «Abrir aparte»
- **THEN** a new tab shows the page rendered, with its heading «Resumen» and its table

### Requirement: A rendered page runs its scripts without the hub's session

A rendered HTML page SHALL run its JavaScript, and SHALL run it with an origin of its own that is neither the hub's nor any other site's: its scripts SHALL NOT read the hub's cookies, the panel's storage or the panel's page, and its requests SHALL NOT carry the hub's session.

#### Scenario: A chart drawn by a script

- **GIVEN** `~/grafico.html`, whose inline script draws a chart into a `<canvas>`
- **WHEN** the user opens it in the file viewer
- **THEN** the chart is drawn

#### Scenario: A script cannot use the hub's API

- **GIVEN** `~/raro.html`, whose script calls the hub's `/api/` endpoints and reads `document.cookie`
- **WHEN** the user opens it in the file viewer or with «Abrir aparte»
- **THEN** the hub answers its API calls as for a browser without a session, and the script reads no cookie of the hub

#### Scenario: A script cannot reach the panel

- **GIVEN** `~/raro.html`, whose script reads `window.parent.document` and `localStorage`
- **WHEN** the user opens it in the file viewer
- **THEN** the browser refuses both, and the panel keeps working

### Requirement: A rendered page loads the files of its folder

A rendered HTML page SHALL load the files its relative URLs name in its own folder and in the folders below it (stylesheets, scripts, images, fonts, data files read by its scripts and other HTML pages it links to), each with the content type of its extension.

#### Scenario: A stylesheet and an image next to the page

- **GIVEN** `~/web/index.html`, which uses `estilo.css` and `img/logo.png` of its folder
- **WHEN** the user opens `~/web/index.html` in the file viewer
- **THEN** the page shows with the styles of `estilo.css` and the image `img/logo.png`

#### Scenario: Data read by a script

- **GIVEN** `~/web/index.html`, whose script reads `datos.json` of its folder with `fetch`
- **WHEN** the user opens it in the file viewer
- **THEN** the script gets the content of `datos.json`

#### Scenario: A link to another page of the folder

- **GIVEN** `~/web/index.html` rendered in the viewer, with a link to `otra.html` of its folder
- **WHEN** the user taps the link
- **THEN** `otra.html` shows rendered in the same place, with the same limits

### Requirement: A rendered page reaches nothing outside its folder or hidden

A rendered HTML page SHALL NOT get any file or folder outside the folder of the HTML file it was opened from, nor any whose path below that folder has a part starting with a dot, whatever path, encoding or symbolic link it asks through. Such a request SHALL be refused with no content.

#### Scenario: A hidden file next to the page

- **GIVEN** `~/proyecto/informe.html` and `~/proyecto/.env`
- **WHEN** the page's script asks for `.env`
- **THEN** the hub refuses it and the script gets none of its content

#### Scenario: A hidden folder below the page

- **GIVEN** `~/proyecto/informe.html` and `~/proyecto/.git/config`
- **WHEN** the page asks for `.git/config`
- **THEN** the hub refuses it

#### Scenario: A file above the page's folder

- **GIVEN** `~/proyecto/docs/informe.html` and `~/proyecto/notas.txt`
- **WHEN** the page asks for `../notas.txt`, or the same path with its dots or slashes percent-encoded
- **THEN** the hub refuses it

#### Scenario: A symbolic link that points out

- **GIVEN** `~/proyecto/informe.html` and `~/proyecto/clave`, a symbolic link to `~/.ssh/id_ed25519`
- **WHEN** the page asks for `clave`
- **THEN** the hub refuses it

#### Scenario: The page's own folder may be hidden

- **GIVEN** `~/.cache/informes/informe.html` with `estilo.css` next to it
- **WHEN** the user opens `~/.cache/informes/informe.html` in the file viewer
- **THEN** the page shows with the styles of `estilo.css`

### Requirement: A rendered page loads nothing from outside the hub

A rendered HTML page SHALL NOT load or send anything to another site: scripts, styles, images, fonts, frames and requests SHALL only reach its own folder through the hub, plus inline code, `data:` and `blob:` URLs. This limit does not cover navigation: a link the user taps can still leave the hub.

#### Scenario: A library from a CDN

- **GIVEN** `~/grafico.html`, which loads a charting library from a public CDN
- **WHEN** the user opens it in the file viewer
- **THEN** the browser does not request the library and the page shows without it

#### Scenario: A request to another site

- **GIVEN** `~/raro.html`, whose script sends a `fetch` and loads an image from another site
- **WHEN** the user opens it in the file viewer
- **THEN** the browser blocks both and the other site receives no request

### Requirement: A page's address stops working when unused

The address a rendered page is served from SHALL keep working while it is used, SHALL stop working 24 hours after its last request, when the hub restarts, and, with password login, when the session that opened it is closed. A stopped address SHALL answer with a page saying, in Spanish, to open the file again from the panel. Opening the file again in the viewer SHALL give a working address.

#### Scenario: A tab reloaded the next day

- **GIVEN** `~/informe.html` opened with «Abrir aparte», and its tab left without requests for more than 24 hours
- **WHEN** the user reloads the tab
- **THEN** the tab says the link has expired and to open the file again from the panel

#### Scenario: A closed session

- **GIVEN** the hub with password login, and `~/informe.html` opened with «Abrir aparte» from a session
- **WHEN** that session is closed from Ajustes and the tab is reloaded
- **THEN** the tab says the link has expired
