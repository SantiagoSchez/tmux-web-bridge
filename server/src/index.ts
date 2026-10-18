import { randomBytes, timingSafeEqual } from 'node:crypto';
import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { parseChoices } from '../../shared/choices.js';
import type { ClientMessage, NotifyRequest, RespondRequest, ServerMessage } from '../../shared/types.js';
import { runAction, runTitleScript } from './actions.js';
import { shq } from './exec.js';
import { clearSessionCookie, hashPasswordCli, LoginLimiter, readCookie, SessionStore, setSessionCookie, verifyPassword } from './auth.js';
import { loadConfig } from './config.js';
import { ConnectionRegistry } from './connections.js';
import { HostMonitor } from './host.js';
import { Notifier } from './notifications.js';
import { HostOrder } from './order.js';
import { PushService } from './push.js';
import { openTerminal } from './terminal.js';
import { TwoFactor } from './twofactor.js';
import { UsageHistory } from './usage.js';

if (process.argv[2] === 'hash-password') {
  await hashPasswordCli().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
  process.exit(0);
}

const config = loadConfig();
const passwordAuth = config.auth.method === 'password';
const sessions = new SessionStore(config.dataDir, config.auth.sessionDays);
const limiter = new LoginLimiter();
const twoFactor = new TwoFactor(config.dataDir);
const usage = new UsageHistory(config.dataDir);
const hosts = new Map(config.hosts.map((h) => [h.id, new HostMonitor(h, config)]));
const hostOrder = new HostOrder(config.dataDir, config.hosts.map((h) => h.id));
const conns = new ConnectionRegistry();
const push = new PushService(config);
const notifier = new Notifier(config, hosts, push, conns);

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'warn' }, trustProxy: config.trustProxy });
app.decorateRequest('sessionId', null);
await app.register(fastifyWebsocket, { options: { maxPayload: 1024 * 1024 } });

// ---------------------------------------------------------------- identity & auth

/** Tailscale serve encodes non-ASCII display names as RFC 2047 (=?utf-8?q?...?=). */
function decodeHeader(v: string | undefined): string | undefined {
  if (!v) return v;
  const m = /^=\?utf-8\?q\?(.*)\?=$/i.exec(v);
  if (!m) return v;
  try {
    return decodeURIComponent(m[1].replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, '%$1'));
  } catch {
    return v;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Password login this request belongs to (method "password"). */
    sessionId: string | null;
  }
}

function identify(req: FastifyRequest) {
  // Behind any proxy other than tailscale serve these headers could be forged.
  const login = passwordAuth ? undefined : (req.headers['tailscale-user-login'] as string | undefined);
  return {
    login,
    userName: passwordAuth ? undefined : decodeHeader(req.headers['tailscale-user-name'] as string | undefined),
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

/**
 * Browsers attach the tailnet identity to any request from your device, even
 * one made by another site's page. WebSockets and POSTs therefore must come
 * from this app's own origin.
 */
function sameOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (config.allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function tokenOk(req: FastifyRequest): boolean {
  const auth = req.headers.authorization ?? '';
  const got = Buffer.from(auth.replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(config.notifyToken ?? '');
  return config.notifyToken !== null && got.length === want.length && timingSafeEqual(got, want);
}

/** Reachable without a session (method "password"). */
const PUBLIC_API = new Set(['/api/session', '/api/login', '/api/logout', '/api/health']);

app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/notify')) {
    if (!tokenOk(req)) return reply.code(401).send({ error: 'token inválido' });
    return;
  }
  if (passwordAuth) {
    req.sessionId = sessions.check(readCookie(req));
    // Decided on the matched route, not the raw URL, so no spelling of a path slips past.
    // The app itself (static files: HTML, JS, icons) is public: it shows its own login screen.
    const route = req.routeOptions.url ?? '';
    const open = PUBLIC_API.has(route) || route === '/*' || route === '/';
    if (!open && !req.sessionId) return reply.code(401).send({ error: 'Inicia sesión' });
  } else if (typeof req.headers['tailscale-user-login'] === 'string' && req.headers['tailscale-user-login']) {
    const login = req.headers['tailscale-user-login'];
    if (config.auth.allowedLogins.length && !config.auth.allowedLogins.includes(login)) {
      return reply.code(403).send(`Acceso denegado para ${login}`);
    }
  } else if (!config.auth.allowWithoutTailscale) {
    return reply.code(401).send('Solo se puede acceder a través de tailscale serve');
  }
  if ((req.method === 'POST' || req.headers.upgrade) && !sameOrigin(req)) {
    return reply.code(403).send({ error: 'origen no permitido' });
  }
});

// ---------------------------------------------------------------- app websocket

const clients = new Map<string, WebSocket>();
/** Open sockets (app and terminals) of each password login, closed when it is revoked. */
const sessionSockets = new Map<string, Set<WebSocket>>();

function bindSession(req: FastifyRequest, ws: WebSocket): void {
  const id = req.sessionId;
  if (!id) return;
  const set = sessionSockets.get(id) ?? new Set<WebSocket>();
  set.add(ws);
  sessionSockets.set(id, set);
  ws.on('close', () => {
    set.delete(ws);
    if (!set.size) sessionSockets.delete(id);
  });
}

function closeSessions(ids: string[]): void {
  for (const id of ids) {
    for (const ws of sessionSockets.get(id) ?? []) ws.close(4401, 'Sesión cerrada');
    sessionSockets.delete(id);
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMessage): void {
  const json = JSON.stringify(msg);
  for (const ws of clients.values()) if (ws.readyState === ws.OPEN) ws.send(json);
}

for (const host of hosts.values()) {
  host.on('change', (info) => {
    broadcast({ t: 'host', host: info });
    if (info.limits && usage.add(info.limits)) broadcast({ t: 'usage', samples: usage.list });
  });
  host.on('transition', (t) => notifier.onTransition(t));
}
conns.on('change', (list) => broadcast({ t: 'connections', list }));

/**
 * A ✅ (done, unseen) pane looked at in the web app for a moment counts as seen,
 * as when tmux focuses it: the host script turns it into 🤖 and the pending list clears.
 */
function markSeen(connId: string, hostId: string, paneId: string): void {
  const host = hosts.get(hostId);
  if (!host || !/^%\d+$/.test(paneId) || host.findPane(paneId)?.pane.state !== 'done') return;
  setTimeout(() => {
    const c = conns.get(connId);
    if (!c?.visible || c.view?.host !== hostId || c.view.pane !== paneId) return;
    if (host.findPane(paneId)?.pane.state !== 'done') return;
    runTitleScript(host, 'focus', paneId)
      .then(() => setTimeout(() => void host.refresh(), 300))
      .catch(() => {});
  }, 1500);
}

/**
 * Types text into a pane as a paste: through a tmux buffer loaded from stdin (no
 * argument parsing, so a trailing ';' survives) and pasted with -p, so an app that
 * asked for bracketed paste (Claude Code, zsh) gets new lines as new lines instead
 * of one Enter per line.
 */
async function pasteText(host: HostMonitor, pane: string, text: string): Promise<void> {
  const buffer = `tw-${randomBytes(4).toString('hex')}`;
  await host.exec.run(['load-buffer', '-b', buffer, '-'], 10_000, text);
  await host.exec.run(['paste-buffer', '-p', '-r', '-d', '-b', buffer, '-t', pane]);
}

app.get('/ws', { websocket: true }, (ws, req) => {
  bindSession(req, ws);
  const conn = conns.add(identify(req));
  clients.set(conn.id, ws);
  send(ws, { t: 'welcome', clientId: conn.id, vapidPublicKey: push.publicKey });
  send(ws, { t: 'tree', hosts: hostOrder.list.map((id) => hosts.get(id)!.snapshot) });
  send(ws, { t: 'connections', list: conns.list() });
  send(ws, { t: 'usage', samples: usage.list });

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const host = 'host' in msg ? hosts.get(msg.host) : undefined;
    try {
      switch (msg.t) {
        case 'hello':
          conns.update(conn.id, { visible: msg.visible });
          break;
        case 'view':
          conns.update(conn.id, { view: msg.view, visible: msg.visible });
          if (msg.view?.pane && msg.visible) markSeen(conn.id, msg.view.host, msg.view.pane);
          break;
        case 'presence':
          conns.update(conn.id, { present: msg.present === true });
          break;
        case 'hostOrder':
          if (!Array.isArray(msg.hosts)) break;
          hostOrder.set(msg.hosts.map(String));
          broadcast({ t: 'hostOrder', hosts: hostOrder.list });
          break;
        case 'action': {
          if (!host) throw new Error('Máquina desconocida');
          const { id, t: _t, host: _h, ...op } = msg;
          const data = await runAction(host, op);
          await host.refresh();
          send(ws, { t: 'result', id, ok: true, data });
          break;
        }
      }
    } catch (err) {
      if (msg.t === 'action') send(ws, { t: 'result', id: msg.id, ok: false, error: (err as Error).message });
      else app.log.warn(err);
    }
  });

  ws.on('close', () => {
    clients.delete(conn.id);
    conns.remove(conn.id);
  });
});

app.get('/ws/term', { websocket: true }, (ws, req) => {
  bindSession(req, ws);
  const q = req.query as Record<string, string>;
  const host = hosts.get(q.host);
  if (!host) return ws.close(1008, 'máquina desconocida');
  openTerminal(ws, host, { session: q.session, window: q.window, pane: q.pane, cols: Number(q.cols), rows: Number(q.rows), clientId: q.client }, conns);
});

// ---------------------------------------------------------------- HTTP API

const UPLOAD_DIR = '/tmp/twb-uploads';
const UPLOAD_MAX = 25 * 1024 * 1024;
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: UPLOAD_MAX }, (_req, body, done) => done(null, body));

/** "20261017-190512-3fa2-captura.png": unique, and a plain name nobody has to quote in a shell or a prompt. */
function uploadName(raw: string | undefined): string {
  const base =
    (raw ?? '')
      .split(/[\\/]/)
      .pop()!
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .replace(/^\.+/, '')
      .slice(-80) || 'fichero';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${stamp}-${randomBytes(2).toString('hex')}-${base}`;
}

/**
 * A file for Claude (a screenshot from the phone...): saved on the pane's machine
 * and its path typed into the pane as a paste, without Enter. Claude Code turns a
 * pasted image path into an attachment.
 */
app.post('/api/upload', { bodyLimit: UPLOAD_MAX }, async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host || !/^%\d+$/.test(q.pane ?? '') || !Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Petición inválida' });
  if (!host.findPane(q.pane!)) return reply.code(404).send({ error: 'El panel ya no existe' });
  const path = `${UPLOAD_DIR}/${uploadName(q.name)}`;
  try {
    await host.exec.shell(`umask 077 && mkdir -p ${UPLOAD_DIR} && cat > ${shq(path)}`, 120_000, req.body);
    await pasteText(host, q.pane!, `${path} `);
  } catch (err) {
    return reply.code(502).send({ error: `No se pudo subir a ${host.name}: ${(err as Error).message}` });
  }
  console.log(`[upload] ${host.id} ${q.pane}: ${path} (${Math.round(req.body.length / 1024)} KB)`);
  return { path };
});

app.get('/api/health', async (req) =>
  passwordAuth && !req.sessionId
    ? { ok: true }
    : { ok: true, hosts: [...hosts.values()].map((h) => ({ id: h.id, status: h.snapshot.status, error: h.snapshot.error })) },
);

// ---------------------------------------------------------------- password login

app.get('/api/session', async (req, reply) => {
  if (!passwordAuth) return { method: 'tailscale', authenticated: true };
  // Each visit pushes the cookie's expiry forward, like the session's idle timer.
  if (req.sessionId) setSessionCookie(req, reply, readCookie(req)!, sessions.maxAgeSeconds);
  return { method: 'password', authenticated: !!req.sessionId, days: config.auth.sessionDays };
});

app.post('/api/login', async (req, reply) => {
  if (!passwordAuth) return reply.code(404).send({ error: 'Sin contraseña: se entra con Tailscale' });
  const wait = limiter.blocked(req.ip);
  if (wait) {
    reply.header('Retry-After', String(wait));
    return reply.code(429).send({ error: `Demasiados intentos. Prueba dentro de ${Math.ceil(wait / 60)} min.` });
  }
  const { password, code } = (req.body ?? {}) as { password?: unknown; code?: unknown };
  if (typeof password !== 'string' || !password || password.length > 1024 || !(await verifyPassword(password, config.auth.passwordHash!))) {
    limiter.fail(req.ip);
    console.warn(`[auth] contraseña incorrecta desde ${req.ip}`);
    return reply.code(401).send({ error: 'Contraseña incorrecta' });
  }
  if (twoFactor.enabled) {
    // The right password alone is not counted as a failure: the login form asks for the code next.
    if (typeof code !== 'string' || !code.trim()) return reply.code(401).send({ error: 'Falta el código', needCode: true });
    if (code.length > 64 || !twoFactor.verify(code)) {
      limiter.fail(req.ip);
      console.warn(`[auth] código de verificación incorrecto desde ${req.ip}`);
      return reply.code(401).send({ error: 'Código incorrecto', needCode: true });
    }
  }
  limiter.succeed(req.ip);
  const token = sessions.create({ ip: req.ip, userAgent: req.headers['user-agent'] });
  setSessionCookie(req, reply, token, sessions.maxAgeSeconds);
  console.log(`[auth] sesión iniciada desde ${req.ip}`);
  return { ok: true };
});

/** Ends this browser's login, or every login with { all: true }. */
app.post('/api/logout', async (req, reply) => {
  clearSessionCookie(reply);
  if (!passwordAuth || !req.sessionId) return { ok: true };
  const { all } = (req.body ?? {}) as { all?: boolean };
  const ids = all ? sessions.revokeAll() : [req.sessionId];
  if (!all) sessions.revoke(req.sessionId);
  console.log(`[auth] ${all ? 'todas las sesiones cerradas' : 'sesión cerrada'} desde ${req.ip}`);
  // Answer first: this request's own socket is among the ones being closed.
  setTimeout(() => closeSessions(ids), 100);
  return { ok: true };
});

// ---------------------------------------------------------------- two-step verification

/** Code of a 2FA settings request; a wrong one counts against the login limiter. */
function settingsCode(req: FastifyRequest, reply: FastifyReply): string | null {
  const wait = limiter.blocked(req.ip);
  if (wait) {
    reply.header('Retry-After', String(wait)).code(429).send({ error: `Demasiados intentos. Prueba dentro de ${Math.ceil(wait / 60)} min.` });
    return null;
  }
  const { code } = (req.body ?? {}) as { code?: unknown };
  if (typeof code === 'string' && code.trim() && code.length <= 64) return code;
  reply.code(400).send({ error: 'Escribe el código' });
  return null;
}

function wrongCode(req: FastifyRequest, reply: FastifyReply) {
  limiter.fail(req.ip);
  return reply.code(400).send({ error: 'Código incorrecto' });
}

app.get('/api/2fa', async (_req, reply) => {
  if (!passwordAuth) return reply.code(404).send({ error: 'Solo con contraseña' });
  return { enabled: twoFactor.enabled, recoveryLeft: twoFactor.recoveryLeft };
});

app.post('/api/2fa/setup', async (req, reply) => {
  if (!passwordAuth || !req.sessionId) return reply.code(404).send({ error: 'Solo con contraseña' });
  if (twoFactor.enabled) return reply.code(409).send({ error: 'Ya está activada' });
  return twoFactor.setup(req.sessionId, req.headers.host ?? 'twb');
});

/** Confirms the QR with a first code; every other login is closed and must use the code. */
app.post('/api/2fa/enable', async (req, reply) => {
  if (!passwordAuth || !req.sessionId) return reply.code(404).send({ error: 'Solo con contraseña' });
  const code = settingsCode(req, reply);
  if (code === null) return reply;
  const recoveryCodes = twoFactor.enable(req.sessionId, code);
  if (!recoveryCodes) return wrongCode(req, reply);
  closeSessions(sessions.revokeOthers(req.sessionId));
  console.log(`[auth] verificación en dos pasos activada desde ${req.ip}`);
  return { recoveryCodes };
});

app.post('/api/2fa/disable', async (req, reply) => {
  if (!passwordAuth) return reply.code(404).send({ error: 'Solo con contraseña' });
  const code = settingsCode(req, reply);
  if (code === null) return reply;
  if (!twoFactor.disable(code)) return wrongCode(req, reply);
  console.log(`[auth] verificación en dos pasos desactivada desde ${req.ip}`);
  return { ok: true };
});

app.post('/api/2fa/recovery', async (req, reply) => {
  if (!passwordAuth) return reply.code(404).send({ error: 'Solo con contraseña' });
  const code = settingsCode(req, reply);
  if (code === null) return reply;
  const recoveryCodes = twoFactor.regenerate(code);
  if (!recoveryCodes) return wrongCode(req, reply);
  console.log(`[auth] códigos de recuperación nuevos desde ${req.ip}`);
  return { recoveryCodes };
});

app.get('/api/push/status', async (req) => {
  const { endpoint } = req.query as { endpoint?: string };
  return { subscribed: endpoint ? push.has(endpoint) : false, devices: push.count };
});

app.post('/api/push/subscribe', async (req, reply) => {
  const { subscription } = (req.body ?? {}) as { subscription?: { endpoint: string; keys: { p256dh: string; auth: string } } };
  if (!subscription?.endpoint || !subscription.keys?.p256dh) return reply.code(400).send({ error: 'suscripción inválida' });
  const id = identify(req);
  push.subscribe(subscription, { login: id.login, userAgent: id.userAgent });
  return { ok: true };
});

app.post('/api/push/unsubscribe', async (req) => {
  const { endpoint } = (req.body ?? {}) as { endpoint?: string };
  if (endpoint) push.unsubscribe(endpoint);
  return { ok: true };
});

app.post('/api/push/test', async (req) => {
  const { endpoint } = (req.body ?? {}) as { endpoint?: string };
  const n = await push.send({ title: '🔔 twb', body: 'Las notificaciones funcionan', tag: 'test', url: '/' }, endpoint);
  return { ok: n > 0, sent: n };
});

async function handleNotify(req: FastifyRequest, reply: FastifyReply) {
  const body = (req.body ?? {}) as Partial<NotifyRequest>;
  if (!body.host || !body.pane || !['question', 'attention', 'done'].includes(body.state ?? '')) {
    return reply.code(400).send({ error: 'faltan host, pane o state' });
  }
  return notifier.onScriptNotify(body as NotifyRequest);
}
app.post('/api/notify', handleNotify);

/**
 * Answer button of a notification. The pane is read again and the key is only
 * sent if it still shows the very same menu: a late tap must never type a digit
 * into whatever replaced it.
 */
app.post('/api/respond', async (req, reply) => {
  const body = (req.body ?? {}) as Partial<RespondRequest>;
  const host = body.host ? hosts.get(body.host) : undefined;
  if (!host || !/^%\d+$/.test(body.pane ?? '') || !/^\d{1,2}$/.test(body.key ?? '') || !body.fingerprint) {
    return reply.code(400).send({ ok: false, error: 'petición inválida' });
  }
  const prompt = parseChoices(await host.exec.run(['capture-pane', '-p', '-J', '-t', body.pane!]).catch(() => ''));
  if (!prompt || prompt.fingerprint !== body.fingerprint || !prompt.choices.some((c) => c.key === body.key)) {
    return reply.code(409).send({ ok: false, error: 'la pregunta ya no está' });
  }
  await host.exec.run(['send-keys', '-t', body.pane!, body.key!]);
  console.log(`[respond] ${host.id} ${body.pane}: opción ${body.key}`);
  return { ok: true };
});

/**
 * Hosts outside the tailnet (other containers on the LAN) report through a
 * listener that only knows /api/notify: the panel itself is never exposed there,
 * since Tailscale identity headers could be forged off the tailnet.
 */
const notifyApp = config.notifyListen ? Fastify({ logger: false }) : null;
if (notifyApp) {
  notifyApp.post('/api/notify', async (req, reply) => {
    if (!tokenOk(req)) return reply.code(401).send({ error: 'token inválido' });
    return handleNotify(req, reply);
  });
}

// ---------------------------------------------------------------- static web app

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    setHeaders(res, path) {
      // The service worker and the shell must always be revalidated; hashed assets are immutable.
      if (/\/assets\//.test(path)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
      else res.header('Cache-Control', 'no-cache');
    },
  });
} else {
  app.get('/', async (_req, reply) => reply.type('text/plain').send('Falta compilar la web: pnpm --filter web build'));
}

// ---------------------------------------------------------------- start

for (const host of hosts.values()) host.start();
await app.listen({ host: config.listen.host, port: config.listen.port });
if (notifyApp && config.notifyListen) {
  await notifyApp.listen(config.notifyListen);
  console.log(`avisos de máquinas (solo /api/notify) en http://${config.notifyListen.host}:${config.notifyListen.port}`);
}
console.log(`tmux-web-bridge escuchando en http://${config.listen.host}:${config.listen.port} (${hosts.size} máquinas, config ${config.configPath})`);

/**
 * In Docker the hub shares the Tailscale container's network. If that container
 * restarts on its own, the hub keeps running in the old, dead network namespace
 * and the panel answers 502 forever. WATCHDOG_TCP=host:port (the sidecar's SOCKS5
 * proxy) is probed every 20 s; after 3 failures the process exits so Docker
 * restarts it inside the new namespace.
 */
if (process.env.WATCHDOG_TCP) {
  const [wHost, wPort] = process.env.WATCHDOG_TCP.split(':');
  let failures = 0;
  setInterval(() => {
    const sock = connect({ host: wHost, port: Number(wPort), timeout: 3000 });
    const done = (ok: boolean) => {
      sock.destroy();
      failures = ok ? 0 : failures + 1;
      if (failures >= 3) {
        console.error(`vigilante: ${process.env.WATCHDOG_TCP} no responde; saliendo para que Docker me reinicie`);
        process.exit(1);
      }
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
  }, 20_000).unref();
}

const shutdown = () => {
  for (const host of hosts.values()) host.stop();
  void Promise.all([app.close(), notifyApp?.close()]).then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
