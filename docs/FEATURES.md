# Funcionalidades

Las funcionalidades del producto tal y como las ven sus usuarios y el equipo de producto. Cada sección sale de un requisito de las specs de OpenSpec de `openspec/specs/`, la redacta `/koalarnes:update-features` y lleva su ancla justo después del título:

```markdown
### <título>
<!-- capability: <capability>; requirement: <requirement-slug> -->
```

`ka features-check` falla cuando un requisito no tiene sección o una sección apunta a un requisito que no existe. Las áreas de `features.nonFeatureAreas` (como el índice de abajo) no necesitan ancla.

## Índice

- [Terminal](#terminal): enlaces en lo que escriben los agentes y Claude Code.
- [Worktrees](#worktrees): la rama de la que parte cada worktree nuevo.
- [Límites de uso](#límites-de-uso): de dónde salen los límites de cada cuenta en la franja del panel.
- [Scratchpads](#scratchpads): las notas para decirle después a Claude y cómo se pegan en un panel.

## Terminal

### Enlaces a pull requests, issues y pipelines
<!-- capability: terminal-links; requirement: repository-references-open-their-page -->

Cuando un agente escribe «PR #123», «Issue #42» o «pipeline #1987» en el terminal del panel, el texto se subraya y abre la página correspondiente del repositorio del proyecto en una pestaña nueva, con un clic o con un toque en el móvil. Funciona con GitHub y con Bitbucket. Da igual si la palabra va en mayúsculas o minúsculas, pero tiene que ir suelta: «SPR #12» o «PR#12» no se enlazan. Los pipelines solo se enlazan en Bitbucket, porque en GitHub Actions el número no basta para formar la dirección.

### De qué repositorio sale cada enlace
<!-- capability: terminal-links; requirement: the-pane-s-project-decides-the-repository -->

El panel toma el repositorio del `.claude/koalarnes.json` del proyecto en el que está el panel. Si el proyecto no tiene ese fichero, o el fichero no indica repositorio, usa el remoto `origin` de la carpeta. Una referencia que no se puede resolver, como una carpeta fuera de git o un remoto que no es de GitHub ni de Bitbucket, se queda como texto normal, sin subrayar. En una ventana partida, cada enlace usa el proyecto del panel en el que está escrito, no el del panel seleccionado.

### Enlaces a tarjetas de Trello
<!-- capability: terminal-links; requirement: trello-references-open-the-card -->

«Trello #470» abre la tarjeta número 470 del tablero que indica el `.claude/koalarnes.json` del proyecto. El panel busca la tarjeta con la cuenta de Ajustes › Trello. Si el proyecto no indica tablero, el texto no se subraya. Si la tarjeta no existe, o falta la cuenta de Trello o Trello la rechaza, la pestaña se cierra y el panel avisa del motivo; en el segundo caso, remite a Ajustes › Trello. Si el navegador bloquea la pestaña nueva, el panel también lo avisa.

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

La rama propuesta es la última que usaste: por tablero de Trello en la extensión y en el cajón de Trello, y por carpeta en «Nuevo worktree» (en cada dispositivo). Si no hay ninguna recordada, o la recordada ya no está en el remoto, propone la base del proyecto: `git.baseBranch` del `.claude/koalarnes.json` del repositorio o, si no lo tiene, la rama por defecto del remoto. Así, otro tablero empieza desde la base del proyecto aunque en el primero usaras `release/2.0`.

### El worktree parte de la rama elegida
<!-- capability: worktree-base; requirement: the-worktree-starts-from-the-chosen-base -->

El worktree arranca en la rama elegida tal y como está en el remoto, y su rama se llama como el worktree (`feature/14-login`). Si la máquina tiene un hook de Claude Code que crea los worktrees, el servidor central crea antes la rama desde la elegida y el hook la reutiliza al crear y preparar el worktree a su manera. Si no lo tiene, el servidor central crea el worktree en la carpeta del proyecto principal (también cuando el destino es otro worktree), copia los ficheros ignorados que seleccione `.worktreeinclude` y Claude Code arranca dentro. Sin rama base (por ejemplo, desde una extensión aún sin actualizar), el hook crea el worktree como antes y, sin hook, parte de la base del proyecto. Si el remoto no responde al lanzar, el worktree parte de la copia de la rama que ya tenía la máquina y se avisa.

### Automatizaciones con rama base
<!-- capability: worktree-base; requirement: an-automation-keeps-its-base-branch -->

Una automatización que se ejecuta en un worktree nuevo guarda su rama base y cada ejecución parte de ella. Si se guarda con «Base del proyecto», o es anterior a esta funcionalidad, cada ejecución se lanza sin rama base: si la máquina tiene un hook que crea los worktrees, decide él, y si no, parte de la base que tenga el proyecto en ese momento.

### Una rama que ya existe se reutiliza
<!-- capability: worktree-base; requirement: an-existing-branch-with-the-worktree-s-name-is-reused -->

Si el repositorio ya tiene una rama con el nombre del worktree, o la tiene el remoto aunque la máquina aún no la haya traído, el worktree usa esa rama tal cual (si la máquina no puede traerla, no se lanza nada y se avisa), sin aplicar la base elegida, y el panel o la extensión lo avisan después de lanzar. Si esa rama está abierta en otra carpeta, no se lanza nada y se avisa de dónde está, para que elijas otro nombre; si la carpeta de su worktree se borró a mano, el worktree se vuelve a crear. Si la rama base pedida no existe en el remoto, aunque la máquina aún guarde una copia antigua, no se lanza nada y se avisa de que esa rama no existe.

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

### Tres scratchpads compartidos
<!-- capability: scratchpads; requirement: three-scratchpads-shared-by-every-device -->

El panel tiene tres scratchpads para apuntar lo que quieres decirle después a Claude. No tienen nombre: se distinguen por su color (azul, verde y naranja), y un clic en un color enseña sus notas. Las notas se guardan en el servidor central, así que todos los dispositivos ven las mismas, un cambio en uno aparece en los demás sin recargar y siguen ahí después de reiniciar el servidor.

### Añadir una nota
<!-- capability: scratchpads; requirement: adding-a-note -->

Cada scratchpad tiene al pie un campo para escribir una nota de texto plano. Enter la guarda y Mayús+Enter salta de línea. La nota nueva va la última y sin fijar, y el campo dice cuántas notas tiene el scratchpad de las 10 posibles. Un texto vacío o solo con espacios no añade nada.

### Límite de 10 notas
<!-- capability: scratchpads; requirement: a-scratchpad-holds-at-most-10-notes -->

Cada scratchpad guarda como mucho 10 notas, y cada nota como mucho 4000 caracteres. Con 10 notas, el campo se desactiva y avisa de que está lleno. Si dos dispositivos añaden a la vez la nota que ocupa el último hueco, se guarda una y el otro dispositivo recibe un aviso de que el scratchpad está lleno. Una nota más larga de 4000 caracteres se rechaza con un aviso que lo explica.

### Editar una nota
<!-- capability: scratchpads; requirement: editing-a-note -->

Un clic en el texto de una nota la abre para editarla ahí mismo. Enter, o salir de la nota, guarda el cambio en todos los dispositivos; Mayús+Enter salta de línea y Escape deja la nota como estaba. Guardar una nota vacía la borra.

### Fijar una nota
<!-- capability: scratchpads; requirement: pinning-a-note -->

Cada nota tiene un botón para fijarla, y la nota enseña si está fijada. Una nota fijada se queda en su scratchpad después de pegarla, para reutilizarla. El mismo botón la desfija, y el cambio se ve en todos los dispositivos.

### Borrar una nota
<!-- capability: scratchpads; requirement: deleting-a-note -->

Cada nota tiene un botón para borrarla, esté fijada o no. Desaparece de todos los dispositivos.

### Pegar una nota en el panel
<!-- capability: scratchpads; requirement: pasting-a-note-into-the-active-pane -->

Cada nota tiene un botón que escribe su texto en el panel activo de la ventana abierta, como un pegado y sin pulsar Enter, para repasarlo antes de enviarlo. Una nota de varias líneas llega entera a la entrada de Claude Code sin enviarse. Después de pegarla, la nota desaparece de todos los dispositivos, salvo que esté fijada. Sin una ventana abierta, como en la pantalla de inicio, el botón está desactivado. Si la máquina no responde, el panel avisa del error y la nota se queda. Si dos dispositivos pegan la misma nota a la vez, se pega una sola vez y el otro recibe un aviso de que la nota ya no existe.

### Columna lateral en pantallas anchas
<!-- capability: scratchpads; requirement: scratchpads-sidebar-on-wide-screens -->

En una pantalla ancha, los scratchpads ocupan una columna a la derecha del panel, en todas las pantallas. La columna se pliega a una tira estrecha con los tres colores; un clic en un color la despliega en ese scratchpad. ⌘. en el Mac, y Ctrl+Mayús+. en los demás ordenadores, la pliega o la despliega. Cada dispositivo recuerda si la tenía plegada.

### Cajón en el móvil
<!-- capability: scratchpads; requirement: scratchpads-drawer-on-phones -->

En el móvil, los scratchpads se abren en un cajón deslizando desde el borde derecho de la pantalla, igual que la lista se abre desde el izquierdo. Se cierra deslizándolo de vuelta, tocando fuera o con el botón atrás del móvil, sin salir de la página. Al pegar una nota desde el cajón, este se cierra y deja a la vista el terminal con el texto pegado.
