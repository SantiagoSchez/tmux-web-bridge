# Funcionalidades

Las funcionalidades del producto tal y como las ven sus usuarios y el equipo de producto. Cada sección sale de un requisito de las specs de OpenSpec de `openspec/specs/`, la redacta `/koalarnes:update-features` y lleva su ancla justo después del título:

```markdown
### <título>
<!-- capability: <capability>; requirement: <requirement-slug> -->
```

`ka features-check` falla cuando un requisito no tiene sección o una sección apunta a un requisito que no existe. Las áreas de `features.nonFeatureAreas` (como el índice de abajo) no necesitan ancla.

## Índice

- [Terminal](#terminal): enlaces en lo que escriben los agentes y Claude Code.

## Terminal

### Enlaces a pull requests, issues y pipelines
<!-- capability: terminal-links; requirement: repository-references-open-their-page -->

Cuando un agente escribe «PR #123», «Issue #42» o «pipeline #1987» en el terminal del panel, el texto se subraya y abre la página correspondiente del repositorio del proyecto en una pestaña nueva, con un clic o con un toque en el móvil. Funciona con GitHub y con Bitbucket. Da igual si la palabra va en mayúsculas o minúsculas, pero tiene que ir suelta: «SPR #12» o «PR#12» no se enlazan. Los pipelines solo se enlazan en Bitbucket, porque en GitHub Actions el número no basta para formar la dirección.

### De qué repositorio sale cada enlace
<!-- capability: terminal-links; requirement: the-pane-s-project-decides-the-repository -->

El panel toma el repositorio del `.claude/koalarnes.json` del proyecto en el que está el panel. Si el proyecto no tiene ese fichero, o el fichero no indica repositorio, usa el remoto `origin` de la carpeta. Una referencia que no se puede resolver, como una carpeta fuera de git o un remoto que no es de GitHub ni de Bitbucket, se queda como texto normal, sin subrayar.

### Enlaces a tarjetas de Trello
<!-- capability: terminal-links; requirement: trello-references-open-the-card -->

«Trello #470» abre la tarjeta número 470 del tablero que indica el `.claude/koalarnes.json` del proyecto. El panel busca la tarjeta con la cuenta de Ajustes › Trello. Si el proyecto no indica tablero, el texto no se subraya. Si la tarjeta no existe, o falta la cuenta de Trello o Trello la rechaza, la pestaña se cierra y el panel avisa del motivo; en el segundo caso, remite a Ajustes › Trello.

### Imágenes pegadas en Claude Code
<!-- capability: terminal-links; requirement: image-placeholders-open-the-pasted-image -->

Claude Code muestra cada imagen adjunta como «[Image #1]». En el panel ese texto abre la imagen en el visor de ficheros, tanto si el mensaje ya se ha enviado como si aún se está escribiendo. Con ratón, basta con dejarlo encima para ver una vista previa, igual que con las rutas de fichero. Si Claude Code reutiliza un número en la misma sesión, se abre la imagen más reciente. Cuando la imagen ya no está (por ejemplo, porque la máquina ha vaciado su carpeta temporal) o el panel no ejecuta Claude Code con el kit, el panel avisa de que no la encuentra.
