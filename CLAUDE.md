@AGENTS.md

# tmux-web-bridge

The project's standards live under `docs/dev-standards/`; start at `docs/dev-standards/base-standards.md`.

## Flujo de trabajo

Se trabaja con el harness koalarnes (`.claude/koalarnes.json`): cada rama en su worktree (`/koalarnes:git-worktree`), commits en Conventional Commits con `/koalarnes:commit` y una entrada de changelog por cambio con `/koalarnes:changelog`. Las ramas salen de `master` y se nombran por su issue de GitHub (`feature/<n>-<slug>`); sin issue, con un slug libre.

- **Features**: siempre por OpenSpec (`/koalarnes:refine` → `/opsx:propose` → `/opsx:apply` → …), con los pasos obligatorios de `.claude/rules/koalarnes-mandatory-steps.md`, y acaban en una PR a `master`.
- **Bugfixes y retoques** (un texto, un estilo, un fallo pequeño): rama `bugfix/…` o `chore/…` en su worktree, con su entrada de changelog y una PR, sin artefactos de OpenSpec.
- **Revisión humana** (paso 8 de la regla): la hace el usuario, el único desarrollador. Abro la PR (en español), paso `/koalarnes:review-pr` y le pido que la revise; cuando dice que sí en el chat, archivo el change de OpenSpec si lo hay, y la fusiono yo con `gh pr merge <n> --squash --delete-branch --subject "<tipo>(<scope>): <asunto en inglés>"`, para que `master` siga lineal y en inglés. Nunca fusiono sin su sí.

## Despliegue

Cada push a `master` (también el merge de una PR) despliega el hub automáticamente (`.github/workflows/deploy.yml`, runner self-hosted con la etiqueta `twb`, que ejecuta `deploy/docker/deploy.sh`). Tarda menos de un minuto; se sigue con `gh run watch`.

- Tras fusionar una PR, sigue el run de `deploy` y avisa de si ha ido bien.
- Los cambios que solo tocan `**.md`, `host-kit/**`, `trello-extension/**`, `deploy/install-hub.sh` o `deploy/tmux-web-bridge.service` no lanzan el despliegue: dilo al fusionar.
- El kit de `host-kit/` llega a cada máquina por git: la primera vez con `git clone` y `host-kit/install.sh`, y después siempre a una release, nunca a `master`: con el botón «Actualizar» del panel (aviso de versión o menú de la máquina), o a mano con `git fetch --tags && git checkout vX.Y.Z` en su clon (un hook de git vuelve a aplicarlo). El clon queda en HEAD separado, así que `git pull` ya no sirve. Un cambio en el kit no llega a las máquinas hasta la siguiente release: recuérdalo al fusionar.

## Extensión de Trello

`trello-extension/` es la extensión de Chrome que lanza un Claude con una tarjeta de Trello por `/api/ext/*` (las rutas, en `server/src/index.ts`; su token, en `server/src/ext.ts`). Comparten los tipos `Ext*` de `shared/types.ts`: un cambio en la API toca los dos lados en el mismo commit. No se despliega: se construye con `pnpm --filter trello-extension build` y se recarga a mano en `chrome://extensions`. Al tocarla, recuérdalo. Su versión es la de `VERSION`.

## Releases

Al terminar una feature (fusionada, desplegada y comprobada), propón sacar una release: di qué versión tocaría (`ka changelog release --dry-run`) y qué entraría, y sácala solo cuando el usuario diga que sí. Los bugfixes y retoques sueltos no lo piden por sí solos, pero entran en la siguiente. Versión SemVer en `VERSION` (la leen el hub y el `tmux.conf` del kit, que la publica en `@twb_kit_version`); el panel avisa cuando la última release de GitHub es más nueva que el hub o que el kit de alguna máquina.

La release se saca con `/koalarnes:release` desde el checkout principal (en `master`): compila las entradas de `changelogs/unreleased/` en `CHANGELOG.md` (la versión sale de ellas: `added` sube la menor, un cambio rompedor la mayor, el resto el parche), reescribe la sección para quien usa el panel, escribe `VERSION`, hace el commit `chore(release): X.Y.Z` y su tag `vX.Y.Z`. Su paso 7 (publicar) cambia aquí, porque la extensión de Trello tiene que estar en la release antes de que el hub la anuncie:

1. Sube solo el tag: `git push origin vX.Y.Z`, sin `master` todavía.
2. `gh release create vX.Y.Z --draft --title vX.Y.Z --notes-file <fichero>` con la sección nueva de `CHANGELOG.md` (sin su encabezado `## X.Y.Z - fecha`). En borrador: el panel aún no la anuncia.
3. El tag lanza el workflow `trello-extension` (runner de GitHub), que adjunta al borrador la extensión construida, `twb-trello-extension-vX.Y.Z.zip`. Síguelo con `gh run watch`; si falla, se relanza con `gh workflow run trello-extension -f tag=vX.Y.Z`.
4. Con el `.zip` en la release, publícala: `gh release edit vX.Y.Z --draft=false`. Antes no: las máquinas con la extensión activada (Ajustes › Trello) la descargan al actualizar el kit.
5. Ahora sí, `git push origin master`: despliega el hub, que al arrancar ve la release ya publicada y avisa de los kits por actualizar. (Si se sube antes, el hub vuelve a mirar cada 2 minutos hasta que salga la release de su versión.)

`CHANGELOG.md` no se edita a mano: lo escribe `ka changelog release`. Las secciones hasta la 1.21.0 se copiaron de las notas de las releases de GitHub.

## Pruebas

- `pnpm typecheck` y `pnpm test` antes de cada push.
- Si tocas la actualización del kit (`server/src/kit.ts`, `host-kit/install.sh`, `host-kit/tmux.conf`), pasa `scripts/test-kit-update.sh`. No lo pruebes a mano contra un clon o un tmux improvisados: `install.sh` usa el socket de tmux por defecto y un `HOME` falso no basta para aislarlo (así se ensució una vez el tmux real de esta máquina).
