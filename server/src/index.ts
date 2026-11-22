import { randomBytes, timingSafeEqual } from 'node:crypto';
import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { parseChoices } from '../../shared/choices.js';
import { DEFAULT_COMMAND } from '../../shared/folders.js';
import { quietReason } from '../../shared/mute.js';
import { branchNameProblem } from '../../shared/worktree.js';
import type { AccountsInfo, ActivityAccount, ActivityEvent, HostInfo, ClaudeImageResult, DirListing, FilesError, GitDiffMode, ClientMessage, DictateResult, Automation, AutomationRun, ExtLaunchRequest, ExtLaunchResult, KitReport, MachinesInfo, NotifyRequest, RefContext, RespondRequest, SavedFolder, SavedHost, ScratchpadAddRequest, ScratchpadEditRequest, ScratchpadPasteRequest, Scratchpads, ScheduledMessage, ServerMessage, TrelloCardContext, TrelloCardUrl } from '../../shared/types.js';
import { AccountStore, NeedsLoginError } from './account-store.js';
import { AccountManager } from './accounts.js';
import { READ_ONLY_OPS, runAction, runTitleScript, type MachineFolders } from './actions.js';
import { shq, TmuxError } from './exec.js';
import { clearSessionCookie, hashPasswordCli, LoginLimiter, readCookie, SessionStore, setSessionCookie, verifyPassword } from './auth.js';
import { loadConfig, removeConfigHosts } from './config.js';
import { checkMachine as checkMachineData, authorizedKeyLine, hostConfig, hubKeyPath, MachineStore, publicKey } from './machines.js';
import { checkMachine, installKit, uninstallKit } from './kit.js';
import { ConnectionRegistry } from './connections.js';
import { Dictation, SAMPLE_RATE } from './dictation.js';
import { ExtTokenStore } from './ext.js';
import { hostTargets, launchTask, listBranches } from './tasks.js';
import { isCardRef, TrelloNotFoundError, TrelloService, TrelloSetupError } from './trello.js';
import { Automations } from './automations.js';
import { ScheduledError, ScheduledMessages } from './scheduled.js';
import { ActivityLog } from './activity.js';
import { FileError, findInReposScript, gitChanges, gitDiff, gitStat, listHostDir, paneFolders, parseRange, resolvePath, statHostFile, streamHostFile } from './files.js';
import { Heartbeat } from './heartbeat.js';
import { HostMonitor } from './host.js';
import { checkLimits, type LimitsCheck, SentLimits } from './limits-check.js';
import { Notifier } from './notifications.js';
import { HostOrder } from './order.js';
import { imageScript, isImageRef, parseImage } from './claude-image.js';
import { PreviewCache } from './preview.js';
import { contextScript, parseContext } from './project-refs.js';
import { PushService } from './push.js';
import { AccountRotation, rotationNotice } from './rotation.js';
import { originOf, ScratchpadError, ScratchpadStore } from './scratchpads.js';
import { SettingsStore } from './settings.js';
import { TempFolders } from './temp.js';
import { openTerminal } from './terminal.js';
import { TwoFactor } from './twofactor.js';
import { UpdateChecker } from './updates.js';
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
// The machines live in dataDir/hosts.json and are added and removed in the panel (see
// attachHost). A `hosts` block of the config moves there once, and out of the config if it can.
const machines = new MachineStore(config.dataDir);
let configHostsLeft = false;
if (config.configHosts.length) {
  if (machines.migrate(config.configHosts.map((c) => c.host))) {
    console.warn(`[config] las máquinas de «hosts» (${config.configHosts.length}) pasan al panel (${config.dataDir}/hosts.json)`);
  }
  const removed = removeConfigHosts(config.configPath);
  if (removed === 'removed') console.warn(`[config] quitado «hosts» de ${config.configPath}: las máquinas se editan en Ajustes › Máquinas`);
  configHostsLeft = removed === 'readonly';
  if (configHostsLeft) console.warn(`[config] ${config.configPath} es de solo lectura: quita «hosts» a mano (se ignora; las máquinas están en el panel)`);
}
const hosts = new Map<string, HostMonitor>();
const accounts = new AccountManager(new AccountStore(config.dataDir), hosts);
const hostOrder = new HostOrder(config.dataDir, () => [...hosts.keys()]);
const conns = new ConnectionRegistry();
const settings = new SettingsStore(config.dataDir);
const push = new PushService(config, () => quietReason(settings.value.mute, settings.value.quietHours, new Date()));
const notifier = new Notifier(config, hosts, push, conns);
const previews = new PreviewCache(hosts);
const updates = new UpdateChecker(config.dataDir);
const extTokens = new ExtTokenStore(config.dataDir);
const activity = new ActivityLog(config.dataDir);
// The automatic account switch (Ajustes › Máquinas): evaluated when an account's usage,
// a statusline reading or the settings change (see the handlers below).
const rotation = new AccountRotation({
  settings: () => settings.value.accountRotation,
  accounts: () => accounts.info,
  readings: () => [...checkNow().kept.values()].flat(),
  machines: () => hostOrder.list.map((id) => ({ id, status: hosts.get(id)?.snapshot.status ?? 'connecting' })),
  switchHost: (host, account) => accounts.switchHost(host, account),
  report: reportRotation,
});
const scratchpads = new ScratchpadStore(config.dataDir);
const trello = new TrelloService(config.dataDir);
// The folders of «Nuevo espacio» live in the hub now: a `projects` block becomes one, once.
const migrated = settings.migrateProjects(config.configHosts.map((c) => ({ id: c.host.id, projects: c.projects })));
for (const c of config.configHosts.filter((x) => x.projects)) {
  if (migrated.includes(c.host.id)) console.warn(`[config] ${c.host.id}: la carpeta de «projects» pasa a Ajustes › Carpetas, con sus subcarpetas`);
}
const dictation = new Dictation(config.dictation, config.dataDir);
dictation.setGlossary(settings.value.dictationGlossary);
dictation.setEnabled(settings.value.dictation);

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
  // The Trello extension: only its token, from any origin (a bearer token is no ambient
  // credential another site's page could ride on). Decided on the matched route.
  if ((req.routeOptions.url ?? '').startsWith('/api/ext/')) {
    if (!extTokens.check(req.headers.authorization)) return reply.code(401).send({ error: 'Token de la extensión inválido o revocado' });
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
/** Cuts the app and terminal sockets that died without closing (see heartbeat.ts). */
const heartbeat = new Heartbeat();
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

// ---------------------------------------------------------------- statusline readings, checked (limits-check.ts)

// The panel gets the machines without the statusline readings published under the
// wrong account, and the accounts with the machines that published them. Both depend
// on the machines and on the hub's readings of the accounts, so a change on either
// side re-sends the other when what the panel last got of it moved.

/** What every browser last got: each host's kept readings and every account's machines. */
const sent = new SentLimits();

function checkNow(): LimitsCheck {
  return checkLimits([...hosts.values()].map((h) => h.snapshot), accounts.info.list, Math.floor(Date.now() / 1000));
}

function hostView(info: HostInfo, check: LimitsCheck): HostInfo {
  const kept = check.kept.get(info.id);
  return info.limits && kept ? { ...info, limits: kept } : info;
}

function treeView(check: LimitsCheck): HostInfo[] {
  return hostOrder.list.map((id) => hostView(hosts.get(id)!.snapshot, check));
}

function accountsView(check: LimitsCheck, info: AccountsInfo = accounts.info): AccountsInfo {
  return { ...info, list: info.list.map((a) => ({ ...a, mislabelledOn: check.mislabelledOn.get(a.id) ?? [] })) };
}

function broadcastHost(info: HostInfo, check: LimitsCheck): void {
  const view = hostView(info, check);
  sent.sentHost(view.id, view.limits);
  broadcast({ t: 'host', host: view });
}

function broadcastTree(check: LimitsCheck): void {
  const list = treeView(check);
  for (const h of list) sent.sentHost(h.id, h.limits);
  broadcast({ t: 'tree', hosts: list });
}

function broadcastAccounts(check: LimitsCheck, info?: AccountsInfo): void {
  sent.sentAccounts(check);
  broadcast({ t: 'accounts', info: accountsView(check, info) });
}

/** A machine joins the hub: watched from now on (started once the hub listens, or at once after). */
function attachHost(saved: SavedHost): HostMonitor {
  const host = new HostMonitor(hostConfig(saved), config);
  host.limitsInStatusLine = settings.value.limitsInStatusLine;
  new TempFolders(host);
  let wasOk = false;
  host.on('change', (info: HostInfo) => {
    const check = checkNow();
    broadcastHost(info, check);
    if (sent.accountsChanged(check)) broadcastAccounts(check);
    let added = false;
    for (const l of check.kept.get(info.id) ?? []) added = usage.add(l) || added;
    if (added) broadcast({ t: 'usage', samples: usage.list });
    // A new statusline reading, or a machine that just connected (it may be due a switch).
    const connected = info.status === 'ok' && !wasOk;
    wasOk = info.status === 'ok';
    if (added || connected) void rotation.evaluate();
  });
  host.on('transition', (t) => {
    notifier.onTransition(t);
    activity.onTransition(t);
  });
  hosts.set(host.id, host);
  return host;
}

/** A machine leaves the hub (removed, or about to be replaced by its edited self). */
function detachHost(id: string): void {
  const host = hosts.get(id);
  if (!host) return;
  host.stop();
  host.removeAllListeners();
  host.exec.closeMaster();
  hosts.delete(id);
  sent.forget(id);
}

for (const saved of machines.list) attachHost(saved);
activity.on('add', (event: ActivityEvent) => broadcast({ t: 'activityAdd', event }));
scratchpads.on('change', (pads: Scratchpads) => broadcast({ t: 'scratchpads', pads }));
accounts.on('change', (info: AccountsInfo) => {
  const check = checkNow();
  broadcastAccounts(check, info);
  for (const id of sent.hostsChanged(check)) broadcastHost(hosts.get(id)!.snapshot, check);
  // The hub's readings feed the forecast too, keyed like the statusline's: by email,
  // so only when no other account shares it.
  let added = false;
  for (const a of info.list) {
    const u = a.usage;
    if (!u?.fiveHour || !u.sevenDay || info.list.some((b) => b !== a && b.email === a.email)) continue;
    added = usage.add({ fiveHour: u.fiveHour, sevenDay: u.sevenDay, updatedAt: u.t, account: a.email }) || added;
  }
  if (added) broadcast({ t: 'usage', samples: usage.list });
  void rotation.evaluate();
});
conns.on('change', (list) => broadcast({ t: 'connections', list }));
updates.on('change', (info) => broadcast({ t: 'updates', info }));
settings.on('change', (value) => {
  for (const host of hosts.values()) {
    host.limitsInStatusLine = value.limitsInStatusLine;
    void host.refresh();
  }
  dictation.setGlossary(value.dictationGlossary);
  dictation.setEnabled(value.dictation);
  broadcast({ t: 'settings', settings: value });
  void rotation.evaluate();
});

/** What the automatic account switch did on a machine: into «Actividad» and a push. */
function reportRotation(hostId: string, event: ActivityAccount): void {
  const hostName = hosts.get(hostId)?.name ?? hostId;
  activity.add({ kind: 'account', host: hostId, hostName, account: event });
  void push.send({ ...rotationNotice(hostName, event), tag: `account:${hostId}`, url: '/' });
}
dictation.on('change', (info) => broadcast({ t: 'dictation', info }));
updates.start();

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

/** A host's folders for «Nuevo espacio», what is typed into a space opened there, and whether its kit keeps the Trello extension. */
function machineFolders(host: HostMonitor): MachineFolders {
  return {
    folders: settings.value.folders[host.id] ?? [],
    command: settings.value.commands[host.id] ?? DEFAULT_COMMAND,
    save: (folders: SavedFolder[]) => settings.update({ folders: { [host.id]: folders } }),
    trelloExtension: settings.value.trelloExtension[host.id],
    saveTrelloExtension: (dir: string | null) => settings.setTrelloExtension(host.id, dir),
  };
}

// ---------------------------------------------------------------- automations

/** A task the hub launches on its own (an automation run, a scheduled message): its machine has to be in the panel and connected. */
async function launchOnHost(hostId: string, req: Omit<ExtLaunchRequest, 'host'>): Promise<ExtLaunchResult> {
  const host = hosts.get(hostId);
  if (!host) throw new Error(`No existe la máquina «${hostId}»`);
  if (host.snapshot.status !== 'ok') throw new Error(`${host.name} no está conectada`);
  const result = await launchTask(host, machineFolders(host), req);
  await host.refresh();
  return result;
}

const automations = new Automations(config.dataDir, {
  launch: (a, req) => launchOnHost(a.host, req),
  paneState: (hostId, pane) => {
    const ctx = hosts.get(hostId)?.findPane(pane);
    return ctx ? ctx.pane.state : undefined;
  },
});
automations.start();
// A run that did not launch says so on the phone: nobody is watching when it should have.
automations.on('run', (a: Automation, run: AutomationRun) => {
  const host = hosts.get(a.host);
  const hostName = host?.name ?? a.host;
  if (run.status === 'launched') {
    const win = run.pane ? host?.findPane(run.pane) : null;
    activity.add({ kind: 'launch', source: 'automation', host: a.host, hostName, space: win?.session.name, window: run.window, windowName: win?.window.name, pane: run.pane, text: a.name });
  } else {
    activity.add({ kind: run.status, source: 'automation', host: a.host, hostName, window: run.window, windowName: a.name, pane: run.pane, text: run.message });
  }
  if (run.status !== 'error') return;
  void push.send({ title: `⚠️ ${a.name}`, body: `La automatización no se ha podido lanzar: ${run.message ?? 'error'}`, tag: `automation:${a.id}`, url: '/' });
});

// ---------------------------------------------------------------- scheduled messages

const scheduled = new ScheduledMessages(config.dataDir, {
  launch: (m, req) => launchOnHost(m.host, req),
  check: (hostId, target) => {
    const host = hosts.get(hostId);
    if (!host) return `No existe la máquina «${hostId}»`;
    if (!(settings.value.folders[hostId] ?? []).some((f) => f.path === target.folder)) return `Esa carpeta no está entre las de ${host.name}`;
    return null;
  },
});
scheduled.start();
scheduled.on('change', (list: ScheduledMessage[]) => broadcast({ t: 'scheduled', list }));
// A message that did not launch says so on the phone, as an automation does: nobody is watching at its time.
scheduled.on('run', (m: ScheduledMessage) => {
  const host = hosts.get(m.host);
  const hostName = host?.name ?? m.host;
  if (m.status === 'launched') {
    const win = m.pane ? host?.findPane(m.pane) : null;
    activity.add({ kind: 'launch', source: 'scheduled', host: m.host, hostName, space: win?.session.name, window: m.window, windowName: win?.window.name, pane: m.pane, text: m.name });
    return;
  }
  activity.add({ kind: 'error', source: 'scheduled', host: m.host, hostName, windowName: m.name, text: m.message });
  void push.send({ title: `⚠️ ${m.name}`, body: `El mensaje programado no se ha podido lanzar: ${m.message ?? 'error'}`, tag: `scheduled:${m.id}`, url: '/' });
});

app.get('/ws', { websocket: true }, (ws, req) => {
  bindSession(req, ws);
  heartbeat.watch(ws);
  const conn = conns.add(identify(req));
  clients.set(conn.id, ws);
  send(ws, { t: 'welcome', clientId: conn.id, vapidPublicKey: push.publicKey });
  const check = checkNow();
  send(ws, { t: 'tree', hosts: treeView(check) });
  send(ws, { t: 'connections', list: conns.list() });
  send(ws, { t: 'usage', samples: usage.list });
  send(ws, { t: 'updates', info: updates.info });
  send(ws, { t: 'settings', settings: settings.value });
  send(ws, { t: 'machines', info: machinesInfo() });
  send(ws, { t: 'dictation', info: dictation.info });
  send(ws, { t: 'accounts', info: accountsView(check) });
  send(ws, { t: 'activity', events: activity.list.slice(0, 400) });
  send(ws, { t: 'scratchpads', pads: scratchpads.pads });
  send(ws, { t: 'scheduled', list: scheduled.list });

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const host = msg.t === 'action' ? hosts.get(msg.host) : undefined;
    try {
      switch (msg.t) {
        case 'hello':
          conns.update(conn.id, { visible: msg.visible });
          break;
        case 'ping':
          send(ws, { t: 'pong' });
          break;
        case 'view':
          conns.update(conn.id, { view: msg.view, visible: msg.visible });
          if (msg.view?.pane && msg.visible) markSeen(conn.id, msg.view.host, msg.view.pane);
          break;
        case 'presence':
          conns.update(conn.id, { present: msg.present === true });
          break;
        case 'pushEndpoint':
          conns.setPushEndpoint(conn.id, typeof msg.endpoint === 'string' && /^https:\/\/\S{1,2000}$/.test(msg.endpoint) ? msg.endpoint : null);
          break;
        case 'hostOrder':
          if (!Array.isArray(msg.hosts)) break;
          hostOrder.set(msg.hosts.map(String));
          broadcast({ t: 'hostOrder', hosts: hostOrder.list });
          break;
        case 'updateCheck':
          updates.setEnabled(msg.enabled === true);
          break;
        case 'updateDismiss':
          if (typeof msg.version === 'string') updates.dismiss(msg.version);
          break;
        case 'settings':
          if (msg.settings && typeof msg.settings === 'object') settings.update(msg.settings);
          break;
        case 'mute':
          settings.mute(msg.hours, Date.now());
          break;
        case 'unmute':
          settings.unmute();
          break;
        case 'action': {
          if (!host) throw new Error('Máquina desconocida');
          const { id, t: _t, host: _h, ...op } = msg;
          const data =
            op.op === 'launchTask'
              ? logLaunch(await launchTask(host, machineFolders(host), { ...op, prompt: op.prompt ?? '' }), 'panel', op.worktree)
              : op.op === 'listBranches'
                ? await listBranches(host, machineFolders(host), op.target)
                : await runAction(host, op, updates.info.latest?.version ?? null, machineFolders(host));
          if (!READ_ONLY_OPS.has(op.op)) await host.refresh();
          send(ws, { t: 'result', id, ok: true, data });
          break;
        }
        case 'account': {
          const { id, t: _t, ...op } = msg;
          send(ws, { t: 'result', id, ok: true, data: await accounts.run(op) });
          break;
        }
      }
    } catch (err) {
      if (msg.t === 'action' || msg.t === 'account') {
        send(ws, { t: 'result', id: msg.id, ok: false, error: (err as Error).message, code: err instanceof NeedsLoginError ? err.code : undefined });
      } else app.log.warn(err);
    }
  });

  ws.on('close', () => {
    clients.delete(conn.id);
    conns.remove(conn.id);
  });
});

app.get('/ws/term', { websocket: true }, (ws, req) => {
  bindSession(req, ws);
  heartbeat.watch(ws);
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

/** Five minutes of 16 kHz 16-bit mono. */
const DICTATE_MAX = 5 * 60 * SAMPLE_RATE * 2;
/** Too short to have anything to clean up ("Sí.", "La tercera."): typed as heard, without the wait. */
const CLEANUP_MIN_WORDS = 4;

/**
 * Dictation: what was said (16 kHz 16-bit mono PCM, converted by the browser) to text,
 * cleaned up by the local model with the glossary and the words on the pane's screen,
 * and typed into the pane as a paste, without Enter. A cleanup that fails or takes too
 * long leaves the transcript as heard.
 */
app.post('/api/dictate', { bodyLimit: DICTATE_MAX }, async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host || !/^%\d+$/.test(q.pane ?? '') || !Buffer.isBuffer(req.body) || req.body.length < 2) return reply.code(400).send({ error: 'Petición inválida' });
  if (!host.findPane(q.pane!)) return reply.code(404).send({ error: 'El panel ya no existe' });
  if (dictation.info.state !== 'ready') return reply.code(409).send({ error: 'El dictado no está listo' });

  // A Buffer may start at an odd offset of its pool: copied to read it as 16-bit samples.
  const bytes = new Uint8Array(req.body);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const t0 = Date.now();
  const heard = await dictation.transcribe(pcm);
  const t1 = Date.now();
  const result: DictateResult = { text: heard };
  if (!heard) return result;

  const s = settings.value;
  if (s.dictationCleanup === 'llm' && heard.split(/\s+/).length >= CLEANUP_MIN_WORDS) {
    if (dictation.info.llm === 'unset') result.fallback = 'unavailable';
    else {
      try {
        const screen = await host.exec.run(['capture-pane', '-p', '-J', '-t', q.pane!]).catch(() => '');
        result.text = await dictation.clean(heard, screen, s.dictationTimeout * 1000);
      } catch (err) {
        result.fallback = (err as Error).name === 'TimeoutError' ? 'timeout' : 'error';
        console.warn(`[dictado] limpieza fallida (${result.fallback}): ${(err as Error).message}`);
      }
    }
  }
  try {
    // A space after it, so the next dictation does not stick to this one.
    await pasteText(host, q.pane!, `${result.text} `);
  } catch (err) {
    return reply.code(502).send({ error: `No se pudo escribir en ${host.name}: ${(err as Error).message}` });
  }
  const secs = (pcm.length / SAMPLE_RATE).toFixed(1);
  console.log(`[dictado] ${host.id} ${q.pane}: ${secs} s de audio, transcrito en ${t1 - t0} ms, ${result.fallback ? `sin limpiar (${result.fallback})` : `listo en ${Date.now() - t0} ms`}`);
  return result;
});

/** Screens of every pane for the windows grid, polled while it is open (only what changed since `since`). */
app.get('/api/previews', async (req) => previews.get(Number((req.query as { since?: string }).since) || 0));

app.get('/api/health', async (req) =>
  passwordAuth && !req.sessionId
    ? { ok: true }
    : { ok: true, hosts: [...hosts.values()].map((h) => ({ id: h.id, status: h.snapshot.status, error: h.snapshot.error })) },
);

// ---------------------------------------------------------------- Trello extension

/** Settings › Trello: whether the extension has a token (only its hash is kept). */
app.get('/api/ext-token', async () => extTokens.info);
/** A new token for the extension, replacing the one there was. The only time it is shown. */
app.post('/api/ext-token', async () => {
  const token = extTokens.generate();
  console.log('[ext] token nuevo para la extensión de Trello');
  return { token, info: extTokens.info };
});
app.post('/api/ext-token/revoke', async () => {
  extTokens.revoke();
  console.log('[ext] token de la extensión de Trello revocado');
  return extTokens.info;
});

/** The extension checks its URL and token. */
app.get('/api/ext/ping', async () => ({ ok: true }));

/** Where the extension can launch a task: every machine's open spaces and folders. */
app.get('/api/ext/targets', async () => ({
  hosts: await Promise.all(hostOrder.list.map((id) => hosts.get(id)!).map((h) => hostTargets(h, machineFolders(h)))),
}));

/** The branches of origin of a launch target's repository (?host&session&folder&sub), for a new worktree's base. */
app.get('/api/ext/branches', async (req, reply) => {
  const q = req.query as Partial<Record<'host' | 'session' | 'folder' | 'sub', unknown>>;
  const host = typeof q.host === 'string' ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  const session = typeof q.session === 'string' && q.session ? q.session : undefined;
  const folder = typeof q.folder === 'string' && q.folder ? q.folder : undefined;
  const sub = typeof q.sub === 'string' && q.sub ? q.sub : undefined;
  if (!session && !folder) return reply.code(400).send({ error: 'Falta el destino' });
  try {
    return await listBranches(host, machineFolders(host), folder ? { folder, sub } : { session });
  } catch (err) {
    // A command that failed on the machine is its failure; anything else, a target it does not have.
    return reply.code(err instanceof TmuxError ? 502 : 400).send({ error: (err as Error).message });
  }
});

/**
 * A task from the extension or the panel's Trello drawer: launched and then, if it is about
 * a card, the card goes to Doing with a comment (warnings only: the task runs anyway). The
 * card is read while the task launches: its title asks the agent to rename its window.
 */
async function launchFromRequest(body: Partial<ExtLaunchRequest>, from: string): Promise<ExtLaunchResult> {
  const host = typeof body.host === 'string' ? hosts.get(body.host) : undefined;
  if (!host) throw new Error('Máquina desconocida');
  const card = typeof body.card === 'string' && body.card ? body.card : undefined;
  if (card && !trello.configured) throw new TrelloSetupError('El panel no tiene cuenta de Trello: añade la API key y el token en Ajustes › Trello.');
  const read = card ? trello.readCard(card) : undefined;
  const result = await launchTask(host, machineFolders(host), body as ExtLaunchRequest, { card: read?.then((r) => r.card ?? null) });
  await host.refresh();
  console.log(`[${from}] tarea en ${host.id} › ${result.space} (${result.window}${result.createdSpace ? ', espacio nuevo' : ''}${body.worktree ? `, worktree ${body.worktree}` : ''})`);
  if (read) result.trello = await trello.afterLaunch(await read, result);
  logLaunch(result, from === 'ext' ? 'extension' : 'trello', body.worktree);
  return result;
}

/** A task launched, in the activity. */
function logLaunch(r: ExtLaunchResult, source: NonNullable<ActivityEvent['source']>, text?: string): ExtLaunchResult {
  activity.add({ kind: 'launch', source, host: r.host, hostName: r.hostName, space: r.space, window: r.window, windowName: r.windowName, pane: r.pane, text: text || undefined });
  return r;
}

/** An error of a Trello route: one fixed in Settings › Trello says so (setup), for the extension to offer it. */
function trelloError(reply: FastifyReply, err: unknown) {
  const setup = err instanceof TrelloSetupError;
  return reply.code(setup ? 409 : 400).send({ error: (err as Error).message, setup });
}

app.post('/api/ext/launch', async (req, reply) => {
  try {
    return await launchFromRequest((req.body ?? {}) as Partial<ExtLaunchRequest>, 'ext');
  } catch (err) {
    return trelloError(reply, err);
  }
});

/** Whether the panel has a Trello account, for the extension's options. */
app.get('/api/ext/trello', async () => trello.info());

/** A card and the prompt template, for the extension's dialog. */
app.get('/api/ext/card/:id', async (req, reply) => {
  try {
    return { card: await trello.card((req.params as { id: string }).id), promptTemplate: settings.value.trelloPromptTemplate } satisfies TrelloCardContext;
  } catch (err) {
    return trelloError(reply, err);
  }
});

// ---------------------------------------------------------------- Trello in the panel

app.get('/api/trello', async (req) => trello.info((req.query as { fresh?: string }).fresh === '1'));

app.post('/api/trello', async (req, reply) => {
  const body = (req.body ?? {}) as { key?: unknown; token?: unknown };
  try {
    return await trello.set(body.key, body.token);
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }
});

app.post('/api/trello/forget', async () => trello.forget());

app.get('/api/trello/boards', async (_req, reply) => {
  try {
    return await trello.boards();
  } catch (err) {
    return trelloError(reply, err);
  }
});

app.get('/api/trello/boards/:id', async (req, reply) => {
  try {
    return await trello.lists((req.params as { id: string }).id);
  } catch (err) {
    return trelloError(reply, err);
  }
});

/** The page of card number n of a board, for a Trello #N link in the terminal. */
app.get('/api/trello/card-url', async (req, reply) => {
  const q = req.query as { board?: unknown; n?: unknown };
  const board = typeof q.board === 'string' ? q.board : '';
  const n = typeof q.n === 'string' ? q.n : '';
  if (!isCardRef(board, n)) return reply.code(400).send({ error: 'No se reconoce la tarjeta' });
  try {
    return { url: await trello.cardUrl(board, n) } satisfies TrelloCardUrl;
  } catch (err) {
    if (err instanceof TrelloSetupError) return trelloError(reply, err);
    if (err instanceof TrelloNotFoundError) return reply.code(404).send({ error: err.message });
    return reply.code(502).send({ error: (err as Error).message });
  }
});

app.post('/api/trello/launch', async (req, reply) => {
  try {
    return await launchFromRequest((req.body ?? {}) as Partial<ExtLaunchRequest>, 'trello');
  } catch (err) {
    return trelloError(reply, err);
  }
});

app.get('/api/automations', async () => automations.info);

/** A new automation (no id) or a change to one. */
app.post('/api/automations', async (req, reply) => {
  try {
    return automations.upsert(req.body);
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }
});

app.post('/api/automations/:id/delete', async (req, reply) => {
  try {
    automations.remove((req.params as { id: string }).id);
    return { ok: true };
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }
});

app.post('/api/automations/:id/run', async (req, reply) => {
  try {
    return await automations.runNow((req.params as { id: string }).id);
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message });
  }
});

app.get('/api/scheduled', async () => scheduled.list);

/** A new scheduled message (no id) or a change to a pending one. */
app.post('/api/scheduled', async (req, reply) => {
  try {
    return scheduled.upsert(req.body);
  } catch (err) {
    return reply.code(err instanceof ScheduledError ? err.status : 400).send({ error: (err as Error).message });
  }
});

/** Cancels a pending scheduled message, or removes a result. */
app.post('/api/scheduled/:id/delete', async (req, reply) => {
  try {
    scheduled.remove((req.params as { id: string }).id);
    return { ok: true };
  } catch (err) {
    return reply.code(err instanceof ScheduledError ? err.status : 400).send({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------- scratchpads

/** Runs a scratchpad change, answering a refusal with its status. Note texts are never logged. */
async function scratchpadRoute<T>(reply: FastifyReply, run: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ScratchpadError) return reply.code(err.status).send({ error: err.message });
    throw err;
  }
}

app.post('/api/scratchpads/notes', async (req, reply) => {
  const body = (req.body ?? {}) as Partial<Record<keyof ScratchpadAddRequest, unknown>>;
  // The window the panel showed: the hub names it from its own view, and drops one it does not know.
  const from = body.origin && typeof body.origin === 'object' ? (body.origin as Record<string, unknown>) : {};
  const host = typeof from.host === 'string' ? hosts.get(from.host) : undefined;
  const origin = host && typeof from.window === 'string' ? originOf(host, from.window) : undefined;
  return scratchpadRoute(reply, () => ({ id: scratchpads.add(typeof body.pad === 'number' ? body.pad : -1, body.text, origin) }));
});

app.post('/api/scratchpads/notes/:id', async (req, reply) => {
  const body = (req.body ?? {}) as Partial<ScratchpadEditRequest>;
  const id = (req.params as { id: string }).id;
  return scratchpadRoute(reply, () => {
    scratchpads.edit(id, { text: body.text, pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined });
    return { ok: true };
  });
});

app.post('/api/scratchpads/notes/:id/delete', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  return scratchpadRoute(reply, () => {
    scratchpads.remove(id);
    return { ok: true };
  });
});

/** Types a note into a pane as a paste, without Enter; an unpinned note goes once pasted. */
app.post('/api/scratchpads/notes/:id/paste', async (req, reply) => {
  const body = (req.body ?? {}) as Partial<ScratchpadPasteRequest>;
  const id = (req.params as { id: string }).id;
  const host = typeof body.host === 'string' ? hosts.get(body.host) : undefined;
  if (!host || typeof body.pane !== 'string' || !/^%\d+$/.test(body.pane)) return reply.code(400).send({ error: 'Petición inválida' });
  if (!host.findPane(body.pane)) return reply.code(404).send({ error: 'El panel ya no existe' });
  const pane = body.pane;
  return scratchpadRoute(reply, async () => {
    await scratchpads.paste(id, async (text) => {
      try {
        await pasteText(host, pane, text);
      } catch (err) {
        throw new ScratchpadError(`No se pudo pegar en ${host.name}: ${(err as Error).message}`, 502);
      }
    });
    console.log(`[scratchpads] nota ${id} pegada en ${host.id} ${pane}`);
    return { ok: true };
  });
});

// ---------------------------------------------------------------- machines (Ajustes › Máquinas)

function machinesInfo(): MachinesInfo {
  return { list: machines.list, publicKey: publicKey(hubKeyPath(machines.list)), configHostsLeft, canInstallKit: !!config.notifyToken };
}

/** Every device sees the change: Ajustes › Máquinas and the tree. */
function machinesChanged(): void {
  broadcast({ t: 'machines', info: machinesInfo() });
  const check = checkNow();
  broadcastTree(check);
  // A machine removed takes its readings, and with them its place in an account's warning.
  if (sent.accountsChanged(check)) broadcastAccounts(check);
}

/** A machine as the panel sent it, checked; a new one gets the hub's key. */
function machineFrom(raw: unknown, existing?: SavedHost): SavedHost {
  const m = checkMachineData(raw, machines.list.map((h) => h.id), existing);
  if (!existing && !m.local) {
    const key = hubKeyPath(machines.list);
    if (!key) throw new Error('El hub no tiene clave SSH (~/.ssh/id_ed25519): créala con ssh-keygen');
    m.identityFile = key;
  }
  return m;
}

/** The URL a kit sends its notices to: one of the hub's (a new one is kept with them). */
function hubUrlFor(raw: unknown): string {
  const url = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  if (!/^https?:\/\/[^\s'"`$\\]{1,200}$/.test(url)) throw new Error('Falta la URL del hub para los avisos del kit');
  if (!settings.value.hubUrls.includes(url)) settings.update({ hubUrls: [...settings.value.hubUrls, url] });
  return url;
}

function installOn(host: HostMonitor, url: string): Promise<KitReport> {
  if (!config.notifyToken) return Promise.resolve({ ok: false, log: 'El hub no tiene notifyToken en su config: el kit no podría avisar', left: [] });
  return installKit(host, updates.info.latest?.version ?? null, url, config.notifyToken);
}

const badRequest = (reply: FastifyReply, err: unknown) => reply.code(400).send({ error: (err as Error).message });

app.get('/api/machines', async () => machinesInfo());

/** The line of the hub's key for a machine's authorized_keys, for the way it is reached. */
app.post('/api/machines/key', async (req, reply) => {
  const key = machinesInfo().publicKey;
  if (!key) return reply.code(404).send({ error: 'El hub no tiene clave SSH' });
  const via = (req.body as { via?: SavedHost['via'] } | null)?.via;
  return { line: authorizedKeyLine(key, via, settings.value.hubAddresses) };
});

/** «Probar»: whether the hub gets into the machine (a new one, or one being edited). */
app.post('/api/machines/check', async (req, reply) => {
  const body = (req.body ?? {}) as { machine?: unknown; id?: string };
  try {
    const existing = body.id ? machines.get(body.id) : undefined;
    const m = machineFrom(body.machine, existing);
    return await checkMachine(new HostMonitor(hostConfig(m), config));
  } catch (err) {
    return badRequest(reply, err);
  }
});

/** Adds a machine and, with `hubUrl`, installs the kit there. */
app.post('/api/machines', async (req, reply) => {
  const body = (req.body ?? {}) as { machine?: unknown; hubUrl?: unknown; install?: boolean };
  let m: SavedHost;
  let url = '';
  try {
    m = machineFrom(body.machine);
    if (body.install) url = hubUrlFor(body.hubUrl);
  } catch (err) {
    return badRequest(reply, err);
  }
  machines.put(m);
  const host = attachHost(m);
  host.start();
  machinesChanged();
  console.log(`[máquinas] añadida ${m.id} (${m.ssh ?? 'local'})`);
  const kit = body.install ? await installOn(host, url) : undefined;
  if (kit?.ok) void host.refresh();
  return { machine: m, kit };
});

/** Changes a machine (its id stays): it is watched again with what changed. */
app.post('/api/machines/:id', async (req, reply) => {
  const existing = machines.get((req.params as { id: string }).id);
  if (!existing) return reply.code(404).send({ error: 'Esa máquina ya no está' });
  let m: SavedHost;
  try {
    m = machineFrom(req.body, existing);
  } catch (err) {
    return badRequest(reply, err);
  }
  machines.put(m);
  detachHost(m.id);
  attachHost(m).start();
  machinesChanged();
  return { machine: m };
});

/** Installs the kit again (or for the first time) on a machine. */
app.post('/api/machines/:id/kit', async (req, reply) => {
  const host = hosts.get((req.params as { id: string }).id);
  if (!host) return reply.code(404).send({ error: 'Esa máquina ya no está' });
  try {
    const kit = await installOn(host, hubUrlFor((req.body as { hubUrl?: unknown } | null)?.hubUrl));
    if (kit.ok) void host.refresh();
    return kit;
  } catch (err) {
    return badRequest(reply, err);
  }
});

/**
 * Removes a machine: first the kit and the hub's key go from it (see uninstallKit); if that
 * fails (it does not answer), it stays, unless `force` (only from the panel, then).
 */
app.post('/api/machines/:id/delete', async (req, reply) => {
  const id = (req.params as { id: string }).id;
  const saved = machines.get(id);
  const host = hosts.get(id);
  if (!saved || !host) return reply.code(404).send({ error: 'Esa máquina ya no está' });
  const force = (req.body as { force?: boolean } | null)?.force === true;
  let kit: KitReport | undefined;
  if (!force) {
    // On the hub itself there is no key of its own to take out.
    kit = await uninstallKit(host, saved.local ? null : machinesInfo().publicKey);
    if (!kit.ok) return reply.code(409).send({ error: kit.log, kit });
  }
  detachHost(id);
  machines.remove(id);
  settings.forgetHost(id);
  for (const a of automations.info.filter((x) => x.host === id && x.enabled)) automations.upsert({ ...a, enabled: false });
  machinesChanged();
  console.log(`[máquinas] quitada ${id}${force ? ' (solo del panel)' : ''}`);
  return { kit };
});

// ---------------------------------------------------------------- files and git of a pane

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
};

function fileError(reply: FastifyReply, err: unknown) {
  if (!(err instanceof FileError)) return reply.code(500).send({ error: (err as Error).message });
  return reply.code(err.status).send((err.dir ? { error: err.message, dir: err.dir } : { error: err.message }) satisfies FilesError);
}

/**
 * A file of a machine, for the viewer: a path seen in a window (relative to its panes'
 * folders), streamed whatever its size. Images, PDFs, videos and sound with their type,
 * anything else as text; never run by the browser (sandboxed), even opened on its own.
 * probe=1: only its whole path and size; max=N: only its first N bytes (X-File-Size says
 * how many it has). A Range header gets that piece of it (a player seeking in a video).
 */
app.get('/api/files', async (req, reply) => {
  const q = req.query as { host?: string; window?: string; pane?: string; path?: string; probe?: string; max?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  try {
    const raw = String(q.path ?? '');
    const isRel = !raw.startsWith('/') && !raw.startsWith('~');
    const folders = isRel ? paneFolders(host, q.window, q.pane) : [''];
    if (!folders.length) return reply.code(400).send({ error: 'No se sabe en qué carpeta está esa ventana' });
    const { path, size } = await statHostFile(
      host,
      folders.map((f) => resolvePath(raw, f)),
      isRel ? findInReposScript(raw, folders) : null,
    );
    if (q.probe === '1') return { path, size };
    const max = Number(q.max) > 0 ? Math.min(Number(q.max), size) : undefined;
    const range = max === undefined ? parseRange(req.headers.range, size) : null;
    if (range === 'unsatisfiable') return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    const child = streamHostFile(host, path, range ?? (max ? { start: 0, length: max } : undefined));
    // The browser gave up (closed the viewer, moved off a preview): stop reading.
    req.raw.on('close', () => child.exitCode === null && child.kill());
    if (range) {
      reply
        .code(206)
        .header('Content-Range', `bytes ${range.start}-${range.start + range.length - 1}/${size}`)
        .header('Content-Length', String(range.length));
    }
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    // Chrome's PDF viewer does not run in a sandboxed document; anything else never runs scripts.
    if (ext !== 'pdf') reply.header('Content-Security-Policy', 'sandbox');
    return reply
      .header('Content-Type', MIME[ext] ?? 'text/plain; charset=utf-8')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'no-store')
      .header('X-File-Path', encodeURIComponent(path))
      .header('X-File-Size', String(size))
      .send(child.stdout);
  } catch (err) {
    return fileError(reply, err);
  }
});

/**
 * A folder of a machine for the file explorer, with the folders and files inside: an
 * absolute or ~ path, or one relative to the folders of the window's panes (the pane
 * asked for first), like /api/files; `.` is the pane's own folder.
 */
app.get('/api/dir', async (req, reply) => {
  const q = req.query as { host?: unknown; window?: unknown; pane?: unknown; path?: unknown };
  const host = typeof q.host === 'string' ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  const raw = typeof q.path === 'string' ? q.path : '';
  if (!raw.trim()) return reply.code(400).send({ error: 'Falta la carpeta' });
  try {
    const isRel = !raw.startsWith('/') && !raw.startsWith('~');
    const folders = isRel ? paneFolders(host, typeof q.window === 'string' ? q.window : undefined, typeof q.pane === 'string' ? q.pane : undefined) : [''];
    if (!folders.length) return reply.code(400).send({ error: 'No se sabe en qué carpeta está esa ventana' });
    return (await listHostDir(host, folders.map((f) => resolvePath(raw, f)), raw)) satisfies DirListing;
  } catch (err) {
    return fileError(reply, err);
  }
});

app.get('/api/git/changes', async (req, reply) => {
  const q = req.query as { host?: string; window?: string; pane?: string; mode?: string; base?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  // A branch of origin to compare with: checked here, as it goes into a script on the machine.
  const base = typeof q.base === 'string' && q.base !== '' ? q.base : undefined;
  const bad = base && branchNameProblem(base);
  if (bad) return reply.code(400).send({ error: bad });
  const cwd = paneFolders(host, q.window, q.pane)[0];
  if (!cwd) return reply.code(400).send({ error: 'No se sabe en qué carpeta está esa ventana' });
  try {
    return await gitChanges(host, cwd, q.mode === 'branch' || q.mode === 'head' ? q.mode : 'auto', base);
  } catch (err) {
    return fileError(reply, err);
  }
});

app.get('/api/git/stat', async (req, reply) => {
  const q = req.query as { host?: string; window?: string; pane?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  const cwd = paneFolders(host, q.window, q.pane)[0];
  if (!cwd || host.snapshot.status !== 'ok') return null;
  try {
    return await gitStat(host, cwd);
  } catch (err) {
    return fileError(reply, err);
  }
});

/** What the pane's project lets the terminal link (PR #12, Trello #470…): its repository and its Trello board. */
app.get('/api/refs/context', async (req, reply) => {
  const q = req.query as { host?: string; window?: string; pane?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  const cwd = paneFolders(host, q.window, q.pane)[0];
  if (!cwd) return reply.code(400).send({ error: 'No se sabe en qué carpeta está esa ventana' });
  try {
    return parseContext(await host.exec.shell(contextScript(cwd))) satisfies RefContext;
  } catch (err) {
    return reply.code(502).send({ error: `No se pudo leer el proyecto en ${host.name}: ${(err as Error).message}` });
  }
});

/** Where [Image #N] of the pane's Claude Code session is on its machine: the file Claude Code saved when it was pasted. */
app.get('/api/claude-image', async (req, reply) => {
  const q = req.query as { host?: string; pane?: string; n?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host || !/^%\d+$/.test(q.pane ?? '') || !/^\d{1,4}$/.test(q.n ?? '')) return reply.code(400).send({ error: 'Petición inválida' });
  const ctx = host.findPane(q.pane!);
  if (!ctx) return reply.code(404).send({ error: 'El panel ya no existe' });
  const n = Number(q.n);
  const session = ctx.pane.claudeSession;
  const notFound = () => reply.code(404).send({ error: `No encuentro la imagen ${n}` });
  if (!session || !isImageRef(session, n)) return notFound();
  try {
    const path = parseImage(await host.exec.shell(imageScript(session, n)));
    return path ? ({ path } satisfies ClaudeImageResult) : notFound();
  } catch (err) {
    return reply.code(502).send({ error: `No se pudo buscar la imagen en ${host.name}: ${(err as Error).message}` });
  }
});

app.get('/api/git/diff', async (req, reply) => {
  const q = req.query as { host?: string; root?: string; file?: string; mode?: string; base?: string };
  const host = q.host ? hosts.get(q.host) : undefined;
  if (!host) return reply.code(400).send({ error: 'Máquina desconocida' });
  if (!q.root?.startsWith('/')) return reply.code(400).send({ error: 'Falta el repo' });
  try {
    const mode: GitDiffMode = q.mode === 'branch' ? 'branch' : 'head';
    const diff = await gitDiff(host, q.root, String(q.file ?? ''), mode, q.base);
    return reply.header('Content-Type', 'text/plain; charset=utf-8').header('Cache-Control', 'no-store').send(diff);
  } catch (err) {
    return fileError(reply, err);
  }
});

/** Where a task can go, for the panel (as /api/ext/targets for the extension). */
app.get('/api/targets', async () => ({
  hosts: await Promise.all(hostOrder.list.map((id) => hosts.get(id)!).map((h) => hostTargets(h, machineFolders(h)))),
}));

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
  // The test shows notifications work, so the quiet schedule does not hold it back.
  const n = await push.send({ title: '🔔 twb', body: 'Las notificaciones funcionan', tag: 'test', url: '/' }, typeof endpoint === 'string' && endpoint ? [endpoint] : undefined, { evenWhenQuiet: true });
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
accounts.start();
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
  accounts.stop();
  activity.save();
  void Promise.all([app.close(), notifyApp?.close()]).then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
