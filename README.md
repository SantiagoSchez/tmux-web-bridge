# tmux web bridge

Panel web (**twb**) para usar tus sesiones de tmux desde el móvil (y desde cualquier otro equipo), solo dentro de tu tailnet de Tailscale o de tu LAN.

- **Pendientes primero.** Los paneles de Claude Code que te esperan (🙋 pregunta, 💬 permiso, ✅ terminado) aparecen arriba, de todas las máquinas, igual que `prefix + g`.
- **Terminal completa.** xterm.js con barra de teclas (Ctrl y Alt fijos, prefijo de tmux, flechas, PgUp...). Cada pestaña del navegador tiene su propia ventana actual, así que navegar desde el móvil no mueve tu tmux del ordenador.
- **Control completo.** Crear, renombrar y cerrar spaces, ventanas y paneles; dividir y hacer zoom; reiniciar una máquina remota desde su menú (necesita `sudo shutdown` sin contraseña en ella).
- **Proyectos, como la función `c`.** En una máquina con `projects` en `config.yaml`, «Nuevo space» busca entre tus proyectos y atajos (o crea uno nuevo), abre el space en su carpeta y arranca claude. Si ese proyecto ya tiene space abierto, lo reutiliza; «Space vacío» abre uno normal.
- **Notificaciones push** al móvil (Android, Web Push) con el texto de la pregunta o de la respuesta, salvo que ya lo estés mirando.
- **Contador de conexiones activas** siempre visible: quién está conectado al panel, desde qué dispositivo y qué está mirando.
- **Varias máquinas** (macOS, Linux, WSL) desde un único servidor central, por SSH.

## Arquitectura

```
 móvil / PC ──HTTPS (tailscale serve, o tu proxy + contraseña)──▶ servidor central (Linux, :7681)
                                          │  Node + Fastify + node-pty
                                          ├── tmux local ............ (opcional)
                                          ├── ssh mac ──▶ tmux        (ControlMaster: una conexión por máquina)
                                          └── ssh wsl ──▶ tmux
 cada máquina: tmux-window-title.sh ──POST /api/notify──▶ servidor central ──Web Push──▶ móvil
```

- **Árbol de tmux:** el servidor central lee `tmux list-panes -a` de cada máquina cada segundo y envía los cambios a los navegadores por WebSocket. Los emojis son las opciones `@pane_icon`, `@win_icon` y `@space_icon` que pone `tmux-window-title.sh`.
- **Terminal:** un pty con `tmux new-session -t <space> -s _tw-xxxx` (una sesión agrupada). Se destruye sola al cerrar la pestaña (`destroy-unattached`). El tamaño de las ventanas lo marca el último cliente activo (`window-size latest`).
- **Avisos:** el script de cada máquina avisa al servidor central con el texto y con si lo estás viendo. Como respaldo, si un panel pasa a 🙋, 💬 o ✅ y ningún script avisa en 4 s, el servidor central notifica con las últimas líneas del panel.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `server/` | Servidor central (TypeScript, Fastify, node-pty, web-push) |
| `web/` | App web (Preact, xterm.js), instalable como PWA |
| `shared/` | Tipos compartidos por ambos |
| `host-kit/` | Kit de cada máquina (se instala desde un clon del repo): estados de Claude, spaces, status line, hooks e instalador |
| `deploy/` | Instalador del servidor central y servicio de systemd |

## Instalación

### 1. Servidor central (Linux siempre encendido)

Requisitos: Node.js 22 o posterior, `build-essential` y `python3` (para compilar node-pty), cliente `ssh`, Tailscale y systemd.

```sh
git clone <este repo> ~/tmux-web-bridge && cd ~/tmux-web-bridge
deploy/install-hub.sh
```

El instalador hace lo siguiente:
- compila el proyecto;
- crea `config.yaml` con un `notifyToken` aleatorio;
- genera la clave `~/.ssh/tmux-web-bridge_ed25519`;
- instala y arranca el servicio `systemctl --user status tmux-web-bridge`.

Al terminar imprime los siguientes pasos.

Luego:

1. Edita `config.yaml`: tus máquinas en `hosts` y tu usuario de Tailscale en `auth.allowedLogins`. Reinicia con `systemctl --user restart tmux-web-bridge`.
2. Para que arranque sin iniciar sesión: `sudo loginctl enable-linger $USER`.
3. Publica el panel en la tailnet: `sudo tailscale serve --bg 7681`. Queda en `https://<servidor>.<tu-tailnet>.ts.net`, con certificado válido, que es imprescindible para instalar la app y recibir notificaciones.

El servidor solo escucha en `127.0.0.1`: no es accesible desde fuera de `tailscale serve`.

### 1 bis. Alternativa: Docker con Tailscale como contenedor auxiliar

Si el servidor central va en un host con Docker (por ejemplo, un LXC de Proxmox), usa `Dockerfile` y `deploy/docker/`. Así se publica detrás de tu propio proxy inverso (nginx con tu certificado) y se entra con contraseña, de modo que funciona también desde la LAN sin Tailscale:

```sh
mkdir -p ~/docker/stacks/twb && cd ~/docker/stacks/twb
git clone <este repo> app
cp app/deploy/docker/compose.yaml .
mkdir -p data ssh tailscale/state && chmod 700 ssh
ssh-keygen -t ed25519 -N '' -C twb -f ssh/id_ed25519
cp app/config.example.yaml config.yaml          # máquinas, notifyToken, auth.method: password
docker compose run --rm -it twb node server/dist/index.js hash-password   # hash para auth.passwordHash
printf 'TS_HOSTNAME=mi-twb\nTS_AUTHKEY=tskey-auth-...\nTWB_BIND=10.0.0.5\n' > .env && chmod 600 .env
docker compose up -d --build
```

- **Publicación:** el puerto 7681 se publica en `TWB_BIND` (la IP desde la que llega tu proxy, nunca `0.0.0.0` sin cortafuegos). En el proxy, pasa `X-Forwarded-For` y `X-Forwarded-Proto`, admite WebSocket (`Upgrade`/`Connection`) y sube `proxy_read_timeout` (las terminales están horas abiertas). En `config.yaml`, `trustProxy` es la IP del proxy y `listen.host` es `0.0.0.0`.
- **Contraseña:** con `auth.method: password` el panel pide contraseña (hash scrypt en `auth.passwordHash`) y nunca lee las cabeceras de Tailscale. La sesión es una cookie `HttpOnly` que dura `auth.sessionDays` días sin usar el panel (30 por defecto); desde ⚙️ Ajustes › Sesión se cierra la de este dispositivo o todas. Tras 5 intentos fallidos desde una IP (o 20 en total) el login se bloquea 15 minutos.
- **Verificación en dos pasos (opcional):** en ⚙️ Ajustes › Verificación en dos pasos › Activar, escaneas el QR con una app de autenticación (Google Authenticator, 1Password, Authy…) y confirmas con un código. Desde entonces, al entrar se pide la contraseña y después el código de 6 cifras. Al activarla se muestran 10 códigos de recuperación de un solo uso (sirven en lugar del código si pierdes el móvil) y se cierran las sesiones de los demás dispositivos. Para desactivarla o generar códigos de recuperación nuevos hace falta un código válido. Si pierdes el autenticador y los códigos, borra `2fa.json` del `dataDir` del servidor central y vuelves a entrar solo con la contraseña.
- **Con `tailscale serve` en lugar de proxy:** deja `auth.method: tailscale`, `listen.host: 127.0.0.1`, quita `ports` y monta `serve.json` en el contenedor de Tailscale (`TS_SERVE_CONFIG`). Entonces el panel queda en `https://<TS_HOSTNAME>.<tu-tailnet>.ts.net` y solo se entra desde la tailnet, sin contraseña.
- El contenedor de Tailscale es un dispositivo propio de la tailnet en **modo userspace**, sin `/dev/net/tun`, y el servidor central comparte su red.
- **Acceso a las máquinas de la tailnet:** el servidor central entra a través del proxy SOCKS5 de ese contenedor. Añade en cada host de `config.yaml`: `sshOptions: ["ProxyCommand=nc -X 5 -x 127.0.0.1:1055 %h %p"]`.
- **Máquina en la misma LAN que el servidor central, con Tailscale apagado:** prueba primero su IP de LAN (resérvala en el DHCP del router) y, si no responde en 1 s, la tailnet. La clave de host se comprueba igual por los dos caminos, y en `authorized_keys` el `from=` debe admitir también la IP de LAN desde la que sale el servidor central:
  ```yaml
  sshOptions: ["ProxyCommand=sh -c 'nc -z -w 1 192.168.1.50 %p 2>/dev/null && exec nc 192.168.1.50 %p || exec nc -X 5 -x 127.0.0.1:1055 %h %p'"]
  ```
  El `sh -c` hace falta porque ssh antepone `exec` al ProxyCommand, y sin él la segunda opción nunca se ejecutaría.
- **Alta del dispositivo:** usa una **auth key** de un solo uso, no efímera y preaprobada. El login interactivo por URL no funciona en el contenedor: `containerboot` espera 60 s, se reinicia con otra clave de nodo y la URL caduca. Cada intento que llega a registrarse deja un nodo huérfano, y el siguiente sale como `<nombre>-1`.
- **Después del alta:** activa *Disable key expiry* para ese dispositivo en el admin de Tailscale (y *HTTPS Certificates* en la tailnet si usas `tailscale serve`).
- **Máquinas fuera de la tailnet:** pueden mandar sus avisos a un puerto aparte que solo atiende `/api/notify` (`notifyListen` en `config.yaml`). Con `auth.method: tailscale`, nunca publiques el panel en sí fuera de `tailscale serve`, porque fuera de la tailnet las cabeceras de identidad se pueden falsificar.

### 2. Acceso SSH a cada máquina

Añade la clave pública del servidor central a `~/.ssh/authorized_keys` de cada máquina, preferiblemente limitada a la IP de Tailscale del servidor central:

```
from="100.x.y.z" ssh-ed25519 AAAA... tmux-web-bridge
```

- **macOS:** usa el `sshd` del sistema (Ajustes › General › Compartir › Sesión remota, que ya tienes activo). En `config.yaml`, indica `tmux: /opt/homebrew/bin/tmux` si hiciera falta (el servidor central ya busca en Homebrew).
- **Linux:** `sudo apt install openssh-server`. Con systemd, activa además `sudo loginctl enable-linger <usuario>`: tmux 3.5 mete cada panel en un *scope* del gestor de servicios del usuario, y sin *linger* systemd lo para (con tus sesiones de tmux dentro) en cuanto se cierra la última conexión SSH, por ejemplo al reiniciar el servidor central.
- **WSL:** instala `openssh-server` dentro de la distro (por ejemplo, en el puerto 2222). Para que el servidor central llegue hasta ella, hay dos caminos:
  - instalar Tailscale dentro de WSL, que es lo más sencillo: la distro tiene su propia IP y nombre en la tailnet;
  - activar `networkingMode=mirrored` en `%UserProfile%\.wslconfig`, para que el `sshd` de WSL escuche en las interfaces de Windows, incluida la de Tailscale.

Comprueba desde el servidor central: `ssh -i ~/.ssh/tmux-web-bridge_ed25519 usuario@maquina tmux -V`. Hace falta tmux 3.2 o posterior.

### 3. Kit de cada máquina (estados de Claude, spaces y avisos al móvil)

En cada máquina con Claude Code, una sola vez:

```sh
git clone https://github.com/SantiagoSchez/tmux-web-bridge.git ~/tmux-web-bridge
~/tmux-web-bridge/host-kit/install.sh --hub https://<url-del-panel> --host <id-en-config.yaml> --token <notifyToken>
```

Una máquina fuera de la tailnet usa en `--hub` la URL del puerto de avisos (`notifyListen`).

El instalador deja la máquina lista para el panel. Enlaza al clon:
- `~/.scripts/tmux-window-title.sh`: estados de Claude (🙋 💬 ✅ 🔨 🤖) y avisos al servidor central;
- `~/.scripts/tmux-spaces.sh`: cada sesión es un space numerado (`@space_num`), con sus atajos;
- `~/.claude/scripts/statusline.sh`: la status line de Claude Code, compacta en paneles estrechos (el móvil) y completa en el ordenador; publica los límites de uso para la franja de arriba.

Y además:
- añade a `~/.tmux.conf` un `source-file` del `host-kit/tmux.conf` del clon: `mouse on` (scroll con el dedo), `set-clipboard on` (copiar), los hooks y los atajos de spaces;
- fusiona los hooks y la status line en `~/.claude/settings.json`, con lo que ya tengas;
- escribe `~/.config/tmux-web-bridge/notify.env` (URL, id y token: lo único propio de cada máquina, fuera del repo);
- instala los hooks de git `post-merge` y `post-rewrite` del clon.

Para actualizar: `git -C ~/tmux-web-bridge pull`. Los scripts son enlaces, así que quedan al día al momento, y el hook de git vuelve a aplicar el kit: recarga el `tmux.conf` en el tmux en marcha y fusiona los hooks de Claude si han cambiado. Puedes volver a ejecutar `install.sh` cuando quieras; con `--check` solo comprueba la conexión y el token.

Lo que hubiera antes en esas rutas se guarda en `.bak.<fecha>`. Si la ruta vive en una carpeta enlazada (dotfiles), el enlace al clon queda dentro de ella. Lo tuyo (tema, barra de estado, plugins, otros atajos) va en tu `~/.tmux.conf`; lo que ya trae el kit puedes quitarlo de ahí.

Atajos de spaces (prefijo de tmux + tecla):
- Shift+←/→: space anterior o siguiente; Shift+1…9: space N (distribución española: ! " · $ % & / ( ));
- g: el agente más urgente (🙋 > 💬 > ✅), repetido recorre el resto;
- N, R, X: nuevo space, renombrarlo, cerrarlo;
- sin prefijo, Ctrl+Shift+1…9 y Ctrl+Shift+N, si el terminal los manda como `\e[5;30001~`…`\e[5;30010~` (en Ghostty: `keybind = ctrl+shift+digit_1=text:\x1b[5;30001~`, etc.).

Opciones de `notify.env`:
- `PUSH_MIN_IDLE=60` (solo macOS): no avisa al móvil si has usado el teclado o el ratón del Mac en los últimos 60 s, porque ya te llega la notificación del Mac.

En Linux y WSL no hay notificación local; cuenta como «lo estás viendo» si algún cliente de tmux de esa sesión ha tenido actividad en los últimos 2 minutos.

### Límites de uso de Claude (5 h y semanal)

La franja de arriba del panel muestra los límites de uso de la cuenta, los mismos que la status line de Claude Code. Claude Code solo se los pasa a la status line (`rate_limits` en su JSON), así que es ella quien los publica en una opción global de tmux que lee el servidor central. La status line del kit ya lo hace; si instalas con `--skip-claude` y usas la tuya, añade esto después de leer el JSON en `$input`:

```bash
# Límites de uso para el panel web (tmux-web-bridge): "pct5h reset5h pct7d reset7d actualizado"
if [ -n "$TMUX" ]; then
  read -r P5 R5 P7 R7 < <(echo "$input" | jq -r '[(.rate_limits.five_hour.used_percentage // 0 | floor), (.rate_limits.five_hour.resets_at // 0), (.rate_limits.seven_day.used_percentage // 0 | floor), (.rate_limits.seven_day.resets_at // 0)] | @tsv')
  if [ "${R5:-0}" -gt 0 ]; then
    RL_OLD=$(tmux show-options -gqv @claude_rate_limits 2>/dev/null)
    [ "${RL_OLD% *}" = "$P5 $R5 $P7 $R7" ] || tmux set-option -gq @claude_rate_limits "$P5 $R5 $P7 $R7 $(date +%s)"
  fi
fi
```

Solo escribe cuando cambian. Con varias máquinas, el panel usa la lectura más reciente.

Si al ritmo de consumo reciente un límite llegaría al 100% antes de reiniciarse, a su lado sale «⚠ 100% en 1h20m». El ritmo se mide en los últimos 30 minutos para el de 5 h y en las últimas 6 horas para el semanal, hasta el momento actual: el rato sin Claude trabajando lo frena. El servidor central guarda las lecturas recientes en `dataDir/usage.json`.

A la izquierda de la franja, un resumen de los Claude de todas las máquinas: cuántos paneles hay en 🙋 pregunta, 💬 atención, ✅ terminado y 🔨 trabajando. Al pulsar uno vas al siguiente panel en ese estado.

### 4. En el móvil (Android)

1. Abre la URL del panel en Chrome (con Tailscale activo si entras por la tailnet) y, si lo pide, escribe la contraseña.
2. Menú › **Añadir a pantalla de inicio** (se instala como app).
3. ⚙️ **Ajustes › Notificaciones › Activar en este dispositivo**, y luego «Enviar prueba».

## Uso

- **Lista:** pendientes arriba; debajo, cada máquina (se pliega tocando su nombre) con sus spaces y ventanas. Cada space se pliega también como un acordeón (se recuerda en cada dispositivo); plegado, muestra los iconos de estado de sus ventanas. Cuando un panel pasa a pendiente, la lista se desplaza hasta él y su tarjeta pulsa unos segundos. Los nombres fijados a mano salen en naranja, como en tu barra de tmux.
- **Lista en el móvil dentro de una ventana:** desliza desde el borde izquierdo para abrirla como un cajón (con navegación por gestos de Android, empieza el gesto un poco hacia dentro: el canto es el gesto de «atrás»).
- **Ventana:**
  - Se abre en la terminal. Mientras la usas, la ventana de tmux toma el tamaño del móvil también en el ordenador (`window-size latest`); vuelve a su tamaño en cuanto escribes en el ordenador o cierras la ventana en el móvil.
  - Si la ventana tiene varios paneles, aparecen pestañas.
  - Desliza en la cabecera para cambiar de ventana dentro del space.
  - El botón ⏩ con un número salta al siguiente pendiente.
  - A−/A+ cambian el tamaño de letra (se recuerda en cada dispositivo).
- **Terminal:**
  - Desliza el dedo arriba y abajo para hacer scroll; tmux entra en modo copia y vuelve solo al llegar al final.
  - Mientras estás desplazado hacia arriba sale un botón flotante ↓ para volver al final: saca a tmux del modo copia o, en un programa a pantalla completa (Claude Code con `"tui": "fullscreen"`), le manda Ctrl+End.
  - Toca la terminal para sacar el teclado; al desplazar se esconde (lo escrito ya se ha enviado letra a letra).
  - «⏎ línea» hace un salto de línea sin enviar (`\n`, como Shift+Enter en Ghostty).
  - En el ordenador, los atajos son los de Ghostty: Cmd+←/→ inicio y final de línea, Cmd+⌫ borra la línea, Option+←/→ salta palabras, Option+⌫ borra la palabra, Shift+Enter salto de línea. Option escribe sus caracteres de macOS (`{ } [ ] \ | @ #` en teclado español), como con `macos-option-as-alt = false`.
  - **Copiar:** lo que seleccionas con el ratón en tmux llega al portapapeles del ordenador desde el que miras (OSC 52, con un aviso «Copiado»). Con Option+arrastrar seleccionas directamente en la terminal y copias con Cmd+C.
  - Al escribir con el teclado del móvil, cada letra se envía al momento, incluso mientras el teclado compone la palabra; las autocorrecciones llegan como borrar y reescribir.
  - Sin la barra de estado de tmux (`status off` solo en la sesión de la terminal web; la de tu terminal sigue igual): la lista de spaces y ventanas ya está en la app.
  - Usa JetBrains Mono con los símbolos de Nerd Fonts, servida por el propio panel (`web/public/fonts`, licencia OFL): los separadores Powerline de la barra de tmux y los iconos del prompt encajan en sus celdas en cualquier dispositivo.
- **Responder desde la notificación:** las de 🙋 y 💬 traen dos botones (la primera opción y la última, que suele ser «No»). Al pulsarlos, el servidor central vuelve a leer el panel y solo envía la tecla si sigue mostrando la misma pregunta; si no, abre la app en ese panel.
- **Tira de pendientes (móvil):** dentro de una ventana, los otros paneles pendientes (🙋 💬 ✅) aparecen encima de las teclas para saltar de uno a otro sin volver a la lista. En pantallas grandes no sale: ya están en la barra lateral.
- **Recargar ventana (↻, también en el menú ⋯):** reinicia cada panel de la ventana con una shell nueva en su directorio, que vuelve a cargar `.zshrc`. Si en el panel había un Claude, la shell nueva lo reabre con su conversación (`claude --resume <session_id>`, el que guardan los hooks), y al salir de él queda una shell limpia. Pide confirmación y avisa si algún Claude está trabajando, porque se interrumpiría. Sin el kit en esa máquina, solo reinicia la shell.
- **Silenciar mientras usas el ordenador:** en ⚙️ Ajustes de ese dispositivo, «Silenciar mientras uso este dispositivo». Con el permiso de detección de actividad del navegador (solo Chrome, Edge y Brave), la app avisa al servidor central de si has usado el teclado o el ratón en los últimos 5 minutos, en cualquier aplicación, con la pantalla desbloqueada. Mientras sea así, no se envía ninguna notificación push, de ninguna máquina. Necesita la app abierta, aunque sea en segundo plano: si el navegador descarta la pestaña (Ahorro de memoria de Chrome), vuelven los avisos. En 👥 Conexiones, ese dispositivo sale «en uso». A diferencia de `PUSH_MIN_IDLE`, vale para los avisos de todas las máquinas, no solo los del Mac.
- **Mandar ficheros a Claude:** con el botón 📎 (en la barra de teclas; en el móvil abre la galería, la cámara o los archivos), soltando ficheros sobre la ventana o pegando una captura con Cmd+V. Se guardan en `/tmp/twb-uploads` de la máquina del panel (hasta 25 MB cada uno, solo legibles por tu usuario) y su ruta se escribe en el panel, sin Enter: Claude Code convierte la ruta de una imagen en un adjunto y tú escribes el mensaje. Cmd+V solo sube si el portapapeles no trae texto.
- **Ir a una ventana (Cmd+K, en el Mac):** busca entre los spaces y ventanas de todas las máquinas por nombre, comando o carpeta; con ↑/↓ y Enter abres la que elijas. Lo pendiente (🙋 💬 ✅) sale primero.
- **Marcar como visto:** mirar un panel ✅ durante un momento lo marca como visto (🤖), igual que darle el foco en tmux.
- **Orden de las máquinas:** en el menú ⋯ de cada máquina, «Subir», «Bajar» y «Poner arriba del todo»; en el ordenador también se arrastra su cabecera. El servidor central guarda el orden (`host-order.json` en `dataDir`), así que es el mismo en todos los dispositivos; las máquinas que añadas después al `config.yaml` salen al final.
- **Atajos de teclado (como en tmux con Ghostty):** Ctrl+1…9 va a la ventana N del space actual y Ctrl+Shift+1…9 al space N (su número de la barra de spaces) de la máquina en la que estás; desde la lista, de la última en la que estuviste. Ctrl+Shift+Alt+1…9 cambia a la máquina N (en el orden de la lista) y vuelve a la última ventana que miraste en ella. Funcionan en la terminal y desde la lista, y mueven la app como un clic en la barra lateral: nunca llegan a tmux.
- **Conexiones:** el botón 👥 con un número muestra cada conexión abierta al panel, con su usuario y dispositivo de Tailscale (si entra por la tailnet), navegador, IP, desde cuándo y qué está mirando. Si hay más de una conexión, el botón se resalta.

## Seguridad

- **Dos formas de entrar, nunca mezcladas** (`auth.method`):
  - `tailscale`: solo por `tailscale serve`. El servidor rechaza peticiones sin la cabecera `Tailscale-User-Login` (salvo `allowWithoutTailscale`, solo para desarrollo) y limita los usuarios con `auth.allowedLogins`.
  - `password`: detrás de cualquier otro proxy. Contraseña con hash scrypt, sesiones con cookie `HttpOnly` (en disco solo se guarda el hash del token), límite de intentos fallidos, verificación en dos pasos opcional (TOTP, con el secreto en `dataDir/2fa.json` y solo el hash de los códigos de recuperación) y cierre de sesión remoto desde Ajustes, que corta al momento los WebSocket de las sesiones cerradas. Las cabeceras de Tailscale se ignoran, porque cualquiera podría mandarlas.
- Con contraseña, la app (HTML, JS, iconos) es pública para poder mostrar el login. La API y los WebSocket exigen sesión, y la regla se decide por la ruta que resuelve el servidor, no por el texto de la URL.
- Los WebSocket y los POST, incluido el login, deben venir del propio origen del panel: una web ajena abierta en tu navegador no puede usarlos en tu nombre.
- `/api/notify` exige el `notifyToken` (comparación en tiempo constante).
- El servidor central entra en las máquinas con su propia clave, que puedes limitar con `from=`.
- `config.yaml`, `notify.env` y las claves VAPID se guardan con permisos 600.

## Integración con tus dotfiles

Las terminales del panel crean sesiones `_tw-*` agrupadas con un space. Para que no cuenten como spaces, se filtran en estos sitios:
- `spaces.conf` (línea de spaces);
- `ctp_claude.conf` (contador de Claude);
- `tmux-spaces.sh` (numeración, `prefix + g`, guardado de tmux-resurrect);
- el árbol de `prefix + C-a`.

El servidor central elimina las que se queden huérfanas (por ejemplo, tras un reinicio).

## Desarrollo

```sh
pnpm install
cp config.example.yaml config.yaml   # con allowWithoutTailscale: true y un host local: true
pnpm --filter web build && ./restart-dev.sh     # servidor en http://127.0.0.1:7681 (log en server-dev.log)
pnpm --filter web dev                            # o la web con recarga en http://localhost:5173 (añádelo a allowedOrigins)
pnpm typecheck
```

Las notificaciones push necesitan HTTPS: para probarlas desde el móvil, usa `tailscale serve` también en desarrollo.

## Solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| Una máquina sale «sin conexión» | Pasa el ratón por «sin conexión» (en el móvil, tócalo) para ver el error de ssh; prueba `ssh` a mano desde el servidor central con la misma clave. |
| `posix_spawnp failed` | Permisos del `spawn-helper` de node-pty: `node scripts/fix-node-pty.mjs`. |
| No llegan notificaciones | Ajustes › Enviar prueba; comprueba `host-kit/install.sh --check` en la máquina; `journalctl --user -u tmux-web-bridge`. |
| 401 al abrir el panel | Con `auth.method: tailscale`, estás entrando sin `tailscale serve` (por IP o puerto directo). |
| «Demasiados intentos» al entrar | 5 contraseñas o códigos mal desde tu IP (o 20 en total) en 15 minutos. Espera o reinicia el servidor central. |
| «Código incorrecto» con el código recién generado | La hora del móvil o del servidor central va desfasada más de 30 s: sincronízalas. Cada código vale una sola vez. |
| 403 «Acceso denegado» | Tu usuario de Tailscale no está en `auth.allowedLogins`. |
