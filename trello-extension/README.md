# Trello → twb

Extensión de Chrome que añade a cada tarjeta de Trello un botón para lanzar un Claude Code con ella en twb, sin salir del tablero. Vive en el repo de twb y se publica con sus mismas versiones: su versión es la del fichero `VERSION`.

Al pasar el ratón por una tarjeta aparece un botón con el icono de una terminal. Lo pulsas y eliges:

- **Máquina**: las de twb, con las que no están conectadas desactivadas.
- **Espacio**: el de la carpeta (si ya está abierto, la tarea va a una ventana nueva en él; si no, se crea el espacio) o uno de los espacios abiertos, donde se abre una ventana nueva.
- **Carpeta**: una de «Nuevo espacio» (⚙️ Ajustes › Carpetas en twb). Con un espacio abierto es opcional: sin ella, la ventana nueva se abre donde esté ese espacio.
- **Prompt**: sale de la plantilla del panel, en ⚙️ Ajustes › Trello (`Haz la tarjeta {url}` por defecto), y se puede retocar antes de lanzar.
- **En un worktree nuevo**: Claude arranca con `claude --worktree <nombre>`, que por defecto es el número y el título de la tarjeta (`142-arreglar-login-movil`) y se puede cambiar. Recuerda su último valor.
- **Saltar permisos**: arranca con `--dangerously-skip-permissions` en lugar de `--permission-mode auto`. Recuerda su último valor.

Con «Lanzar» (o Ctrl/Cmd+Enter):

1. twb abre la ventana, llamada como la tarjeta (o como el worktree), y escribe `claude … '<prompt>'`.
2. El panel mueve la tarjeta al final de la lista «Doing» de su tablero (la que se llame así, con emoji o sin él).
3. Y comenta en ella: «🤖 Lanzada en Mac › proyecto · ventana «…»».

El panel lo hace con su propia cuenta de Trello (⚙️ Ajustes › Trello): la extensión no habla con Trello. Si falla el paso 2 o el 3, la tarea ya está en marcha: sale un aviso y no se deshace nada. El diálogo recuerda la última máquina, el último espacio y la última carpeta de cada tablero.

## Instalación

1. Consíguela en la máquina donde usas Chrome. Lo más sencillo es que la ponga el kit: en el panel, ⚙️ **Ajustes › Trello › Instalarla en las máquinas**, activa esa máquina (necesita el kit 1.17.0 o posterior). La descarga en `~/.local/share/tmux-web-bridge/trello-extension`, y el panel te dice la carpeta. Si no, descarga `twb-trello-extension-vX.Y.Z.zip` de la [release de GitHub](https://github.com/SantiagoSchez/tmux-web-bridge/releases/latest) de la misma versión que tu servidor central y descomprímelo en una carpeta que vayas a conservar; o constrúyela: en la raíz del repo, `pnpm install && pnpm --filter trello-extension build`, que la deja en `trello-extension/dist/`.
2. En `chrome://extensions`, activa el **Modo de desarrollador**, pulsa **Cargar descomprimida** y elige esa carpeta (la que tiene `manifest.json`). Chrome la carga desde ahí cada vez.
3. Se abren las opciones (también con el icono de la extensión). Rellena:
   - **Dirección del panel de twb** y **token de la extensión**: el token se genera en el panel, en ⚙️ **Ajustes › Trello**, y solo se muestra una vez.
4. **Guardar y probar** pide permiso para llegar al panel y comprueba que el panel tenga cuenta de Trello: la API key y el token de un Power-Up tuyo ([trello.com/power-ups/admin](https://trello.com/power-ups/admin)) se ponen en el panel, en ⚙️ **Ajustes › Trello**. Hasta la 1.17 iban en las opciones de la extensión, que ya no los usa.

### Actualizarla

Con la máquina activada en el panel, cada actualización de su kit («Actualizar» en el panel, o un `git checkout` de la release en el clon) descarga la extensión de esa release en su carpeta. La extensión lo nota: su icono muestra **↑**, y su diálogo y sus opciones avisan con un botón que abre su tarjeta en `chrome://extensions`, donde se recarga con el botón de recargar. También se pone al día al reiniciar Chrome. No se recarga sola: en las pruebas, `chrome.runtime.reload()` dejaba la extensión desactivada.

A mano: descomprime el `.zip` de la release nueva encima de la misma carpeta (o `pnpm --filter trello-extension build`) y recárgala igual. Las opciones se conservan; después, recarga la pestaña de Trello. Una release nueva de twb puede cambiar la API (`/api/ext/*`): conviene actualizar a la vez el servidor central y la extensión.

## Cómo funciona

| Fichero | Qué hace |
| --- | --- |
| `src/content.ts` | En trello.com: el botón de cada tarjeta (`li[data-testid="list-card"]`, con el id en `data-card-id`) y el diálogo, en un shadow DOM que usa los tokens de color de Trello (tema claro y oscuro). |
| `src/background.ts` | El service worker: habla con twb (`/api/ext/*`, con `Authorization: Bearer`). Trello lo lleva el panel. |
| `src/options.ts` | La página de opciones. Todo se guarda en `chrome.storage.local`. |
| `src/logic.ts` | Lo que no depende del navegador; la plantilla, la lista Doing, los destinos y el comentario vienen de `shared/trello.ts`, que comparte con el panel. Con tests. |
| `src/types.ts` | Los tipos propios de la extensión. Los de la API de twb (`Ext*`) vienen de `shared/types.ts`, los mismos que usa el servidor central (`server/src/ext.ts`). |

La API está documentada en el [README de twb](../README.md#api-de-la-extensión-de-trello). El permiso para el panel se pide al guardar las opciones (`optional_host_permissions`), solo para su origen.

## Desarrollo

Desde la raíz del repo, `pnpm typecheck` y `pnpm test` la incluyen junto con el servidor y la web. Solo la extensión:

```sh
pnpm --filter trello-extension dev        # build en modo vigilancia
pnpm --filter trello-extension package    # build y twb-trello-extension-vX.Y.Z.zip, el de las releases
pnpm --filter trello-extension typecheck
pnpm --filter trello-extension test
```

Sus cambios no despliegan el servidor central (`trello-extension/**` está en los `paths-ignore` de `deploy.yml`), y la imagen de Docker no la construye.

Para probarla en un navegador headless contra un hub local, `TWB_EXTRA_HOSTS='http://127.0.0.1/*' pnpm --filter trello-extension build` concede de antemano el permiso del hub: un navegador sin pantalla no puede contestar al aviso de permisos.
