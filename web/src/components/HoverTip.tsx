import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { tipPosition } from '../../../shared/tip-position';
import { spaceDetails, windowDetails } from '../../../shared/window-details';
import { hosts, multiHost } from '../state';
import { ago } from '../time';
import { IconBranch, IconWorktree } from './icons';

// The details of a row of the list (a window, a space, a pane of the folded list) after the
// mouse rests on it: what the row cuts with «…», whole. One at a time, mounted once in App.
// Only with a mouse; touch keeps the rows as they are.

interface Tip {
  key: string;
  anchor: DOMRect;
  /** What it shows, read on every render so it follows the hub; null once that is gone. */
  render: () => ComponentChildren | null;
}

const hoverTip = signal<Tip | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let waiting: string | null = null;

/** How long the mouse rests on a row before its details show. */
const TIP_DELAY = 1000;

function cancel(key: string): void {
  if (waiting === key) {
    clearTimeout(timer);
    waiting = null;
  }
}

/**
 * The handlers that show `render` next to the element they go on once the mouse has rested
 * on it, and hide it when the mouse leaves. `key` names what it describes.
 */
export function useHoverTip(key: string, render: () => ComponentChildren | null) {
  useEffect(() => () => cancel(key), [key]);
  return {
    onPointerEnter: (e: PointerEvent) => {
      // The input itself, not the device: a touch screen's taps are 'touch' even on a laptop with a mouse.
      if (e.pointerType !== 'mouse') return;
      const el = e.currentTarget as HTMLElement;
      clearTimeout(timer);
      waiting = key;
      timer = setTimeout(() => {
        waiting = null;
        hoverTip.value = { key, anchor: el.getBoundingClientRect(), render };
      }, TIP_DELAY);
    },
    onPointerLeave: () => {
      cancel(key);
      if (hoverTip.value?.key === key) hoverTip.value = null;
    },
    // A click on the row is an action, not a rest: the tip it was waiting for does not come after it.
    onPointerDown: () => cancel(key),
  };
}

/** The open tooltip, if any. */
export function HoverTip() {
  const tip = hoverTip.value;
  return tip ? <TipBox key={tip.key} tip={tip} /> : null;
}

/** Beside its row and inside the screen; it closes on a click, Escape, a scroll or a resize. */
function TipBox({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const content = tip.render();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = tipPosition(tip.anchor, { width: el.offsetWidth, height: el.offsetHeight }, { width: innerWidth, height: innerHeight });
    if (next.left !== pos?.left || next.top !== pos?.top) setPos(next);
  });
  useEffect(() => {
    if (content == null) hoverTip.value = null;
  });
  useEffect(() => {
    const close = () => (hoverTip.value = null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('pointerdown', close, true);
    // Capture: xterm stops the Escape it handles, and the terminal usually has the focus. The key still reaches it.
    addEventListener('keydown', key, true);
    addEventListener('scroll', close, true);
    addEventListener('resize', close);
    addEventListener('blur', close);
    return () => {
      removeEventListener('pointerdown', close, true);
      removeEventListener('keydown', key, true);
      removeEventListener('scroll', close, true);
      removeEventListener('resize', close);
      removeEventListener('blur', close);
    };
  }, []);
  if (content == null) return null;
  return (
    <div ref={ref} class="hover-tip" role="tooltip" style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden', left: '0px', top: '0px' }}>
      {content}
    </div>
  );
}

/**
 * A window's details, found again in the tree on every render. `space` puts the space's
 * name above (a space of a single window); `mark` sets one pane apart (the rail's).
 */
export function windowTip(hostId: string, windowId: string, opts: { space?: boolean; mark?: string } = {}): () => ComponentChildren | null {
  return () => {
    const host = hosts.value.find((h) => h.id === hostId);
    const session = host?.sessions.find((s) => s.windows.some((w) => w.id === windowId));
    const window = session?.windows.find((w) => w.id === windowId);
    if (!host || !session || !window) return null;
    const d = windowDetails(window, { home: host.home ?? '', hostName: multiHost.value ? host.name : undefined, mark: opts.mark });
    const several = d.panes.length > 1;
    return (
      <>
        {opts.space && <div class="tip-space">{session.name}</div>}
        <div class="tip-name">{d.name}</div>
        {(d.state || d.host) && (
          <div class="tip-meta">
            {d.state && (
              <span>
                {d.state.icon && <span aria-hidden="true">{d.state.icon} </span>}
                {d.state.label}
                {d.state.since ? ` · ${ago(d.state.since)}` : ''}
              </span>
            )}
            {d.host && <span>{d.host}</span>}
          </div>
        )}
        <ul class="tip-panes">
          {d.panes.map((p) => (
            <li key={p.index} class={p.marked ? 'marked' : ''}>
              <div class="tip-cmd">
                {several && <span class="tip-label">Panel {p.index}</span>}
                <code>{p.command}</code>
                {p.active && <span class="tip-label">activo</span>}
              </div>
              {p.place && (
                <div class="tip-line">
                  <span class="git-icon" aria-hidden="true">
                    {p.place.kind === 'worktree' ? <IconWorktree /> : <IconBranch />}
                  </span>
                  <span class="tip-label">{p.place.kind === 'worktree' ? 'Worktree' : 'Rama'}</span>
                  {p.place.name}
                </div>
              )}
              {p.path && (
                <div class="tip-line">
                  <span class="tip-label">Carpeta</span>
                  {p.path}
                </div>
              )}
              {p.account && (
                <div class="tip-line">
                  <span class="tip-label">Cuenta</span>
                  {p.account}
                </div>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  };
}

/** A space's details: its full name and how many windows it has. */
export function spaceTip(hostId: string, sessionId: string): () => ComponentChildren | null {
  return () => {
    const session = hosts.value.find((h) => h.id === hostId)?.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const d = spaceDetails(session);
    return (
      <>
        <div class="tip-name">{d.name}</div>
        <div class="tip-meta">{d.windows === 1 ? '1 ventana' : `${d.windows} ventanas`}</div>
      </>
    );
  };
}
