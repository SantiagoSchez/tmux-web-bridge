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

Al crear un worktree, el panel pregunta de qué rama parte: en el paso «Nuevo worktree» de «Nuevo espacio» y de «Nueva ventana», en el cajón de Trello y en el diálogo de la extensión cuando se marca «En un worktree nuevo», y en las automatizaciones que se ejecutan cada vez en un worktree nuevo. La lista tiene las ramas de `origin` del repositorio del destino, leídas en su máquina después de actualizarlas desde el remoto, y cambia si cambias de destino. Si el remoto no responde, enseña las ramas que la máquina ya conocía y avisa de que no ha podido actualizarlas. Si la carpeta no es un repositorio git, lo dice y no deja lanzar en un worktree.

### Qué rama propone primero
<!-- capability: worktree-base; requirement: the-base-branch-offered-first-is-the-last-one-used -->

La rama propuesta es la última que usaste: por tablero de Trello en la extensión y en el cajón de Trello, y por carpeta en «Nuevo worktree» (en cada dispositivo). Si no hay ninguna recordada, o la recordada ya no está en el remoto, propone la base del proyecto: `git.baseBranch` del `.claude/koalarnes.json` del repositorio o, si no lo tiene, la rama por defecto del remoto. Así, otro tablero empieza desde la base del proyecto aunque en el primero usaras `release/2.0`.

### El worktree parte de la rama elegida
<!-- capability: worktree-base; requirement: the-worktree-starts-from-the-chosen-base -->

El worktree arranca en la rama elegida tal y como está en el remoto, y su rama se llama como el worktree (`feature/14-login`). Si la máquina tiene un hook de Claude Code que crea los worktrees, ese hook lo sigue creando y preparando a su manera; si no lo tiene, Claude Code arranca dentro de un worktree nuevo que crea el servidor central. Con la base del proyecto, o con una petición sin rama base (por ejemplo, de una extensión aún sin actualizar), el worktree se crea igual que antes.

### Automatizaciones con rama base
<!-- capability: worktree-base; requirement: an-automation-keeps-its-base-branch -->

Una automatización que se ejecuta en un worktree nuevo guarda su rama base y cada ejecución parte de ella. Si se guarda con «Base del proyecto», o es anterior a esta funcionalidad, cada ejecución parte de la base que tenga el proyecto en ese momento.

### Una rama que ya existe se reutiliza
<!-- capability: worktree-base; requirement: an-existing-branch-with-the-worktree-s-name-is-reused -->

Si el repositorio ya tiene una rama con el nombre del worktree, el worktree usa esa rama tal cual, sin aplicar la base elegida, y el panel o la extensión lo avisan después de lanzar. Si la rama base pedida no existe en el remoto, no se lanza nada y se avisa de que esa rama no existe.
