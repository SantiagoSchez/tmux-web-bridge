import { useSignal, type Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { route } from '../router';
import { drawerOpen, scratchpadsOpen } from '../state';
import { Header } from './Header';
import { Scratchpads } from './Scratchpads';
import { Tree } from './Tree';

/** Where a swipe has to start to open a drawer (px from its edge of the screen). */
export const EDGE = 36;
const OPEN_AT = 70;

interface EdgeDrawerProps {
  side: 'left' | 'right';
  open: Signal<boolean>;
  /** The drawer on the other edge: while it is open, this one does not start. */
  other: Signal<boolean>;
  class: string;
  children: ComponentChildren;
}

/**
 * A drawer over the page, on phones: opened by swiping from its edge of the screen,
 * closed by swiping it back or tapping outside.
 */
function EdgeDrawer({ side, open, other, class: cls, children }: EdgeDrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  /** Finger offset while dragging (px of drawer showing), null when not dragging. */
  const dragX = useSignal<number | null>(null);
  const right = side === 'right';

  // Edge swipe on the whole page. Capture phase, so the terminal's own touch
  // scrolling and the header's window swipe never see a drawer gesture.
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let horizontal: boolean | null = null;
    const width = () => panel.current?.offsetWidth ?? 320;
    /** How far from this drawer's edge of the screen. */
    const fromEdge = (x: number) => (right ? innerWidth - x : x);
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || other.value) return;
      // Dragging a terminal selection handle near the edge.
      if ((e.target as Element | null)?.closest?.('.sel-handle')) return;
      if (!open.value && fromEdge(t.clientX) > EDGE) return;
      if (open.value && fromEdge(t.clientX) > width()) return; // the backdrop handles taps
      start = { x: t.clientX, y: t.clientY };
      horizontal = null;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (horizontal === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // A long press in the terminal turned this touch into a text selection.
        if (document.querySelector('.term-box.selecting')) {
          start = null;
          return;
        }
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (!horizontal) {
          start = null;
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      const w = width();
      dragX.value = Math.max(0, Math.min(w, (open.value ? w : 0) + (right ? -dx : dx)));
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || horizontal !== true) {
        start = null;
        return;
      }
      e.stopPropagation();
      const shown = dragX.value ?? 0;
      open.value = open.value ? shown > width() - OPEN_AT : shown > OPEN_AT;
      dragX.value = null;
      start = null;
    };
    const opts = { capture: true, passive: false } as const;
    document.addEventListener('touchstart', onStart, opts);
    document.addEventListener('touchmove', onMove, opts);
    document.addEventListener('touchend', onEnd, opts);
    return () => {
      document.removeEventListener('touchstart', onStart, opts);
      document.removeEventListener('touchmove', onMove, opts);
      document.removeEventListener('touchend', onEnd, opts);
    };
  }, []);

  const drag = dragX.value;
  const isOpen = open.value;
  const hidden = right ? '100%' : '-100%';
  const style = drag !== null ? { transform: `translateX(calc(${hidden} ${right ? '-' : '+'} ${drag}px))`, transition: 'none' } : undefined;
  const visible = isOpen || drag !== null;
  return (
    <>
      {visible && (
        <div
          class="drawer-backdrop"
          style={drag !== null ? { opacity: Math.min(1, drag / 300), transition: 'none' } : undefined}
          onClick={() => (open.value = false)}
        />
      )}
      <div ref={panel} class={`drawer drawer-${side} ${cls} ${isOpen ? 'open' : ''}`} style={style} aria-hidden={!visible} inert={!visible}>
        {children}
      </div>
    </>
  );
}

/** The list as a drawer from the left edge over a window, on phones; picking a window closes it. */
export function Drawer() {
  const r = route.value;
  // Picking a window (or going home) closes it.
  useEffect(() => {
    drawerOpen.value = false;
  }, [r.name === 'window' ? `${r.host}:${r.window}:${r.pane}` : 'home']);
  return (
    <EdgeDrawer side="left" open={drawerOpen} other={scratchpadsOpen} class="drawer-list">
      <Header />
      <Tree />
    </EdgeDrawer>
  );
}

/** The scratchpads as a drawer from the right edge, on phones (every screen). */
export function ScratchpadsDrawer() {
  return (
    <EdgeDrawer side="right" open={scratchpadsOpen} other={drawerOpen} class="drawer-scratchpads">
      <Scratchpads />
    </EdgeDrawer>
  );
}
