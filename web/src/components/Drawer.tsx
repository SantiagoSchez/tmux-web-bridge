import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { route } from '../router';
import { Header } from './Header';
import { Tree } from './Tree';

/** Where a swipe has to start to open the drawer (px from the left edge). */
export const EDGE = 36;
const OPEN_AT = 70;

export const drawerOpen = signal(false);
/** Finger offset while dragging (px of drawer showing), null when not dragging. */
const dragX = signal<number | null>(null);

/**
 * The list as a drawer over a window, on phones: opened by swiping from the
 * left edge, closed by swiping it back, tapping outside or picking a window.
 */
export function Drawer() {
  const panel = useRef<HTMLDivElement>(null);
  const r = route.value;

  // Picking a window (or going home) closes it.
  useEffect(() => {
    drawerOpen.value = false;
  }, [r.name === 'window' ? `${r.host}:${r.window}:${r.pane}` : 'home']);

  // Edge swipe on the whole page. Capture phase, so the terminal's own touch
  // scrolling and the header's window swipe never see a drawer gesture.
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let horizontal: boolean | null = null;
    const width = () => panel.current?.offsetWidth ?? 320;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1) return;
      if (!drawerOpen.value && t.clientX > EDGE) return;
      if (drawerOpen.value && t.clientX > width()) return; // the backdrop handles taps
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
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (!horizontal) {
          start = null;
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      const w = width();
      dragX.value = Math.max(0, Math.min(w, (drawerOpen.value ? w : 0) + dx));
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || horizontal !== true) {
        start = null;
        return;
      }
      e.stopPropagation();
      const shown = dragX.value ?? 0;
      drawerOpen.value = drawerOpen.value ? shown > width() - OPEN_AT : shown > OPEN_AT;
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
  const open = drawerOpen.value;
  const style = drag !== null ? { transform: `translateX(calc(-100% + ${drag}px))`, transition: 'none' } : undefined;
  const visible = open || drag !== null;
  return (
    <>
      {visible && (
        <div
          class="drawer-backdrop"
          style={drag !== null ? { opacity: Math.min(1, drag / 300), transition: 'none' } : undefined}
          onClick={() => (drawerOpen.value = false)}
        />
      )}
      <div ref={panel} class={`drawer ${open ? 'open' : ''}`} style={style} aria-hidden={!visible} inert={!visible}>
        <Header />
        <Tree />
      </div>
    </>
  );
}
