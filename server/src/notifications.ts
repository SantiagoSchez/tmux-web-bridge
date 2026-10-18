import { parseChoices, type ChoicePrompt } from '../../shared/choices.js';
import type { NotifyRequest, PaneState, PushPayload } from '../../shared/types.js';
import type { Config } from './config.js';
import type { ConnectionRegistry } from './connections.js';
import type { HostMonitor, PaneContext, PaneTransition } from './host.js';
import type { PushService } from './push.js';

type AlertState = 'question' | 'attention' | 'done';

const ALERT: Record<AlertState, { icon: string; label: string }> = {
  question: { icon: '🙋', label: 'Pregunta' },
  attention: { icon: '💬', label: 'Necesita atención' },
  done: { icon: '✅', label: 'Terminado' },
};

function isAlert(s: PaneState | null | undefined): s is AlertState {
  return s === 'question' || s === 'attention' || s === 'done';
}

/** Hash route of a pane in the web app (ids without their tmux sigil). */
export function paneUrl(host: string, windowId: string, paneId: string): string {
  return `/#/h/${encodeURIComponent(host)}/w/${windowId.replace(/^@/, '')}/p/${paneId.replace(/^%/, '')}`;
}

/** Last meaningful lines of a pane, as a one-line notification body. */
function summarize(capture: string): string {
  const lines = capture
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Skip borders and rules drawn with box characters.
    .filter((l) => l && /[\p{L}\p{N}]/u.test(l));
  return lines.slice(-3).join(' · ').slice(0, 200);
}

/**
 * Decides when to push to the phone. Two sources:
 *  - the host's tmux-window-title.sh posts to /api/notify with the question or
 *    answer text and whether you are looking at that pane on the computer;
 *  - as a fallback, a pane icon changing to 🙋/💬/✅ that no script reported
 *    within a few seconds (host without host-kit, hub unreachable from it...).
 * Nothing is pushed for a pane someone has open in the web app, nor at all while
 * you are working at a device that reports your presence.
 */
export class Notifier {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly scriptAt = new Map<string, number>();

  constructor(
    private readonly config: Config,
    private readonly hosts: Map<string, HostMonitor>,
    private readonly push: PushService,
    private readonly conns: ConnectionRegistry,
  ) {}

  private title(ctx: PaneContext, state: AlertState): string {
    const hostSuffix = this.hosts.size > 1 ? ` · ${ctx.host.name}` : '';
    return `${ALERT[state].icon} ${ctx.window.name} [${ctx.session.name}]${hostSuffix}`;
  }

  onTransition(t: PaneTransition): void {
    const key = `${t.host.id}:${t.pane.id}`;
    const pending = this.timers.get(key);
    if (pending) {
      clearTimeout(pending);
      this.timers.delete(key);
    }
    if (!isAlert(t.to)) return;
    // Claude raises a Notification right after asking: 🙋 must not become a second 💬 alert.
    if (t.from === 'question' && t.to === 'attention') return;
    if (Date.now() - (this.scriptAt.get(key) ?? 0) < 15_000) return;

    const startedAt = Date.now();
    const state = t.to;
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.fallback(t.host, t.pane.id, state, startedAt);
      }, this.config.fallbackDelayMs),
    );
  }

  private async fallback(host: HostMonitor, paneId: string, state: AlertState, since: number): Promise<void> {
    const key = `${host.id}:${paneId}`;
    if ((this.scriptAt.get(key) ?? 0) >= since - 2000) return;
    const ctx = host.findPane(paneId);
    if (!ctx || ctx.pane.state !== state) return;
    if (this.conns.isWatched(host.id, paneId, ctx.window.id) || this.silenced(ctx, state)) return;
    let body = ALERT[state].label;
    try {
      body = summarize(await host.exec.run(['capture-pane', '-p', '-J', '-t', paneId])) || body;
    } catch {
      /* keep the generic label */
    }
    await this.send(ctx, state, body);
  }

  /** POST /api/notify from a host. */
  async onScriptNotify(req: NotifyRequest): Promise<{ pushed: boolean; reason?: string }> {
    const host = this.hosts.get(req.host);
    if (!host) return { pushed: false, reason: 'unknown host' };
    const key = `${host.id}:${req.pane}`;
    this.scriptAt.set(key, Date.now());
    const pending = this.timers.get(key);
    if (pending) {
      clearTimeout(pending);
      this.timers.delete(key);
    }
    if (req.viewed) return { pushed: false, reason: 'viewed' };

    // The script runs right after setting the icon; poll so the tree has the new state and names.
    await host.refresh().catch(() => {});
    const ctx = host.findPane(req.pane);
    if (ctx && this.conns.isWatched(host.id, req.pane, ctx.window.id)) return { pushed: false, reason: 'watched in web' };
    if (this.silenced(ctx, req.state)) return { pushed: false, reason: 'present' };

    const state = req.state;
    const body = req.message?.trim() || ALERT[state].label;
    if (ctx) {
      await this.send(ctx, state, body);
    } else {
      await this.push.send({ title: req.title || `${ALERT[state].icon} ${host.name}`, body, tag: key, url: '/' });
    }
    return { pushed: true };
  }

  /** You are at a device with the app open: the pending list already shows it. */
  private silenced(ctx: PaneContext | null, state: AlertState): boolean {
    const at = this.conns.presentDevice();
    if (!at) return false;
    const what = ctx ? this.title(ctx, state) : ALERT[state].icon;
    console.log(`[push] ${what}: no se envía, estás en ${at.device ?? at.ip ?? 'otro dispositivo'}`);
    return true;
  }

  /**
   * The menu of a question or permission, read from the pane. The hooks fire just
   * before Claude draws it, so look for up to ~2.5 s.
   */
  private async waitForChoices(ctx: PaneContext): Promise<ChoicePrompt | null> {
    for (let i = 0; i < 6; i++) {
      try {
        const prompt = parseChoices(await ctx.host.exec.run(['capture-pane', '-p', '-J', '-t', ctx.pane.id]));
        if (prompt) return prompt;
      } catch {
        return null;
      }
      await new Promise((r) => setTimeout(r, 450));
    }
    return null;
  }

  private async send(ctx: PaneContext, state: AlertState, body: string): Promise<void> {
    const payload: PushPayload = {
      title: this.title(ctx, state),
      body,
      // One notification per window: a new one replaces the previous one on the phone.
      tag: `${ctx.host.id}:${ctx.window.id}`,
      url: paneUrl(ctx.host.id, ctx.window.id, ctx.pane.id),
    };
    if (state !== 'done') {
      const prompt = await this.waitForChoices(ctx);
      if (prompt) {
        // Android shows two buttons: the first option and the last one (usually "No").
        const picks = prompt.choices.length > 2 ? [prompt.choices[0], prompt.choices[prompt.choices.length - 1]] : prompt.choices;
        payload.actions = picks.map((c) => ({ action: `choice:${c.key}`, title: `${c.key}. ${c.label}`.slice(0, 40) }));
        payload.respond = { host: ctx.host.id, pane: ctx.pane.id, fingerprint: prompt.fingerprint };
        if (body === ALERT[state].label && prompt.question) payload.body = prompt.question;
      }
    }
    const n = await this.push.send(payload);
    console.log(`[push] ${payload.title}: ${payload.body.slice(0, 60)} (${n} destinatarios)`);
  }
}
