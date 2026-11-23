# file-viewer Specification

## Purpose

The panel's file viewer: a file opened from the terminal, the changed files of a window's repository and each file's diff, and how its screens open over one another and close.

## Requirements

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

### Requirement: A changed file shows its type's icon

Each row of «Ficheros cambiados» SHALL show the icon of its file's type, the same the file explorer shows for that name, between the git status letter and the file's name.

#### Scenario: A modified source file and a new image

- **GIVEN** a repository whose changes are `src/app.ts` modified and `docs/captura.png` new
- **WHEN** «Ficheros cambiados» lists them
- **THEN** the row of `app.ts` shows «M», then the code icon, then `app.ts`
- **AND** the row of `captura.png` shows «N», then the image icon, then `captura.png`

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

#### Scenario: A page opened through a symbolic link

- **GIVEN** `~/ultimo.html`, a symbolic link to `~/informes/informe.html`, which uses `estilo.css` of its own folder
- **WHEN** the user opens `~/ultimo.html` in the file viewer
- **THEN** the viewer shows `informe.html` rendered with the styles of `~/informes/estilo.css`

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
- **WHEN** the user opens it in the file viewer or with «Abrir aparte», with password login or through `tailscale serve`
- **THEN** the hub refuses its API calls, and the script reads no cookie of the hub

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

#### Scenario: Data read with a JSON request

- **GIVEN** `~/web/index.html`, whose script reads `datos.json` with a `fetch` that sends `Content-Type: application/json`
- **WHEN** the user opens it in the file viewer
- **THEN** the script gets the content of `datos.json`

#### Scenario: A link to another page of the folder

- **GIVEN** `~/web/index.html` rendered in the viewer, with a link to `otra.html` of its folder
- **WHEN** the user taps the link
- **THEN** `otra.html` shows rendered in the same place, with the same limits

### Requirement: A rendered page reaches nothing outside its folder or hidden

A rendered HTML page SHALL NOT get any file or folder outside the folder of the HTML file it was opened from, nor any whose path below that folder has a part starting with a dot, whatever path, encoding or symbolic link it asks through. When that folder is the root of the disk, the machine's home folder or a folder above it, or a temporary root (`/tmp`, `/var/tmp`, or the machine's `$TMPDIR`), the page SHALL get only its own HTML file. Such a request SHALL be refused with no content.

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

#### Scenario: A page in the home folder gets only itself

- **GIVEN** `~/informe.html`, which uses `estilo.css` of its folder, and `~/notas.txt`
- **WHEN** the user opens `~/informe.html` in the file viewer and its script asks for `notas.txt`
- **THEN** the page shows without the styles of `estilo.css`
- **AND** the hub refuses `notas.txt`

#### Scenario: The page's own folder may be hidden

- **GIVEN** `~/.cache/informes/informe.html` with `estilo.css` next to it
- **WHEN** the user opens `~/.cache/informes/informe.html` in the file viewer
- **THEN** the page shows with the styles of `estilo.css`

### Requirement: A rendered page loads nothing from outside the hub

A rendered HTML page SHALL NOT load or send anything to another site: scripts, styles, images, fonts, frames and requests SHALL only reach its own folder through the hub, plus inline code, `data:` and `blob:` URLs. This limit does not cover navigation (a link the user taps, or a script moving its own page, can leave the hub), nor the peer-to-peer connections (WebRTC) and the DNS lookups that some browsers let a script start.

#### Scenario: A library from a CDN

- **GIVEN** `~/grafico.html`, which loads a charting library from a public CDN
- **WHEN** the user opens it in the file viewer
- **THEN** the browser does not request the library and the page shows without it

#### Scenario: A request to another site

- **GIVEN** `~/raro.html`, whose script sends a `fetch` and loads an image from another site
- **WHEN** the user opens it in the file viewer
- **THEN** the browser blocks both and the other site receives no request

### Requirement: A page's address works only for a while

The address a rendered page is served from SHALL stop working 24 hours after the panel obtained it, even if it was used in between, and when the hub restarts. With password login it SHALL also stop working when the session that opened it ends, closed from the panel or expired. A stopped address SHALL answer with a page saying, in Spanish, to open the file again from the panel. Opening the file again in the viewer SHALL give a working address.

#### Scenario: A tab reloaded the next day

- **GIVEN** `~/informe.html` opened with «Abrir aparte» more than 24 hours ago, and its tab reloaded several times since
- **WHEN** the user reloads the tab
- **THEN** the tab says the link has expired and to open the file again from the panel

#### Scenario: An expired session

- **GIVEN** the hub with password login, and `~/informe.html` opened with «Abrir aparte» from a session
- **WHEN** that session expires for lack of use and the tab is reloaded
- **THEN** the tab says the link has expired


#### Scenario: A closed session

- **GIVEN** the hub with password login, and `~/informe.html` opened with «Abrir aparte» from a session
- **WHEN** that session is closed from Ajustes and the tab is reloaded
- **THEN** the tab says the link has expired

### Requirement: A page's address works only from where it was opened

The address a rendered page is served from SHALL work only for requests from the network address that obtained it. A request from another address SHALL get the same page as a stopped address, and no file.

#### Scenario: The address used from another network

- **GIVEN** `~/informe.html` opened with «Abrir aparte» from one network address
- **WHEN** its address is requested from another network address
- **THEN** the hub answers the page saying the link has expired, and serves no file

### Requirement: A rendered page plays its videos and sounds

The hub SHALL answer a rendered page's request for a part of one of its files (an HTTP `Range` request) with that part, so that a video or a sound inside the page plays and seeks in every browser.

#### Scenario: Seeking in a video of the page

- **GIVEN** `~/web/index.html`, which shows `clip.mp4` of its folder in a `<video>`
- **WHEN** the user opens it in the file viewer and moves the video to its middle
- **THEN** the video plays from there

### Requirement: «Abrir aparte» plays a video or a sound

«Abrir aparte» on a video or a sound file SHALL open it in a new tab with the browser's player, ready to play and to seek, as the viewer plays it. Opening it SHALL NOT run anything the file holds.

#### Scenario: A video in a tab of its own

- **GIVEN** `~/videos/demo.mp4` open in the file viewer
- **WHEN** the user taps «Abrir aparte»
- **THEN** a new tab shows the video with the browser's player, and it plays

### Requirement: The hub's API answers only the panel

The hub SHALL refuse a request to its API that comes from another website, from another subdomain of the hub's domain, or from a rendered page, with password login and through `tailscale serve` alike. It SHALL serve such a request when it carries an `Origin` listed in `allowedOrigins`. A file's address opened from the panel, or typed in the address bar, SHALL keep working. This holds when the hub is served over HTTPS, as browsers tell where a request comes from only there.

#### Scenario: A link from another website

- **GIVEN** a page of another website with a link to the hub's `/api/files` address of `~/informe.md`
- **WHEN** the user, logged in to the hub, follows the link
- **THEN** the hub refuses the request and serves nothing of the file

#### Scenario: A page of another subdomain

- **GIVEN** the hub at `panel.example.com` and a page at `otra.example.com` that requests `/api/files` of the hub
- **WHEN** a logged-in user opens that page
- **THEN** the hub refuses the request

#### Scenario: An allowed origin

- **GIVEN** `allowedOrigins` holding `http://localhost:5173`
- **WHEN** a script of that origin sends a `fetch` to the hub's API
- **THEN** the hub serves it as it serves the panel
