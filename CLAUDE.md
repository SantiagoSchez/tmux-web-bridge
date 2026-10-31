# tmux-web-bridge

## Despliegue

Cada push a `master` despliega el hub automáticamente (`.github/workflows/deploy.yml`, runner self-hosted con la etiqueta `twb`, que ejecuta `deploy/docker/deploy.sh`). Tarda menos de un minuto; se sigue con `gh run watch`.

- Al terminar una feature o un bugfix, haz commit y push directamente para desplegarlo, sin preguntar.
- Tras el push, sigue el run de `deploy` y avisa de si ha ido bien.
- Los cambios que solo tocan `**.md`, `host-kit/**`, `deploy/install-hub.sh` o `deploy/tmux-web-bridge.service` no lanzan el despliegue: dilo al hacer el push.
- El kit de `host-kit/` llega a cada máquina por git: la primera vez con `git clone` y `host-kit/install.sh`, y después siempre a una release, nunca a `master`: con el botón «Actualizar» del panel (aviso de versión o menú de la máquina), o a mano con `git fetch --tags && git checkout vX.Y.Z` en su clon (un hook de git vuelve a aplicarlo). El clon queda en HEAD separado, así que `git pull` ya no sirve. Un cambio en el kit no llega a las máquinas hasta la siguiente release: recuérdalo al hacer el push.

## Releases

Al terminar una feature (desplegada y comprobada), propón sacar una release: di qué versión tocaría y qué entraría, y sácala solo cuando el usuario diga que sí. Los bugfixes y retoques sueltos no lo piden por sí solos, pero entran en la siguiente. Versión SemVer en `VERSION` (la leen el hub y el `tmux.conf` del kit, que la publica en `@twb_kit_version`); el panel avisa cuando la última release de GitHub es más nueva que el hub o que el kit de alguna máquina.

1. Sube `VERSION` según lo que haya desde la última release (`git log v<anterior>..`): parche para arreglos, menor para funciones nuevas, mayor para cambios que obliguen a tocar la configuración o reinstalar.
2. Commit «Release X.Y.Z» y push (despliega el hub).
3. `git tag vX.Y.Z && git push origin vX.Y.Z`, y `gh release create vX.Y.Z --title vX.Y.Z --notes "…"` con las novedades en español, agrupadas, a partir de los commits.

## Pruebas

- `pnpm typecheck` y `pnpm test` antes de cada push.
- Si tocas la actualización del kit (`server/src/kit.ts`, `host-kit/install.sh`, `host-kit/tmux.conf`), pasa `scripts/test-kit-update.sh`. No lo pruebes a mano contra un clon o un tmux improvisados: `install.sh` usa el socket de tmux por defecto y un `HOME` falso no basta para aislarlo (así se ensució una vez el tmux real de esta máquina).
