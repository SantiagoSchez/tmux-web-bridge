import { randomBytes } from 'node:crypto';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import type { ConnectionRegistry } from './connections.js';
import { WEB_SESSION_PREFIX, type HostMonitor } from './host.js';

export interface TerminalParams {
  session: string;
  window?: string;
  pane?: string;
  cols: number;
  rows: number;
  clientId?: string;
}

type TermInput = { t: 'i'; d: string } | { t: 'r'; cols: number; rows: number } | { t: 'sel'; window: string; pane?: string };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n) || lo));

/**
 * A full terminal for the browser (xterm.js): a pty running a tmux client on a
 * new session grouped with the target one. The group shares the windows but
 * each web tab picks its own current window, so browsing on the phone never
 * moves the computer's tmux client. destroy-unattached removes the session as
 * soon as the pty (or the SSH behind it) goes away.
 */
export function openTerminal(ws: WebSocket, host: HostMonitor, params: TerminalParams, conns: ConnectionRegistry): void {
  if (!/^\$\d+$/.test(params.session)) {
    ws.close(1008, 'sesión inválida');
    return;
  }
  const name = `${WEB_SESSION_PREFIX}${randomBytes(4).toString('hex')}`;
  // -E: the web client comes over SSH from the hub, without an agent; with tmux's
  // update-environment it would mark SSH_AUTH_SOCK as removed (and set SSH_CONNECTION)
  // in the group, and every pane started afterwards could not git push.
  // status off: the app has its own spaces/windows list; the computer's tmux keeps its bar
  // (session option of this web session only).
  const args = ['new-session', '-E', '-t', params.session, '-s', name, ';', 'set-option', 'destroy-unattached', 'on', ';', 'set-option', 'status', 'off'];
  if (params.window && /^@\d+$/.test(params.window)) args.push(';', 'select-window', '-t', `:${params.window}`);
  if (params.pane && /^%\d+$/.test(params.pane)) args.push(';', 'select-pane', '-t', params.pane);

  const cmd = host.exec.spawnable(args, true);
  let term: pty.IPty;
  try {
    term = pty.spawn(cmd.file, cmd.args, {
      name: 'xterm-256color',
      cols: clamp(params.cols, 10, 500),
      rows: clamp(params.rows, 4, 300),
      env: { ...cmd.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
    });
  } catch (err) {
    ws.send(JSON.stringify({ t: 'exit', reason: (err as Error).message }));
    ws.close();
    return;
  }

  /**
   * Shows another window of the space. It must be switch-client on this pty's own
   * client: with window-size latest, a plain select-window does not count as this
   * client's activity, so the window keeps the computer's size and the phone only
   * sees its top-left corner until a key is pressed.
   */
  let clientName: string | null = null;
  const retarget = async (window: string, pane?: string) => {
    try {
      clientName ??= (await host.exec.run(['list-clients', '-t', `=${name}`, '-F', '#{client_name}'])).trim().split('\n')[0] || null;
      // -E: same as new-session above, never copy this client's environment into the session.
      const args = clientName ? ['switch-client', '-E', '-c', clientName, '-t', `=${name}:${window}`] : ['select-window', '-t', `=${name}:${window}`];
      if (pane && /^%\d+$/.test(pane)) args.push(';', 'select-pane', '-t', pane);
      await host.exec.run(args);
    } catch (err) {
      console.warn(`[terminal] no se pudo cambiar ${name} a ${window}: ${(err as Error).message}`);
      clientName = null;
    }
  };

  host.liveWebSessions.add(name);
  if (params.clientId) conns.terminalDelta(params.clientId, +1);

  // Backpressure: stop reading from the pty while the browser is behind.
  let paused = false;
  const drain = () => {
    if (ws.bufferedAmount < 256 * 1024) {
      paused = false;
      term.resume();
    } else setTimeout(drain, 50);
  };
  term.onData((data) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(Buffer.from(data, 'utf8'));
    if (!paused && ws.bufferedAmount > 2 * 1024 * 1024) {
      paused = true;
      term.pause();
      setTimeout(drain, 50);
    }
  });
  term.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ t: 'exit', code: exitCode }));
      ws.close();
    }
  });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    let msg: TermInput;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'i' && typeof msg.d === 'string') term.write(msg.d);
    else if (msg.t === 'r') term.resize(clamp(msg.cols, 10, 500), clamp(msg.rows, 4, 300));
    else if (msg.t === 'sel' && /^@\d+$/.test(msg.window)) void retarget(msg.window, msg.pane);
  });

  ws.on('close', () => {
    host.liveWebSessions.delete(name);
    if (params.clientId) conns.terminalDelta(params.clientId, -1);
    try {
      term.kill();
    } catch {
      /* already gone */
    }
    // Normally destroy-unattached already removed it; this covers a pty that never attached.
    setTimeout(() => host.exec.run(['kill-session', '-t', `=${name}`]).catch(() => {}), 1500);
  });
}
