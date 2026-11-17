# Funcionalidades

Las funcionalidades del producto tal y como las ven sus usuarios y el equipo de producto. Cada sección sale de un requisito de las specs de OpenSpec de `openspec/specs/`, la redacta `/ka:update-features` y lleva su ancla justo después del título:

```markdown
### <título>
<!-- capability: <capability>; requirement: <requirement-slug> -->
```

`ka features-check` falla cuando un requisito no tiene sección o una sección apunta a un requisito que no existe. Las áreas de `features.nonFeatureAreas` (como el índice de abajo) no necesitan ancla.

## Índice

- [Terminal](#terminal): enlaces en lo que escriben los agentes y Claude Code.
- [Worktrees](#worktrees): la rama de la que parte cada worktree nuevo y con qué rama se comparan sus cambios.
- [Visor de ficheros](#visor-de-ficheros): cómo se abren el diff y el fichero encima de «Ficheros cambiados» y cómo se vuelve atrás.
- [Límites de uso](#límites-de-uso): de dónde salen los límites de cada cuenta en la franja del panel.
- [Scratchpads](#scratchpads): las notas para decirle después a Claude y cómo se pegan en un panel.
- [Atajos](#atajos): los atajos de teclado del panel y la sección de Ajustes que los cambia.
- [Notificaciones](#notificaciones): cuándo te avisa el panel de una pregunta o de un turno terminado y cuándo se calla porque ya lo estás viendo.

## Terminal

### Enlaces a pull requests, issues y pipelines
<!-- capability: terminal-links; requirement: repository-references-open-their-page -->

Cuando un agente escribe «PR #123», «Issue #42» o «pipeline #1987» en el terminal del panel, el texto se subraya y abre la página correspondiente del repositorio del proyecto en una pestaña nueva, con un clic o con un toque en el móvil. Funciona con GitHub y con Bitbucket. Da igual si la palabra va en mayúsculas o minúsculas, pero tiene que ir suelta: «SPR #12» o «PR#12» no se enlazan. Los pipelines solo se enlazan en Bitbucket, porque en GitHub Actions el número no basta para formar la dirección.

### De qué repositorio sale cada enlace
<!-- capability: terminal-links; requirement: the-pane-s-project-decides-the-repository -->

El panel toma el repositorio de la configuración del harness del proyecto en el que está el panel: `.claude/ka.json` o, en un proyecto que aún no ha pasado al nombre nuevo, `.claude/koalarnes.json`. Si existen los dos, manda `.claude/ka.json`. Si el proyecto no tiene ninguno, o el que tiene no indica repositorio, usa el remoto `origin` de la carpeta. Una referencia que no se puede resolver, como una carpeta fuera de git o un remoto que no es de GitHub ni de Bitbucket, se queda como texto normal, sin subrayar. En una ventana partida, cada enlace usa el proyecto del panel en el que está escrito, no el del panel seleccionado.

### Enlaces a tarjetas de Trello
<!-- capability: terminal-links; requirement: trello-references-open-the-card -->

«Trello #470» abre la tarjeta número 470 del tablero que indica la configuración del harness del proyecto (`.claude/ka.json` o, si no lo tiene, `.claude/koalarnes.json`). El panel busca la tarjeta con la cuenta de Ajustes › Trello. Si el proyecto no indica tablero, el texto no se subraya. Si la tarjeta no existe, o falta la cuenta de Trello o Trello la rechaza, la pestaña se cierra y el panel avisa del motivo; en el segundo caso, remite a Ajustes › Trello. Si el navegador bloquea la pestaña nueva, el panel también lo avisa.

### Rutas de fichero en una ventana partida
<!-- capability: terminal-links; requirement: file-paths-open-from-the-pane-they-are-written-in -->

Una ruta de fichero relativa del terminal se busca primero en la carpeta del panel en el que está escrita, tanto para abrirla en el visor como para previsualizarla con el ratón; después, en las carpetas de los demás paneles. En una ventana partida, una ruta relativa como «docs/notes.md» del panel no seleccionado abre el fichero de ese panel, no el del seleccionado.

### Imágenes pegadas en Claude Code
<!-- capability: terminal-links; requirement: image-placeholders-open-the-pasted-image -->

Claude Code muestra cada imagen adjunta como «[Image #1]». En el panel ese texto abre la imagen en el visor de ficheros, tanto si el mensaje ya se ha enviado como si aún se está escribiendo. Con ratón, basta con dejarlo encima para ver una vista previa, igual que con las rutas de fichero. Si Claude Code reutiliza un número en la misma sesión, se abre la imagen más reciente. En una ventana partida, abre la imagen de la sesión de Claude Code del panel donde aparece el texto. Cuando la imagen ya no está (por ejemplo, porque la máquina ha vaciado su carpeta temporal) o el panel no ejecuta Claude Code con el kit, el panel avisa de que no la encuentra.

## Worktrees

### Elegir la rama base de un worktree
<!-- capability: worktree-base; requirement: creating-a-worktree-asks-for-its-base-branch -->

Al crear un worktree, el panel pregunta de qué rama parte: en el paso «Nuevo worktree» de «Nuevo espacio» y de «Nueva ventana», en el cajón de Trello y en el diálogo de la extensión cuando se marca «En un worktree nuevo», y en las automatizaciones que se ejecutan cada vez en un worktree nuevo. La lista tiene las ramas de `origin` del repositorio del destino, leídas en su máquina después de actualizarlas desde el remoto, y cambia si cambias de destino. Si el remoto no responde, enseña las ramas que la máquina ya conocía y avisa de que no ha podido actualizarlas. Si el repositorio no tiene ramas en el remoto, o la lista no se ha podido leer, lo dice, ofrece volver a leerla y deja lanzar en un worktree sin rama base. Si la carpeta no es un repositorio git, lo dice y no deja lanzar en un worktree.

### Qué rama propone primero
<!-- capability: worktree-base; requirement: the-base-branch-offered-first-is-the-last-one-used -->

La rama propuesta es la última que usaste: por tablero de Trello en la extensión y en el cajón de Trello, y por carpeta en «Nuevo worktree» (en cada dispositivo). Si no hay ninguna recordada, o la recordada ya no está en el remoto, propone la base del proyecto: `git.baseBranch` de la configuración del harness del repositorio (`.claude/ka.json` o, si no lo tiene, `.claude/koalarnes.json`) o, si no indica ninguna, la rama por defecto del remoto. Así, otro tablero empieza desde la base del proyecto aunque en el primero usaras `release/2.0`.

### El worktree parte de la rama elegida
<!-- capability: worktree-base; requirement: the-worktree-starts-from-the-chosen-base -->

El worktree arranca en la rama elegida tal y como está en el remoto, y su rama se llama como el worktree (`feature/14-login`). Si la máquina tiene un hook de Claude Code que crea los worktrees, el servidor central crea antes la rama desde la elegida y el hook la reutiliza al crear y preparar el worktree a su manera. Si no lo tiene, el servidor central crea el worktree en la carpeta del proyecto principal (también cuando el destino es otro worktree), copia los ficheros ignorados que seleccione `.worktreeinclude` y Claude Code arranca dentro. Sin rama base (por ejemplo, desde una extensión aún sin actualizar), el hook crea el worktree como antes y, sin hook, parte de la base del proyecto. Si el remoto no responde al lanzar, el worktree parte de la copia de la rama que ya tenía la máquina y se avisa.

### Automatizaciones con rama base
<!-- capability: worktree-base; requirement: an-automation-keeps-its-base-branch -->

Una automatización que se ejecuta en un worktree nuevo guarda su rama base y cada ejecución parte de ella. Si se guarda con «Base del proyecto», o es anterior a esta funcionalidad, cada ejecución se lanza sin rama base: si la máquina tiene un hook que crea los worktrees, decide él, y si no, parte de la base que tenga el proyecto en ese momento.

### Una rama que ya existe se reutiliza
<!-- capability: worktree-base; requirement: an-existing-branch-with-the-worktree-s-name-is-reused -->

Si el repositorio ya tiene una rama con el nombre del worktree, o la tiene el remoto aunque la máquina aún no la haya traído, el worktree usa esa rama tal cual (si la máquina no puede traerla, no se lanza nada y se avisa), sin aplicar la base elegida, y el panel o la extensión lo avisan después de lanzar. Si esa rama está abierta en otra carpeta, no se lanza nada y se avisa de dónde está, para que elijas otro nombre; si la carpeta de su worktree se borró a mano, el worktree se vuelve a crear. Si la rama base pedida no existe en el remoto, aunque la máquina aún guarde una copia antigua, no se lanza nada y se avisa de que esa rama no existe.

### Con qué rama se comparan los cambios
<!-- capability: worktree-base; requirement: a-branch-s-changes-are-compared-with-the-branch-it-started-from -->

«Toda la rama», en «Ficheros cambiados», compara la rama de la ventana con la rama de la que salió, tal y como lo apuntó git al crearla en esa máquina. Un worktree creado desde `release/2.0` (por el panel, por el hook de Claude Code o a mano con `git checkout -b <rama> origin/release/2.0`) enseña solo sus propios cambios desde que salió de `origin/release/2.0`. Si salió de una rama local, compara con su copia en `origin` cuando existe y, si no, con la local. Usa la copia de las ramas que ya tiene la máquina, sin actualizarlas desde el remoto, y el subtítulo dice con cuál compara («desde origin/release/2.0»).

### Ramas sin nota de creación
<!-- capability: worktree-base; requirement: without-a-usable-creation-note-the-main-branch-is-used -->

Si git no apuntó de dónde salió la rama, o apuntó algo que no sirve para comparar, el panel compara con la rama principal, como antes: `origin/HEAD` o, si no, `origin/main`, `origin/master`, `main` o `master`. Pasa con una rama creada desde `HEAD` (también al crearla sin decir de qué rama sale, como `git checkout -b <rama>` a secas) o desde un commit, con una que salió de otra rama que ya no existe, cuando git ya no guarda la nota y cuando la rama se creó desde su propia copia en `origin`, como hace el panel al reutilizar una rama que ya estaba en el remoto. En la rama principal, «Ficheros cambiados» sigue abriéndose en «Sin commit».

### El contador +/− de la ventana
<!-- capability: worktree-base; requirement: the-counter-compares-with-the-branch-it-started-from -->

El botón **+12 −3** de la cabecera de la ventana cuenta las líneas y los ficheros cambiados desde que la rama salió de la rama de la que partió, con las mismas reglas que «Toda la rama», y su etiqueta la nombra («desde origin/release/2.0»). Elegir otra rama en «Ficheros cambiados» no lo cambia.

### Comparar con otra rama
<!-- capability: worktree-base; requirement: the-changes-modal-compares-with-the-branch-the-user-picks -->

En «Toda la rama», un desplegable debajo de las pestañas lista la rama de la que salió, seleccionada al abrir, y las demás ramas de `origin` que conoce la máquina. Al elegir otra, la lista enseña los ficheros cambiados desde que la rama se separó de esa rama de `origin`, y el diff de cada fichero compara con el mismo punto. Si la rama elegida ya no está en `origin` (por ejemplo, porque se borró al actualizar las ramas), o no tiene ningún commit en común con la de la ventana (como una rama huérfana `gh-pages`), el modal lo dice y deja elegir otra.

### La rama elegida dura lo que el modal
<!-- capability: worktree-base; requirement: the-picked-branch-lasts-while-the-modal-is-open -->

La rama elegida se mantiene mientras «Ficheros cambiados» está abierto, también al entrar en el diff de un fichero y volver. Al cerrarlo y abrirlo otra vez, vuelve a comparar con la rama de la que salió.

## Visor de ficheros

### El diff se abre encima de la lista
<!-- capability: file-viewer; requirement: a-file-s-diff-opens-over-the-changed-files -->

Al tocar un fichero en «Ficheros cambiados», su diff se abre en un panel nuevo encima de la lista. La lista se queda debajo tal y como estaba: los mismos ficheros, el texto del buscador, la pestaña, la rama elegida y el punto por el que ibas. Al cerrar el diff vuelves a ella sin «Cargando…» y sin que el panel vuelva a pedir los cambios a la máquina, así que no enseña lo que haya cambiado entretanto: para eso está «Volver a mirar».

### El fichero se abre encima de su diff
<!-- capability: file-viewer; requirement: a-file-opens-over-its-diff -->

«Ver el fichero», en un diff, abre el fichero entero en otro panel encima del diff. Al cerrarlo, el diff sigue en el mismo punto, sin volver a cargarse.

### Cerrar vuelve a la pantalla anterior
<!-- capability: file-viewer; requirement: closing-the-sheet-on-top-goes-back-one-screen -->

Cualquier forma de cerrar el panel de arriba cierra solo ese y deja ver el de debajo: «Atrás», Esc, un toque fuera del panel, arrastrarlo hacia abajo en el móvil o el botón atrás del móvil. Desde un fichero abierto desde un diff, el botón atrás enseña primero el diff, luego la lista y, a la tercera, cierra el visor. Cerrar el único panel que queda cierra el visor.

### Solo se usa el panel de arriba
<!-- capability: file-viewer; requirement: only-the-sheet-on-top-can-be-used -->

Con varios paneles abiertos, solo el de arriba oscurece la página y responde: la página se ve igual de oscura que con un único panel, y ni el teclado, ni el ratón, ni un lector de pantalla llegan a los paneles de debajo hasta que vuelven a quedar arriba.

### El foco vuelve a donde estaba
<!-- capability: file-viewer; requirement: going-back-gives-the-focus-back-to-what-opened-the-screen -->

Al cerrar una pantalla del visor, el foco vuelve a lo que la abrió: al fichero de «Ficheros cambiados» al cerrar su diff, y a «Ver el fichero» al cerrar el fichero. Con el teclado o un lector de pantalla se sigue desde ahí, y la lista no se mueve. Si al abrir la pantalla nada tenía el foco, como pasa en Safari al hacer clic en un botón, al cerrarla tampoco se enfoca nada.

## Límites de uso

### Lecturas de otra cuenta
<!-- capability: usage-limits; requirement: a-statusline-reading-that-contradicts-the-hub-s-is-not-shown -->

Los límites de 5 horas y semanales de cada cuenta salen de dos sitios: la lectura que el servidor central hace de la cuenta cada pocos minutos y la que publica la status line de Claude Code en cada máquina, que suele ser más reciente. Tras cambiar de cuenta en una máquina, un Claude que siga con la anterior puede publicar los límites de la anterior a nombre de la nueva. El servidor central lo detecta porque las horas de reinicio no coinciden con las que él leyó de esa cuenta, con un margen de 5 minutos, y entonces la fila muestra su propia lectura. No se fija en una ventana de la lectura que ya ha terminado, ni compara las lecturas de un email que comparten dos cuentas o de una cuenta que el servidor central no ha leído nunca.

### Ventanas que el servidor vio cerradas
<!-- capability: usage-limits; requirement: a-window-that-started-before-the-hub-saw-it-closed-is-not-shown -->

Cuando el servidor central leyó una cuenta sin ventana abierta de 5 horas o semanal, porque no se ha usado desde su reinicio o porque la anterior ya terminó, no hay hora de reinicio con la que comparar. Entonces mira cuándo empezó la ventana de la lectura: si empezó antes de esa lectura del servidor, o antes de que terminara su ventana anterior, no puede ser de esa cuenta, y la fila muestra la lectura del servidor. Es el caso de una cuenta sin usar desde su reinicio semanal. El inicio se calcula restando a la hora de reinicio la duración de la ventana, con un margen de 10 minutos en la de 5 horas y de una hora en la semanal. Una ventana que empezó después de la lectura del servidor sí es de la cuenta.

### La previsión no mezcla cuentas
<!-- capability: usage-limits; requirement: a-foreign-reading-does-not-feed-the-forecast -->

La previsión de cuándo se agota un límite se calcula solo con lecturas de la propia cuenta: las que el servidor central descarta por ser de otra cuenta no entran en el historial.

### Aviso en la fila de la cuenta
<!-- capability: usage-limits; requirement: the-account-s-row-warns-about-a-foreign-reading -->

Mientras una máquina tenga una lectura de otra cuenta a nombre de una cuenta, su fila muestra ⚠ y el aviso dice qué máquina la publicó y que ese Claude seguramente sigue con la cuenta anterior: si no se corrige con su próximo mensaje, hay que reiniciarlo. El aviso está en el tooltip de la fila y en el menú de la cuenta, para verlo también en el móvil. Desaparece cuando un Claude de esa máquina publica una lectura que coincide con la del servidor central; si no publica ninguna, sigue mientras dure la ventana de la lectura, una semana como mucho.

## Scratchpads

### Cinco scratchpads compartidos
<!-- capability: scratchpads; requirement: coloured-scratchpads-shared-by-every-device -->

El panel tiene cinco scratchpads para apuntar lo que quieres decirle después a Claude. No tienen nombre: se distinguen por su color, en este orden: azul, verde, amarillo, naranja y morado. Cada color enseña cuántas notas tiene, y un clic en él enseña sus notas. Las notas se guardan en el servidor central, así que todos los dispositivos ven las mismas, un cambio en uno aparece en los demás sin recargar y siguen ahí después de reiniciar el servidor. Las notas guardadas cuando había tres scratchpads conservan su color; el amarillo y el morado empiezan vacíos.

### Añadir una nota
<!-- capability: scratchpads; requirement: adding-a-note -->

Cada scratchpad tiene al pie un campo para escribir una nota de texto plano. Enter la guarda y Mayús+Enter salta de línea. La nota nueva va la última y sin fijar. Cuando el texto llega a 3500 caracteres, el campo enseña cuántos lleva de los 4000 posibles (por ejemplo, «3600/4000»), sin contar los espacios ni los saltos de línea del final, que no se guardan, y lo marca si se pasa. Un texto vacío o solo con espacios no añade nada.

### Nota rápida desde el teclado
<!-- capability: scratchpads; requirement: a-quick-note-from-the-keyboard -->

Sin tocar el ratón, el atajo de la nota rápida (⌃⌥N en el Mac y Ctrl+Alt+N en los demás ordenadores, salvo que se cambie en Ajustes › Atajos) abre un diálogo con el cursor en el texto y elegido el scratchpad que está a la vista. Si la búsqueda está abierta, se cierra para dejarle sitio. Alt+1 a Alt+5 eligen el color en el orden de la pantalla (azul, verde, amarillo, naranja y morado); Tab lleva a los colores y las flechas pasan de uno a otro. Enter añade la nota y cierra el diálogo, Mayús+Enter salta de línea y Escape lo cierra sin añadir nada. Al cerrarse, el teclado vuelve a donde estaba (al terminal si venía de la búsqueda).

### La nota rápida se añade como cualquier otra
<!-- capability: scratchpads; requirement: a-quick-note-is-added-like-any-other -->

La nota rápida va la última del scratchpad elegido, igual que una escrita al pie: con los mismos límites, el mismo contador de caracteres y la ventana que estaba abierta. Después, el dispositivo pasa a enseñar ese scratchpad. Si no se puede añadir (por ejemplo, porque el scratchpad tiene 20 notas), el diálogo sigue abierto con el texto y explica por qué, para elegir otro color. Un texto vacío no añade nada.

### Límites de un scratchpad y de una nota
<!-- capability: scratchpads; requirement: limits-of-a-scratchpad-and-of-a-note -->

Cada scratchpad guarda como mucho 20 notas, y cada nota como mucho 4000 caracteres. Con 20 notas, el campo se desactiva y avisa de que está lleno. Si dos dispositivos añaden a la vez la nota que ocupa el último hueco, se guarda una y el otro dispositivo recibe un aviso de que el scratchpad está lleno. Una nota más larga de 4000 caracteres se rechaza con un aviso que lo explica, y el texto se queda en el campo para acortarlo.

### Editar una nota
<!-- capability: scratchpads; requirement: editing-a-note -->

Un clic en el texto de una nota la abre para editarla ahí mismo. Enter, o salir de la nota, guarda el cambio en todos los dispositivos; Mayús+Enter salta de línea y Escape deja la nota como estaba. Guardar una nota vacía la borra. Si el texto nuevo no se puede guardar (por ejemplo, porque pasa de 4000 caracteres), el panel dice por qué y la nota sigue abierta con lo escrito. Desde 3500 caracteres, la nota que se edita enseña el mismo contador que el campo de añadir.

### Fijar una nota
<!-- capability: scratchpads; requirement: pinning-a-note -->

Cada nota tiene un botón para fijarla, y la nota enseña si está fijada. Una nota fijada se queda en su scratchpad después de pegarla, para reutilizarla. El mismo botón la desfija, y el cambio se ve en todos los dispositivos.

### Borrar una nota
<!-- capability: scratchpads; requirement: deleting-a-note -->

Cada nota tiene un botón para borrarla, esté fijada o no. Desaparece de todos los dispositivos.

### Pegar una nota en el panel
<!-- capability: scratchpads; requirement: pasting-a-note-into-the-active-pane -->

Cada nota tiene un botón que escribe su texto en el panel activo de la ventana abierta, como un pegado y sin pulsar Enter, para repasarlo antes de enviarlo. Una nota de varias líneas llega entera a la entrada de Claude Code sin enviarse. Después de pegarla, la nota desaparece de todos los dispositivos, salvo que esté fijada, y en el ordenador el terminal recupera el teclado, así que Enter envía el texto. Sin una ventana abierta, como en la pantalla de inicio, el botón está desactivado. Si la máquina no responde, el panel avisa del error y la nota se queda. Si dos dispositivos pegan la misma nota a la vez, se pega una sola vez y el otro recibe un aviso de que ya se está pegando.

### La ventana de cada nota
<!-- capability: scratchpads; requirement: a-note-remembers-the-window-it-was-added-in -->

Una nota que se añade con una ventana abierta recuerda esa ventana y la enseña bajo su texto, en una línea pequeña con la máquina, la sesión y la ventana (su número y su nombre), por ejemplo «Local · demo · 1 claude». Se ve igual en todos los dispositivos. Editar, fijar o pegar la nota no la cambia. Las notas añadidas desde la pantalla de inicio, y las guardadas antes de que existiera esta línea, no la tienen. Si la ventana se cierra justo mientras se añade la nota, la nota se guarda sin línea.

### Volver a la ventana de una nota
<!-- capability: scratchpads; requirement: the-window-line-opens-its-window -->

Mientras la ventana de una nota sigue abierta en la misma sesión, su línea enseña los nombres que tienen ahora la ventana y la sesión (si se renombra una de las dos, la línea lo refleja) y, al pulsarla, abre esa ventana; en el móvil, además, cierra el cajón de los scratchpads. Pegar no cambia: «Pegar» escribe la nota en la ventana abierta en ese momento, sea cual sea la ventana de la que vino.

### Una ventana cerrada sigue nombrada
<!-- capability: scratchpads; requirement: a-closed-window-stays-named -->

Cuando la ventana de una nota se cierra, o su máquina deja de responder, su línea conserva la máquina, la sesión y la ventana que tenía al añadir la nota, atenuada, en cursiva y sin abrir nada al pulsarla. Su descripción emergente dice si la ventana se cerró o si la máquina está sin conexión.

### Columna lateral en pantallas anchas
<!-- capability: scratchpads; requirement: scratchpads-sidebar-on-wide-screens -->

En una pantalla ancha, los scratchpads ocupan una columna a la derecha del panel, en todas las pantallas. La columna se pliega a una tira estrecha con los cinco colores; un clic en un color la despliega en ese scratchpad. El atajo de plegar los scratchpads (⌘. en el Mac y Ctrl+Shift+. en los demás ordenadores, salvo que se cambie en Ajustes › Atajos) la pliega o la despliega, y la descripción emergente de sus botones dice el atajo que tiene ese dispositivo. Cada dispositivo recuerda si la tenía plegada.

### Cajón en el móvil
<!-- capability: scratchpads; requirement: scratchpads-drawer-on-phones -->

En el móvil, los scratchpads se abren en un cajón deslizando desde el borde derecho de la pantalla, igual que la lista se abre desde el izquierdo. Sobre una tira que se desplaza de lado, como la barra de teclas, el gesto la desplaza mientras le quede recorrido, y abre el cajón cuando llega al final. Se cierra deslizándolo de vuelta, tocando fuera o con el botón atrás del móvil, sin salir de la página. Al pegar una nota desde el cajón, este se cierra y deja a la vista el terminal con el texto pegado.

## Atajos

### Los atajos del panel
<!-- capability: keyboard-shortcuts; requirement: the-panel-s-shortcuts-and-their-defaults -->

El panel atiende estos atajos antes de que la tecla llegue al terminal, así que no escriben nada en él:

| Atajo | Mac | Windows y Linux |
|---|---|---|
| Buscar una ventana | ⌘K | Ctrl+Shift+K |
| Plegar la lista | ⌘B | Ctrl+Shift+B |
| Plegar los scratchpads | ⌘. | Ctrl+Shift+. |
| Nota rápida | ⌃⌥N | Ctrl+Alt+N |
| Dictado | ⌃⇧Espacio | Ctrl+Shift+Espacio |

La nota rápida no usa ⌥N en el Mac porque esa combinación escribe la «ñ».

### Los atajos de número no cambian
<!-- capability: keyboard-shortcuts; requirement: the-number-shortcuts-stay-fixed -->

Ctrl+1…9 (la ventana N del espacio), Ctrl+Shift+1…9 (el espacio N) y Ctrl+Alt+Shift+1…9 (la máquina N) son los de tmux y no se cambian: Ajustes › Atajos los lista sin botón para cambiarlos.

### La sección «Atajos» de Ajustes
<!-- capability: keyboard-shortcuts; requirement: the-atajos-settings-section -->

Ajustes › Atajos lista todos los atajos del panel con su combinación, escrita como la nombra el teclado del dispositivo. Búsqueda, plegar la lista, plegar los scratchpads, nota rápida y dictado se cambian con «Cambiar» y pulsando la combinación nueva; «Restablecer» devuelve la combinación por defecto. Ajustes › Dictado nombra su atajo y lleva a «Atajos» para cambiarlo.

### Esperando la combinación nueva
<!-- capability: keyboard-shortcuts; requirement: waiting-for-a-new-combination -->

Mientras la sección espera una combinación, ningún atajo del panel actúa: pulsar el de la nota rápida no abre el diálogo, sino que se toma como la combinación nueva, o se rechaza si ya la usa otro. Escape deja de esperar sin cambiar nada.

### Dónde se guarda cada atajo
<!-- capability: keyboard-shortcuts; requirement: where-each-shortcut-is-kept -->

Los atajos de búsqueda, plegar y nota rápida se guardan en cada dispositivo, así que un ordenador puede usar teclas distintas de otro; uno que nunca los cambió usa los de su tipo (Mac o no). El del dictado lo guarda el servidor central y es el mismo en todos los dispositivos.

### Combinaciones que se rechazan
<!-- capability: keyboard-shortcuts; requirement: combinations-that-are-refused -->

La sección rechaza una combinación, dice por qué y deja la anterior cuando:

- escribiría en el terminal: no lleva Ctrl, Alt ni Cmd (F1–F12 sí valen solas);
- es Ctrl con una letra y nada más, que es del terminal (Ctrl+C, Ctrl+R…);
- es Ctrl con un número, reservado a los atajos de número;
- es Alt con un número del 1 al 5 y nada más, que elige el color en la nota rápida;
- otro atajo del panel ya la usa en ese dispositivo, incluido el del dictado.

«Restablecer» se rechaza igual cuando otro atajo ya usa la combinación por defecto: el aviso dice cuál y desaparece cuando ese atajo cambia.

## Notificaciones

### Cuándo cuentas como que estás mirando
<!-- capability: push-notifications; requirement: only-a-terminal-showing-the-pane-counts-as-looking-at-it -->

Cuando Claude Code pregunta, pide permiso o termina en un panel, la máquina le dice al servidor central si ya lo estás viendo, y entonces no llega notificación. Solo cuenta una terminal conectada a la máquina que tenga ese panel delante: en el Mac, con Ghostty a la vista; en Linux, si se ha usado en los últimos 2 minutos. Una terminal que muestra otra ventana, o que lleva más de 2 minutos sin usarse, no cuenta. La terminal web del panel nunca cuenta, aunque siga abierta con el móvil bloqueado o la pestaña en segundo plano: si la estás mirando, ya lo sabe el panel y no avisa.

### El ✅ de un panel terminado
<!-- capability: push-notifications; requirement: a-finished-pane-keeps-its-mark-unless-a-terminal-shows-it -->

Cuando Claude Code termina en un panel, su ventana muestra ✅ hasta que lo ves. Si en ese momento una terminal conectada a la máquina tiene el panel delante, se entiende que ya lo has visto y la ventana pasa directamente a 🤖. Tenerlo abierto solo en la terminal web no basta: el ✅ se queda.

### Por qué no llegó una notificación
<!-- capability: push-notifications; requirement: a-notice-the-hub-holds-back-leaves-a-log-line -->

Cada aviso que el servidor central recibe y no envía deja una línea `[push]` en su log con el motivo: ya lo has visto en la terminal, tienes el panel abierto en la web, tienes el panel a la vista en el dispositivo donde estás trabajando, o la máquina que avisa no está en el panel (por ejemplo, porque la renombraste o la quitaste). Así se puede saber por qué no llegó una notificación concreta.
