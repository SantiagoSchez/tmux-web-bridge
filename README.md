# tmux web bridge

Panel web (**twb**) para usar tus sesiones de tmux, y los agentes de Claude Code que corren en ellas, desde el móvil o desde cualquier otro equipo. Solo dentro de tu tailnet de Tailscale o de tu LAN.

![twb en el escritorio](docs/screenshots/escritorio.png)

<p align="center">
  <img src="docs/screenshots/movil-lista.png" alt="Lista de máquinas y pendientes en el móvil" width="300">
  &nbsp;&nbsp;
  <img src="docs/screenshots/movil-ventana.png" alt="Una ventana de tmux en el móvil" width="300">
</p>

- **Pendientes primero.** Los Claude que te esperan (🙋 pregunta, 💬 permiso, ✅ terminado) salen arriba, de todas las máquinas.
- **Vista de ventanas**: todas las ventanas abiertas en miniatura y en vivo, con sus paneles y titulada «space › ventana». Un toque abre la que quieras.
- **Terminal completa** (xterm.js) con barra de teclas para el móvil, editable en ⚙️ **Ajustes › Teclas** para todos los dispositivos: reordenas los botones arrastrándolos, les cambias el nombre, los quitas o creas los tuyos (una tecla con Ctrl/Alt, o un texto como `/clear` con o sin Enter). Cada pestaña tiene su propia ventana actual, así que navegar desde el móvil no mueve el tmux del ordenador.
- **Seleccionar y copiar con el dedo**: pulsación larga, asas para ajustar cada extremo y una lupa sobre el dedo. Al copiar (con el dedo, arrastrando en tmux o con Option+arrastrar y Cmd+C), los párrafos de Claude Code salen enteros: sin los saltos de línea que pone al ancho de la pantalla, sin la barra «▎» de las citas y sin su «●» ni su sangría. Si eso cambia algo, el aviso trae «Copiar tal cual» para copiar el texto como estaba.
- **Dictado sin salir de tu red**: mantienes pulsado 🎤 (o el atajo, Ctrl+Shift+Espacio por defecto) mientras hablas, sueltas y el texto aparece en el panel. En los ajustes eliges entre mantener o tocar y volver a tocar, y cambias el atajo. Lo transcribe Parakeet v3 en el servidor central, y un modelo local (Qwen3.5 4B) quita las muletillas y corrige los términos técnicos con lo que hay en la pantalla.
- **Control completo** de spaces, ventanas y paneles; «Nuevo space» abre un proyecto y arranca `claude` en él. Las carpetas que ofrece cada máquina se añaden en ⚙️ **Ajustes › Carpetas**, con un navegador de carpetas o escribiendo la ruta: una sola, o todas las que tenga dentro (siempre al día, y ahí se pueden crear proyectos nuevos). Ahí se elige también el comando que se escribe al abrir. Todo se guarda en el servidor central; si una config antigua tiene un bloque `projects`, el hub lo pasa a Ajustes la primera vez que arranca.
- **Notificaciones push** (Web Push) con el texto de la pregunta, y botones para responder desde la propia notificación.
- **Varias máquinas** (macOS, Linux, WSL) desde un único servidor central, por SSH.
- **Límites de uso** de Claude (5 h, semanal y el semanal de cada modelo) de todas tus cuentas, y quién está conectado al panel, siempre a la vista.
- **Cambiar de cuenta de Claude con un toque**: «Usar aquí» (o el menú de la cuenta) pasa el Claude Code de una máquina a otra cuenta, sin reiniciar los Claude que estén abiertos. Ver [Cuentas de Claude](#cuentas-de-claude).

## En el móvil

<table>
  <tr>
    <td align="center" width="33%"><a href="docs/videos/navegar.webm"><img src="docs/videos/navegar.webp" width="250" alt="Abrir un pendiente, cambiar de ventana deslizando la cabecera y de space desde el cajón lateral"></a></td>
    <td align="center" width="33%"><a href="docs/videos/responder.webm"><img src="docs/videos/responder.webp" width="250" alt="Responder a un permiso de Claude con las flechas y Enter de la barra de teclas"></a></td>
    <td align="center" width="33%"><a href="docs/videos/seleccionar.webm"><img src="docs/videos/seleccionar.webp" width="250" alt="Seleccionar texto con pulsación larga, la lupa y las asas, y copiarlo"></a></td>
  </tr>
  <tr>
    <td align="center"><b>Moverse</b><br>De un pendiente a su ventana, deslizar la cabecera para cambiar de ventana y el borde para abrir el cajón.</td>
    <td align="center"><b>Responder</b><br>Flechas y Enter de la barra de teclas para contestar a Claude.</td>
    <td align="center"><b>Seleccionar y copiar</b><br>Pulsación larga, lupa, asas y botón «Copiar».</td>
  </tr>
</table>

Toca un vídeo para verlo a más resolución (WebM).

## Cómo funciona

```
 móvil / PC ──HTTPS──▶ servidor central (Node + Fastify + node-pty, :7681)
                         ├── tmux local ........ (opcional)
                         └── ssh <máquina> ──▶ tmux    (una conexión por máquina)
 cada máquina: hooks de Claude ──POST /api/notify──▶ servidor central ──Web Push──▶ móvil
```

El servidor central lee el árbol de tmux de cada máquina cada segundo y lo manda a los navegadores por WebSocket. Cada terminal es una sesión de tmux agrupada (`_tw-*`) que se destruye al cerrar la pestaña. Los estados salen de las opciones `@pane_icon`/`@win_icon` que pone el kit de cada máquina.

| Carpeta | Contenido |
| --- | --- |
| `server/` | Servidor central (TypeScript, Fastify, node-pty, web-push) |
| `web/` | App web (Preact, xterm.js), instalable como PWA |
| `shared/` | Tipos compartidos |
| `host-kit/` | Kit de cada máquina: estados de Claude, spaces, status line, hooks e instalador |
| `deploy/` | Instalación del servidor central (systemd o Docker) |

## Instalación

### 1. Servidor central

Necesita un Linux siempre encendido. Hay dos formas:

- **Con systemd y `tailscale serve`** (Node.js 22+, `build-essential`, `python3`, `ssh`):
  ```sh
  git clone https://github.com/SantiagoSchez/tmux-web-bridge.git ~/tmux-web-bridge
  ~/tmux-web-bridge/deploy/install-hub.sh
  ```
  Compila, crea `config.yaml` con un `notifyToken` aleatorio, genera la clave SSH e instala el servicio de usuario. Después: pon tus máquinas en `config.yaml`, activa `sudo loginctl enable-linger $USER` y publica con `sudo tailscale serve --bg 7681`. Se entra con tu identidad de Tailscale, sin contraseña.
- **Con Docker, detrás de tu proxy y con contraseña** (por ejemplo, en un LXC de Proxmox). Así funciona también desde la LAN sin Tailscale:
  ```sh
  mkdir -p ~/docker/stacks/twb && cd ~/docker/stacks/twb
  git clone https://github.com/SantiagoSchez/tmux-web-bridge.git app
  cp app/deploy/docker/compose.yaml . && cp app/config.example.yaml config.yaml
  mkdir -p data ssh tailscale/state && chmod 700 ssh
  ssh-keygen -t ed25519 -N '' -C twb -f ssh/id_ed25519
  docker compose run --rm -it twb node server/dist/index.js hash-password   # → auth.passwordHash
  printf 'TS_HOSTNAME=mi-twb\nTS_AUTHKEY=tskey-auth-...\nTWB_BIND=10.0.0.5\n' > .env && chmod 600 .env
  docker compose up -d --build
  ```
  Tailscale va como contenedor auxiliar (modo userspace) y el servidor central entra a las máquinas por su proxy SOCKS5. Los detalles están comentados en `compose.yaml` y `config.example.yaml`. En el proxy, admite WebSocket y sube `proxy_read_timeout`, porque las terminales pasan horas abiertas.

### 2. Acceso SSH a cada máquina

Añade la clave pública del servidor central a `~/.ssh/authorized_keys` de cada máquina, limitada a su IP:

```
from="100.x.y.z" ssh-ed25519 AAAA... twb
```

Hace falta tmux 3.2 o posterior. En Linux, activa también `loginctl enable-linger`; sin él, systemd mata tus sesiones de tmux al cerrarse la última conexión SSH. En WSL, instala Tailscale dentro de la distro o usa `networkingMode=mirrored`.

### 3. Kit de cada máquina

En cada máquina con Claude Code:

```sh
git clone https://github.com/SantiagoSchez/tmux-web-bridge.git ~/tmux-web-bridge
~/tmux-web-bridge/host-kit/install.sh --hub https://<url-del-panel> --host <id-en-config.yaml> --token <notifyToken>
```

Enlaza los scripts de estados de Claude, de spaces y la status line; añade un `source-file` a tu `~/.tmux.conf`, fusiona los hooks en `~/.claude/settings.json` y guarda lo propio de la máquina en `~/.config/tmux-web-bridge/notify.env`. Lo que hubiera antes se guarda en `.bak.<fecha>`. Los enlaces son relativos y el `source-file` usa `~`, así que valen aunque `~/.scripts` o `~/.tmux.conf` vivan en unos dotfiles compartidos entre máquinas, siempre que todas tengan el clon en `~/tmux-web-bridge`. Si Claude Code usa otra carpeta de configuración, `--claude-dir` (o `CLAUDE_CONFIG_DIR` al instalar); se recuerda para las siguientes actualizaciones. Para actualizarlo, ver [Actualizaciones](#actualizaciones). Con `install.sh --check` se comprueba la conexión.

<details>
<summary>Usar tu propia status line en vez de la del kit</summary>

El panel saca los límites de uso de una opción global de tmux que publica la status line (Claude Code solo le pasa `rate_limits` a ella), con una entrada por cuenta separada por `;`: `pct5h reset5h pct7d reset7d actualizado email`. El email sale de `oauthAccount.emailAddress` en `.claude.json` y la barra muestra una fila por cuenta. Si instalas con `--skip-claude`, copia a la tuya el bloque «Límites de uso para el panel web» de [`host-kit/statusline.sh`](host-kit/statusline.sh), después de leer el JSON en `$input` y sacar de él `PCT_5H`, `RESET_5H`, `PCT_7D` y `RESET_7D`.
</details>

La status line del kit muestra los límites 5h/7d al final, salvo en un panel estrecho (el móvil, donde ya están en la franja de la app). Si la barra de tmux ya los muestra (por ejemplo, con un módulo de catppuccin), quítalos de la status line de todas las máquinas en ⚙️ **Ajustes › Máquinas › Límites en la status line**: el servidor central pone `@claude_limits_in_status` en el tmux de cada una y la vuelve a poner si tmux se reinicia, por encima de lo que diga su `~/.tmux.conf`.

### Cuentas de Claude

El servidor central guarda los inicios de sesión de tus cuentas de Claude. Con ellos lee el uso de todas, también de las que no tienen ningún Claude abierto, y puede pasar cualquier máquina de una cuenta a otra. Todo se gestiona desde la franja de límites:

- **Las cuentas que ya usas aparecen solas.** El servidor central mira por SSH con qué cuenta está Claude Code en cada máquina (al arrancar y cada 10 minutos) y se queda con ella. Para añadir otra, pulsa el nombre de una cuenta › **Añadir otra cuenta**: se abre el login de Claude en otra pestaña y pegas el código que muestra, como con `/login`.
- **«Usar aquí»**, con una ventana abierta, pasa el Claude Code de esa máquina a esa cuenta (en pantalla ancha; **●** marca dónde está en uso). El nombre de cada cuenta abre su menú: las máquinas donde está en uso, «Usar en» la máquina de la ventana abierta y «Usar en otra máquina…»; en el móvil, se cambia desde ahí. Los Claude abiertos siguen con la cuenta nueva sin reiniciarse: desde el siguiente mensaje (o en unos 30 segundos, en un Mac que guarde la sesión en el Llavero).
- **Un inicio de sesión vale para una sola máquina a la vez**, porque cada token de refresco de Claude solo se puede usar una vez: si dos copias del mismo login se renovaran por su lado, una dejaría a la otra sin sesión. Al cambiar, el login que tenía la máquina vuelve al servidor central como «sesión libre» y la máquina recibe una sesión libre de la cuenta nueva. Para tener la misma cuenta en dos máquinas a la vez hacen falta dos inicios de sesión con ella: si no hay ninguna libre, TWB te pide uno.
- **Qué toca en cada máquina**: la credencial (`~/.claude/.credentials.json`; en macOS, el ítem «Claude Code-credentials» del Llavero si Claude Code llega a él, y el mismo fichero si no) y `oauthAccount` en `~/.claude.json`, con los mismos bloqueos que usa Claude Code para que un cambio no se cruce con una renovación del token. Solo la carpeta de configuración por defecto (no `CLAUDE_CONFIG_DIR`). En macOS, el Llavero de inicio de sesión no se abre por SSH ni a un tmux arrancado fuera de la sesión gráfica, y Claude Code guarda entonces la sesión en ese fichero; el hub usa lo que encuentre: el Llavero si le contesta, el fichero si no. Un Claude abierto desde la sesión gráfica del Mac (fuera de tmux) lee antes el Llavero, así que puede seguir con la cuenta que haya allí.
- **Dónde se guardan**: en `accounts.json`, dentro de `dataDir` del servidor central, legible solo por su usuario. El uso se consulta como mucho cada 5 minutos por cuenta, para no pasarse del límite de peticiones de Anthropic.

### 4. En el móvil (Android)

Abre la URL del panel en Chrome, **Añadir a pantalla de inicio**, y en ⚙️ **Ajustes › Dispositivo › Notificaciones**.

### 5. Dictado (opcional)

Se activa en ⚙️ **Ajustes › Dictado** y vale para todos los dispositivos. Todo corre en CPU en tu servidor central:

- **Transcripción**: Parakeet TDT 0.6B v3 (sherpa-onnx) dentro del propio servidor. Se descarga en `data/models` la primera vez (unos 670 MB), ocupa ~1 GB de RAM y transcribe 30 s de audio en unos 2 s con 4 hilos.
- **Limpieza** (opcional): Qwen3.5 4B Q4_K_M detrás de llama-server, unos 3 GB de RAM. Con Docker es el servicio `llm` de `compose.yaml` (`docker compose up -d llm`). Sin Docker, arranca tú `llama-server -hf unsloth/Qwen3.5-4B-GGUF:Q4_K_M --jinja` y pon su URL en `dictation.llmUrl` de `config.yaml`. Tarda unos segundos por dictado; si pasa del tiempo máximo que elijas en Ajustes (10 s por defecto), el texto va tal y como se oyó. El glosario viene con términos habituales de Claude Code, git y Docker, y se edita ahí mismo.

Los modelos más pequeños (Qwen3.5 0.8B y 2B) se probaron con dictados en español y no sirven para esto: el 0.8B cambia el sentido de las frases y el 2B casi no limpia. El navegador necesita HTTPS para usar el micrófono.

## Actualizaciones

La versión está en [`VERSION`](VERSION) y cada una se publica como release en GitHub. Una vez al día el servidor central consulta la última release (solo hace esa petición, no envía ningún dato) y, si es más nueva que él o que el kit de alguna máquina, el panel lo avisa con una franja arriba que se queda hasta que la cierras. Cerrada, no vuelve hasta la siguiente release. Se desactiva para todos los dispositivos en ⚙️ **Ajustes › Máquinas › Buscar actualizaciones**.

Para actualizar el servidor central, `git pull` en su clon y otra vez `deploy/install-hub.sh` (o reconstruir la imagen de Docker).

El kit de las máquinas se actualiza desde el propio panel: con el botón **Actualizar** del aviso, o con **Actualizar el kit a vX.Y.Z** en el menú de cada máquina. Tras confirmar, el servidor central entra en ella por el mismo SSH de siempre, pasa el clon a la última release (`git fetch --tags` y `git checkout vX.Y.Z`, que deja el clon en HEAD separado), vuelve a aplicar el kit y recarga su `tmux.conf`. Nunca fuerza nada: con cambios locales en el clon, no lo toca. No se cierra ningún space y los Claude abiertos no se reinician. A mano es lo mismo, en el clon:

```sh
git fetch --tags && git checkout vX.Y.Z   # un hook de git vuelve a aplicar el kit
```

Con el clon en una release, `git pull` ya no funciona («You are not currently on a branch»).

## Seguridad

- Dos formas de entrar, nunca mezcladas (`auth.method`):
  - `tailscale`: solo por `tailscale serve`, con la cabecera `Tailscale-User-Login` y la lista `auth.allowedLogins`.
  - `password`: detrás de cualquier otro proxy, con hash scrypt, cookie `HttpOnly`, límite de intentos, verificación en dos pasos opcional (TOTP) y cierre remoto de sesiones. Las cabeceras de Tailscale se ignoran.
- La API y los WebSocket exigen sesión y mismo origen; `/api/notify` exige el `notifyToken`.
- El servidor central entra en las máquinas con su propia clave, limitable con `from=`. `config.yaml`, `notify.env` y las claves VAPID se guardan con permisos 600.

## Desarrollo

```sh
pnpm install
cp config.example.yaml config.yaml   # con allowWithoutTailscale: true y un host local: true
pnpm --filter web build && ./restart-dev.sh     # http://127.0.0.1:7681 (log en server-dev.log)
pnpm typecheck
pnpm test
scripts/test-kit-update.sh   # «Actualizar el kit» de punta a punta, aislado (HOME, git y tmux temporales)
```

## Solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| Una máquina sale «sin conexión» | Pasa el ratón (o toca) «sin conexión» para ver el error de ssh, y prueba `ssh` a mano desde el servidor central. Sus spaces dejan de mostrarse al minuto sin respuesta, porque ya no se sabe qué tiene abierto. |
| No llegan notificaciones | ⚙️ Ajustes › Dispositivo › Enviar prueba; `host-kit/install.sh --check` en la máquina. |
| 401 al abrir el panel | Con `auth.method: tailscale`, estás entrando sin `tailscale serve`. |
| «Código incorrecto» en la verificación en dos pasos | La hora del móvil o del servidor va desfasada más de 30 s. |
| `posix_spawnp failed` | Permisos del `spawn-helper` de node-pty: `node scripts/fix-node-pty.mjs`. |
