# tmux-web-bridge

## Despliegue

Cada push a `master` despliega el hub automáticamente (`.github/workflows/deploy.yml`, runner self-hosted con la etiqueta `twb`, que ejecuta `deploy/docker/deploy.sh`). Tarda menos de un minuto; se sigue con `gh run watch`.

- Al terminar una feature o un bugfix, haz commit y push directamente para desplegarlo, sin preguntar.
- Tras el push, sigue el run de `deploy` y avisa de si ha ido bien.
- Los cambios que solo tocan `**.md`, `host-kit/**`, `deploy/install-hub.sh` o `deploy/tmux-web-bridge.service` no lanzan el despliegue: dilo al hacer el push.
- El kit de `host-kit/` llega a cada máquina por git: la primera vez con `git clone` y `host-kit/install.sh`, y después con `git pull` en su clon (un hook de git vuelve a aplicarlo). Tras cambiar el kit, recuerda que hay que hacer pull en las máquinas.
