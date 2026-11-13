# Changelog

Todos los cambios relevantes del proyecto, del más reciente al más antiguo. Las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

No edites este fichero a mano: cada cambio registra una entrada con `ka changelog add` (la skill `/koalarnes:changelog`), y `/koalarnes:release` compila las entradas pendientes en una sección nueva.

## 1.21.0 - 2026-11-12

### Espacios y ventanas temporales

- En «Nuevo espacio» y «Nueva ventana» hay una fila nueva, **Carpeta temporal**, para sesiones de usar y tirar. En las máquinas sin carpetas, es el botón **Temporal** del diálogo del nombre.
- Crea una carpeta nueva en la carpeta temporal de la máquina y abre en ella un espacio `tmp-xxxx` (o, desde «Nueva ventana», una ventana `tmp-xxxx`) con Claude.
- Las ventanas temporales se distinguen por un contorno punteado en la lista y en la cuadrícula.
- El servidor central borra la carpeta en cuanto se cierra la ventana y no queda ningún panel dentro. Al reconectar con una máquina, también borra las que se quedaron huérfanas.

### Enlaces a ficheros

- Un nombre de fichero suelto («Contestado: plan.md») que no está en la carpeta del panel se busca ahora en su repo de git, también entre los ficheros aún sin añadir, así que la vista previa y el visor lo encuentran. Si está en varios sitios, se abre el que se modificó más recientemente.

## 1.20.0 - 2026-11-12

### Lista plegable en escritorio

- El botón nuevo a la izquierda de «twb», o **⌘B** (Mac) / **Ctrl+Shift+B**, pliega la lista de espacios en una franja estrecha. El terminal gana el ancho.
- La franja conserva el botón para desplegarla, el estado de la conexión con el servidor central y un icono por cada pendiente, con el borde del color de su estado. Al pasar el ratón se ve qué ventana es; con un clic se abre.
- Cada dispositivo recuerda si la tenías plegada.

### Nombres legibles en la lista

- El nombre de cada ventana o espacio tiene prioridad: el comando que va detrás («claude», «bash · 2 paneles») solo aparece si cabe, en vez de reservarse sitio y dejar el nombre en tres o cuatro letras.
- En el móvil, los botones +, ⋯ y × de cada fila son más estrechos y están más juntos, así que dejan más ancho al nombre.

## 1.19.0 - 2026-11-12

### «Nueva ventana» con carpetas

- En una máquina con carpetas (⚙️ Ajustes › Carpetas), **«Nueva ventana»** ofrece el mismo selector que «Nuevo espacio»: buscador, «Nueva carpeta…», «En un worktree nuevo» y «Saltarse los permisos». La ventana se abre en ese espacio, en la carpeta elegida y con el comando de la máquina (`claude`) en marcha.
- **«Ventana vacía»** abre el diálogo de antes: solo el nombre, sin comando.

### Trello: espacio y carpeta por separado

- El cajón de Trello del panel y la extensión de Chrome eligen por separado el **espacio** (el de la carpeta, nuevo o abierto, o uno de los abiertos) y la **carpeta**. Un espacio abierto con una carpeta abre la tarea en una ventana nueva de ese espacio, en esa carpeta; sin carpeta, donde esté el espacio.
- Cada tablero recuerda la última máquina, el último espacio y la última carpeta (también la elección guardada antes de esta versión).
- `POST /api/ext/launch` admite `target: { session, folder, sub? }`.

### «Espacios»

- Los spaces pasan a llamarse **espacios** en todo el panel, la extensión, los mensajes y los avisos de tmux del kit. La API no cambia.

### Retoques

- En el móvil, el contador de conexiones sale solo en la cabecera de la lista, no en la de cada ventana.
- El botón de cambios de una ventana sin cambios enseña un icono de fichero con diff en vez de «±».
- Los vídeos del README están regrabados con el panel actual.

## 1.18.0 - 2026-11-12

### Tareas en worktrees

- **«En un worktree nuevo»** en «Nuevo space», en el cajón de Trello, en la extensión y en las automatizaciones: Claude arranca con `claude --worktree <nombre>` (pasa por tu hook `WorktreeCreate` si lo tienes), en una ventana con ese nombre y con un prompt opcional. Para una tarjeta propone `<número>-<título>`, por ejemplo `142-arreglar-login-movil`.

### Trello en el panel

- La **cuenta de Trello** (API key y token) y la **plantilla del prompt** pasan a ⚙️ Ajustes › Trello del panel.
- Un **botón de tablero** en la cabecera enseña las listas y tarjetas de tus tableros, con un **buscador** por título o número. Una tarjeta lanza la tarea y el panel la mueve a Doing y la comenta.
- La **extensión de Chrome** ya no tiene credenciales propias: le pide la tarjeta y la plantilla al panel, y él la mueve y la comenta. Sus opciones son solo la dirección del panel y el token de la extensión.

### Automatizaciones

- ⚙️ **Ajustes › Automatizaciones**: prompts que el servidor central lanza solo, a su hora, en una ventana nueva del space de una carpeta y, si quieres, cada vez en un worktree nuevo (`deps-nocturnas-20261112-1800`). El horario se elige por días y hora, cada N horas o con cron.
- Si la anterior sigue trabajando o esperándote, esa vez se salta; si una no se puede lanzar, llega una notificación. También se pueden ejecutar a mano.

### Actividad

- Un botón con el pulso en la cabecera enseña lo que ha pasado en los últimos 7 días: quién preguntó, pidió permiso o terminó (y tras cuánto), qué tareas se lanzaron y desde dónde, y qué automatizaciones se saltaron o fallaron.
- **Pendientes** dice desde cuándo espera cada Claude y cuánto trabajó.

### Ficheros y diffs

- Las **rutas que escribe Claude** en la terminal se tocan o se pulsan para verlas en el panel: imágenes y PDF, Markdown renderizado y cualquier texto con sus números de línea, saltando a la indicada. Con ratón, al dejarlo encima sale una **miniatura**. Valen ficheros de cualquier tamaño.
- El botón **+N −M** de la cabecera de la ventana cuenta las líneas cambiadas en su repo (en una rama que no es la principal, toda la rama desde que salió de ella) y abre **Ficheros cambiados**: la lista, con buscador, y el diff de cada fichero.

### Retoques

- En una cabecera estrecha (el móvil o la barra lateral), la píldora de pendientes enseña solo el número, para que quepan los botones.
- Los botones de la cabecera (conexiones, cambios) tienen el mismo diseño que ···.
- El botón Atrás del móvil cierra el visor de ficheros pantalla a pantalla.

### Para actualizar

- **Antes de actualizar el kit de la máquina donde usas Chrome**, pon la API key y el token de Trello en ⚙️ Ajustes › Trello del panel: la extensión nueva se los pide a él. Después, recárgala en `chrome://extensions`.

## 1.17.1 - 2026-11-11

### Arreglos

- **Extensión de Trello**: en sus opciones, el primer campo de cada bloque (dirección del panel, API key y plantilla) ya no se queda apretado junto al título.
- **Aviso de versión nueva**: el panel avisa de los kits por actualizar en cuanto se publica una release, en vez de tardar hasta una hora.

## 1.17.0 - 2026-11-11

### Extensión de Trello

- **Se instala y se pone al día con el kit**: en ⚙️ Ajustes › Trello › «Instalarla en las máquinas», activa la máquina donde usas Chrome. Su kit descarga la extensión de su versión en `~/.local/share/tmux-web-bridge/trello-extension` y la vuelve a descargar en cada actualización. Se carga una sola vez en `chrome://extensions` › Cargar descomprimida, desde esa carpeta.
- **Avisa cuando hay versión nueva**: su icono muestra ↑, y el diálogo de la tarjeta y sus opciones ofrecen abrir su ficha en `chrome://extensions` para recargarla con un clic. También se pone al día al reiniciar Chrome.
- **Cada release lleva la extensión empaquetada** (`twb-trello-extension-vX.Y.Z.zip`), para instalarla a mano si se prefiere.

Para activarla hace falta el kit de esta versión: actualízalo desde el panel. Al cargarla desde la carpeta nueva, Chrome la trata como otra extensión: hay que volver a rellenar sus opciones y quitar la anterior.

## 1.16.0 - 2026-11-11

### «Nuevo space»

- Las carpetas con subcarpetas salen agrupadas: una cabecera pequeña con su nombre y su ruta, y debajo sus subcarpetas solo por nombre. Las carpetas sin subcarpetas van juntas en «Sueltas».
- Botón «＋» en la cabecera de cada grupo para crear una carpeta dentro y abrir un space en ella.
- «Nueva carpeta…» al principio de la lista: se elige dónde con el explorador de la máquina, se le pone nombre y se abre un space en ella; queda guardada entre las carpetas de la máquina. Con «Incluir todas sus subcarpetas» se guarda como grupo vacío, sin abrir space.
- Desaparecen las filas «Crear «x»» del buscador.

### Lista de spaces

- Nuevo ajuste «Vista de la lista» en Ajustes › Dispositivo:
  - **Detallada** (por defecto): cada ventana muestra su worktree de git o, si no está en uno, su rama; fuera de un repo, su carpeta.
  - **Condensada**: una sola línea por fila, más baja, para que quepan más spaces y ventanas. «Pendientes» también se compacta.
- El comando, los paneles y el zoom van en pequeño junto al nombre.
- Con ratón, los botones de cada fila aparecen encima al pasar por ella, en vez de quitarle sitio al texto.

### Extensión de Trello

- Nueva extensión de Chrome (`trello-extension/`) para lanzar un Claude con una tarjeta de Trello: abre una ventana con nombre en un space abierto o en el de una carpeta y escribe `claude` con el encargo.
- Usa su propio token, que se crea y se revoca en Ajustes › Trello. No se despliega: se construye con `pnpm --filter trello-extension build` y se carga en `chrome://extensions`.

## 1.15.0 - 2026-11-11

### Cuentas de Claude

- El hub guarda las cuentas de Claude de tus máquinas: detecta solo con cuál está Claude Code en cada una y puedes añadir más iniciando sesión desde el panel (se abre el login de Claude y se pega el código).
- Cada cuenta se puede renombrar con un alias; el email y el plan salen en su menú.
- Cambio de cuenta en caliente: pasa el Claude Code de una máquina a otra cuenta sin reiniciar los Claude abiertos, que la usan desde su siguiente mensaje. Lo hace con los mismos bloqueos que Claude Code, para no cruzarse con una renovación de la sesión.
- En macOS usa el Llavero si Claude Code llega a él y, si no (por SSH o con tmux arrancado fuera de la sesión gráfica), el fichero de credenciales, como el propio Claude Code.
- Las sesiones de una misma cuenta se reparten entre máquinas: cada una está en una sola máquina o libre en el hub, y para usar una cuenta en dos máquinas a la vez hace falta un segundo inicio de sesión.

### Barra de límites

- Una fila por cuenta, con el uso que el hub consulta cada pocos minutos (5h, 7d, el semanal de Fable y el plan) y, cuando es más reciente, el del statusline.
- Se resalta la cuenta de la máquina de la ventana abierta.
- «Usar aquí» cambia la máquina de la ventana abierta (en pantalla ancha). El nombre de cada cuenta abre su menú: dónde está en uso, «Usar en una máquina…», renombrar, añadir otra cuenta y quitarla del hub.

El kit de las máquinas no cambia: no hace falta actualizarlas.

## 1.14.2 - 2026-11-10

### Kit de las máquinas

- Barra de estado de Claude Code: si el worktree se llama igual que su rama (también cuando la rama lleva `/` y la carpeta `-`), el nombre sale una sola vez, con el icono del worktree.

## 1.14.1 - 2026-11-09

### Terminal

- Reconecta mucho antes al volver a la app: si la conexión se queda colgada mientras la red del móvil despierta, a los 4 s se corta y se abre otra, en vez de esperar a los reintentos de la red (que podían tardar 15 s o más).
- Reintenta en cuanto el móvil vuelve a tener red.
- Al reconectar solo queda el contador «Reconectando… N s»; se quita el aviso de cuánto había tardado.

## 1.14.0 - 2026-11-09

### Terminal

- Al reconectar (por ejemplo, al volver a la app tras un rato en segundo plano), el terminal ya no se queda en blanco: muestra la última pantalla, atenuada, hasta que vuelve la conexión.
- El aviso de reconexión cuenta los segundos y, al volver, dice cuánto ha tardado en total y cuánto solo en abrirse la conexión.

### Notificaciones

- Tocar una notificación abre su ventana aunque la app estuviera reconectando en ese momento; antes podía quedarse en la última ventana abierta.

## 1.13.0 - 2026-11-07

### Terminal

- Nuevos botones flotantes para recorrer la salida página a página: «Página anterior» y «Página siguiente», encima del de ir al final. Funcionan en el modo copia de tmux, en un shell normal y en programas a pantalla completa como Claude Code.
- El botón de ir al final muestra ahora una doble flecha, para distinguirlo de los de página.

## 1.12.0 - 2026-11-07

### Novedades

- **Tamaño de los botones de la barra de teclas**: en Ajustes → Teclas, con − y + (del 70 % al 150 %, en pasos de 10) y vuelta al 100 % con un toque. Vale para todo el hub y la vista previa lo refleja al momento.

## 1.11.0 - 2026-11-06

### Novedades

- **Límites de uso**: la tira de arriba muestra en cada barra el tiempo que queda hasta el reinicio (en el móvil también) y, si al ritmo actual llegarías al 100 % antes, un ⚠. Al pulsar en esa barra, un tooltip dice cuándo llegarías.
- **Hojas que suben desde abajo**: en el móvil se cierran arrastrándolas hacia abajo por la rayita o el título; si no bajas lo bastante, vuelven a su sitio.

### Arreglos

- **Botón atrás en Android**: tras cerrar con «atrás» una hoja abierta sobre otra (una sección de Ajustes, un diálogo sobre un menú), el siguiente «atrás» cerraba la aplicación en lugar de la hoja de debajo.

## 1.10.0 - 2026-11-05

### Novedades

- **Copiar texto de Claude Code entero**: al copiar del terminal (con pulsación larga en el móvil, arrastrando en tmux o con Option+arrastrar y Cmd+C), los párrafos salen en una sola línea, sin los saltos que Claude Code pone al ancho de la pantalla. También se quitan la barra «▎» de las citas, el «●» del principio y la sangría compartida. Las listas, el código, las tablas y las URL largas se respetan.
- **«Copiar tal cual»**: si la limpieza ha cambiado algo, el aviso de «Copiado» trae un botón para copiar el texto como estaba en pantalla.

## 1.9.1 - 2026-11-05

### Arreglos

- **Conexiones muertas**: el servidor central detecta las conexiones que se cortan sin cerrarse (un móvil que se suspende o se queda sin red) y las retira en menos de un minuto. Ya no cuentan como que estás mirando su panel, así que vuelven a llegar sus notificaciones, y desaparecen de «Conectados».
- **Reconexión al volver a la app**: al volver a primer plano o cambiar de red, el panel comprueba que la conexión sigue viva y, si no responde, reconecta al momento en vez de dejar la terminal congelada.
- **«Nuevo space»** se abre sin poner el foco en el campo de texto, así que en el móvil no salta el teclado tapando la lista de carpetas.

## 1.9.0 - 2026-11-05

### Carpetas de «Nuevo space», desde el panel

- Las carpetas que ofrece «Nuevo space» en cada máquina se gestionan en **Ajustes › Carpetas**: se añaden con un navegador de carpetas de la máquina (con interruptor para las ocultas) o escribiendo la ruta, y se pueden renombrar o quitar.
- **Incluir todas sus subcarpetas**: una carpeta puede ofrecer cada una de las que tiene dentro, leídas cada vez que abres «Nuevo space», así que siempre están al día. En ellas se pueden crear proyectos nuevos.
- **Comando al abrir** por máquina (por defecto `claude`, con el modo de permisos elegido; vacío, solo la shell).
- El diálogo de «Nuevo space» muestra la ruta de cada carpeta y las que ya no están (por ejemplo, un disco sin montar) aparecen tachadas.
- Todo se guarda en el servidor central. **El bloque `projects` de la config ya no se usa**: si tu config lo tiene, el hub lo pasa a Ajustes › Carpetas (con sus subcarpetas y su comando) la primera vez que arranca, y avisa en el log de que ya puedes quitarlo. Los atajos de `projects.shortcuts` (`~/.c_dirs`) dejan de leerse: añade esas carpetas en Ajustes.

### Ajustes

- En pantallas grandes, Ajustes es una ventana más amplia y de alto fijo, con las secciones en una barra lateral.
- En el móvil, una lista de secciones; cada una se abre aparte, con «‹ Ajustes» para volver.
- En Carpetas, la máquina se elige en un desplegable que indica cuántas carpetas tiene cada una.

### Móvil

- El botón **Atrás** cierra lo que esté abierto encima (diálogos, menús, Ajustes, Conexiones, el buscador y el cajón lateral) en lugar de salir de la página. Con varios apilados, cierra solo el de arriba.
- Los botones de los diálogos pasan a una segunda línea en pantallas estrechas en vez de partir el texto.

### Arreglos

- En escritorio, Escape cierra solo el diálogo de arriba, no todos los abiertos.

## 1.8.0 - 2026-11-04

### Novedades

- **Modo de permisos de Claude al abrir un proyecto**: el diálogo «Abrir proyecto» tiene la casilla «Saltarse los permisos». Sin marcar, Claude arranca en auto mode (`--permission-mode auto`); marcada, con `--dangerously-skip-permissions`. El panel recuerda la última elección.
- **También al recargar una ventana**: «¿Recargar…?» muestra la misma casilla cuando la ventana tiene algún Claude, y lo reanuda con el modo elegido. Necesita el kit 1.8.0 en la máquina (con un kit anterior, Claude vuelve con su modo por defecto).

## 1.7.2 - 2026-11-03

### Arreglos

- Teclado del móvil: cuando Gboard autocorrige una palabra borrándola y volviéndola a escribir ("claude" → "Claude"), la terminal recibe la minúscula que escribiste.

## 1.7.1 - 2026-11-03

### Arreglos

#### Terminal en el móvil
- Si la autocorrección de Gboard pone en mayúscula la primera letra de una palabra que has escrito en minúscula (por ejemplo, «claude» → «Claude»), la terminal se queda con la minúscula. El resto de correcciones siguen llegando.

#### Claude en worktrees (kit)
- Si Claude ha entrado en un worktree, «Recargar ventana» vuelve a abrir la conversación en vez de perderla: se reanuda desde el directorio donde empezó, y Claude vuelve solo al worktree.
- Lo mismo al restaurar tmux-resurrect y en el comando para reanudar que se copia al cerrar un panel con Claude.

## 1.7.0 - 2026-11-03

### Barra de teclas editable

- La barra de teclas del móvil se edita en Ajustes › Teclas y vale para todo el hub: todos los dispositivos ven la misma.
- Los botones se reordenan arrastrándolos, se renombran y se quitan. Se pueden añadir los de siempre (también Inicio, Fin, Supr y ⌫) o crear uno propio que envíe una tecla, con Ctrl y/o Alt (por ejemplo ^D), o un texto, con o sin Enter (por ejemplo `/clear`).
- «Restablecer» vuelve a la barra de siempre, que sigue siendo la de por defecto.
- Ctrl y Alt de la barra se aplican ahora también a PgUp, Inicio, Fin y Supr.

### Ventana

- El tamaño de letra y «Recargar ventana» pasan al menú ••• de la ventana, y la fila de encima del terminal desaparece en el móvil. El tamaño de letra se cambia ahí sin que el menú se cierre.
- En el móvil, la tira de límites y estados de arriba se desliza en horizontal cuando no cabe, en lugar de cortarse.

### Arreglos

- Pulsar los botones de la barra con el teclado de Android abierto ya no lo cierra a veces.
- Al cambiar a una ventana de otro space, la terminal ocupa siempre todo el alto: antes tmux podía quedarse más bajo hasta cambiar de ventana y volver.

## 1.6.0 - 2026-11-03

### Dictado

- El botón 🎤 se mantiene pulsado mientras hablas: al soltarlo se envía y, si deslizas fuera, se descarta. El modo anterior (tocar y volver a tocar) se puede elegir en Ajustes › Dictado.
- El atajo de teclado se puede cambiar en Ajustes › Dictado (por defecto, Ctrl+Shift+Espacio). Si lo mantienes, graba mientras lo tienes pulsado; si lo pulsas una vez, graba hasta la siguiente pulsación. Escape descarta.
- En el ordenador, el terminal recupera el foco al pegarse el texto.
- El micrófono se abre al empezar a pulsar, sin perder el principio, y en Android vibra al empezar a grabar.

### Tema claro

- Nuevo tema claro (Catppuccin Latte), con el terminal también en claro. Se elige por dispositivo en Ajustes › Dispositivo: Oscuro, Claro o Sistema.
- Se ha ajustado el contraste de los acentos, de los medidores de límites y del texto del terminal pensado para fondo oscuro.

### Iconos de actividad

- El 🔨 se mantiene mientras Claude trabaja por su cuenta: tras aprobar un permiso, tras compactar o tras usar cualquier herramienta, ya no vuelve al 🤖.
- Cada space y cada ventana muestran siempre el estado más urgente de lo que contienen.
- Requiere actualizar el kit de cada máquina (botón «Actualizar» del panel).

### Spaces

- Plegar en una sola fila los spaces que tienen una única ventana es ahora un ajuste del hub (Ajustes › Máquinas), activado por defecto.

## 1.5.0 - 2026-11-02

### Novedades

- **Dictado**: un botón 🎤 en la barra de teclas del móvil y junto a A−/A+ en el escritorio (o Ctrl+Shift+Espacio). Tocas, hablas y vuelves a tocar; ✕ descarta la grabación. El texto se escribe en el panel sin Enter. Todo corre en el servidor central y nada sale de tu red:
  - **Transcripción** con Parakeet TDT 0.6B v3 dentro del propio servidor. Se descarga la primera vez (unos 670 MB) y ocupa ~1 GB de RAM.
  - **Limpieza** con Qwen3.5 4B detrás de llama-server (el servicio `llm` nuevo de `compose.yaml`, unos 3 GB de RAM). Quita las muletillas, se queda con la última versión cuando te corriges («la dos, no, la tres») y corrige los términos técnicos con un glosario y las palabras que hay en la pantalla del panel.
- **Ajustes → Dictado**: activarlo (viene apagado), elegir entre la limpieza o «Sin limpieza», el tiempo máximo de la limpieza (5 a 30 s; pasado ese tiempo, el texto va tal y como se oyó) y el glosario, que viene con términos habituales de Claude Code, git y Docker.

### Arreglos

- Los botones de la barra de teclas ya no vuelven a abrir el teclado de Android si lo habías cerrado con el gesto de atrás.
- Cada despliegue en Docker deja como mucho 1 GB de caché de compilación, que antes crecía sin límite.

Con Docker, para el dictado hay que copiar el servicio `llm` y la variable `TWB_DICTATION_LLM_URL` de `deploy/docker/compose.yaml` al `compose.yaml` del stack y levantarlo con `docker compose up -d llm twb`. El kit de las máquinas no cambia.

## 1.4.0 - 2026-11-01

### Novedades

- **Aviso al cerrar un Claude en tmux**: cerrar un panel, una ventana o un space con algún Claude Code abierto (prefix + x, prefix + X, un Ctrl+W con `kill-pane` o los «Kill» de los menús del clic derecho) abre un popup con cada Claude, su estado, su id de sesión y el comando para reanudarlo (`cd … && claude --resume <id>`). Al confirmar con y, cierra y copia esos comandos al portapapeles y al buffer de tmux (prefix + ]). Sin Claude, cierra sin preguntar; el space sigue pidiendo confirmación.
- **Reanudar desde el panel web**: los diálogos de cerrar ventana, panel y space muestran cada Claude con su comando para reanudarlo y un botón «Copiar»; al confirmar, los comandos se copian solos.

Hace falta actualizar el kit en cada máquina (botón «Actualizar» del panel) para que tmux pregunte y el panel conozca los ids de sesión.

## 1.3.0 - 2026-10-31

### Novedades

- **Lo que te espera, en la pestaña**: mientras haya pendientes, el icono de la pestaña lleva el emoji del más urgente (🙋 pregunta > 💬 permiso > ✅ terminado) y el título dice cuántos hay, por ejemplo «(2) twb».
- **Límites en la status line**: un interruptor en Ajustes › Máquinas quita los límites 5h/7d de la línea de estado de Claude Code en todas las máquinas, para cuando la barra de tmux ya los muestra (por ejemplo, con un módulo de catppuccin). El servidor central la mantiene aunque tmux se reinicie.
- **Ajustes con pestañas**: Dispositivo (notificaciones y silenciar mientras lo usas), Máquinas (límites y búsqueda de actualizaciones) y Cuenta (verificación en dos pasos y sesión, con login por contraseña), con interruptores en vez de botones.

El kit no cambia en esta versión: actualizarlo desde el panel solo lo pone al día en número.

## 1.2.1 - 2026-10-31

### Arreglos

- **Actualizar el kit desde el panel es más seguro**:
  - Si el clon de una máquina no es de twb (su `origin` apunta a otro repo), el panel no lo toca y lo explica.
  - Todos los errores dicen qué clon se intentó actualizar y, cuando importa, su `origin`.
  - Al actualizar desde el panel, `install.sh` ya no recarga el tmux por defecto: lo recarga el servidor central, por el socket de tmux de esa máquina.
- **Desarrollo**: `scripts/test-kit-update.sh` prueba la actualización del kit de punta a punta con un `HOME`, una configuración de git y un tmux temporales.

## 1.2.0 - 2026-10-31

### Novedades

- **Versión del panel a la vista**: al final de la lista (abajo del sidebar en el escritorio) aparece la versión del servidor central y la fecha de su release, en un color discreto. Al tocarla se abren sus notas.

El kit no cambia en esta versión: actualizarlo desde el panel solo lo pone al día en número.

## 1.1.0 - 2026-10-31

### Novedades

- **Actualizar el kit desde el panel**: el aviso de versión nueva tiene un botón «Actualizar», y el menú de cada máquina, «Actualizar el kit a vX.Y.Z». Tras confirmar, el servidor central pasa el clon de cada máquina a la última release por el SSH de siempre, vuelve a aplicar el kit y recarga su tmux. No se cierra nada, los Claude abiertos no se reinician y, si el clon tiene cambios locales, no se toca.
- El kit publica la ruta de su clon (`@twb_kit_dir`) e instala un hook `post-checkout` para quien actualice a mano.

### Cambia la forma de actualizar a mano

El kit va siempre a una release, no a `master`. El clon queda en HEAD separado, así que `git pull` deja de funcionar. A mano, en el clon:

```sh
git fetch --tags && git checkout v1.1.0
```

Los kits 1.0.0 se pueden actualizar ya desde el panel: si no publican la ruta del clon, se usa `~/tmux-web-bridge`.

## 1.0.0 - 2026-10-31

Primera versión publicada de twb. A partir de ahora, el panel avisa cuando sale una release nueva.

- **Pendientes primero**: los Claude que te esperan (🙋 pregunta, 💬 permiso, ✅ terminado) de todas las máquinas.
- **Vista de ventanas** en miniatura y en vivo, y **terminal completa** con barra de teclas para el móvil, selección con el dedo y reconexión automática al volver a la app.
- **Control completo** de spaces, ventanas y paneles, y «Nuevo space» desde un proyecto.
- **Notificaciones push** con botones para responder desde la propia notificación.
- **Varias máquinas** (macOS, Linux, WSL) desde un único servidor central, por SSH.
- **Límites de uso** de Claude por cuenta, y quién está conectado al panel.
- **Buscar actualizaciones**: una vez al día, aviso de versión nueva del servidor central o del kit de alguna máquina (se desactiva en Ajustes).
