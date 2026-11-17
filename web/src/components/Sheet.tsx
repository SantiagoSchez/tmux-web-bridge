import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { isDesktop } from '../prefs';

/** How far down (px), or how fast (px/ms), a sheet has to be dragged for it to close. */
const DISMISS_AT = 120;
const DISMISS_SPEED = 0.5;

/** The sheets' backdrop colour, as faded as a sheet is dragged down (1 up, 0 gone). */
const dim = (k: number) => `color-mix(in srgb, var(--backdrop-soft) ${Math.round(k * 100)}%, transparent)`;

/**
 * Dragging a sheet down by its grip or its title, on the phone: it follows the
 * finger and, let go, closes if dragged far or fast enough, or goes back up. The
 * backdrop fades with it, unless it is null (a stacked sheet's, which has no shade).
 * Pointer events captured by the sheet, with touch-action off on the handle, so
 * the browser neither scrolls the sheet nor cancels the drag.
 */
function dragToClose(down: PointerEvent, sheet: HTMLElement, backdrop: HTMLElement | null, onClose: () => void): void {
  if (isDesktop.value || !down.isPrimary || (down.pointerType === 'mouse' && down.button !== 0)) return;
  const y0 = down.clientY;
  let dragging = false;
  let last = { y: y0, t: down.timeStamp };
  let speed = 0;
  const move = (e: PointerEvent) => {
    const dy = e.clientY - y0;
    if (!dragging) {
      if (dy < 6) return;
      dragging = true;
      sheet.setPointerCapture(down.pointerId);
      sheet.style.transition = 'none';
      if (backdrop) backdrop.style.transition = 'none';
    }
    if (e.timeStamp > last.t) speed = (e.clientY - last.y) / (e.timeStamp - last.t);
    last = { y: e.clientY, t: e.timeStamp };
    const off = Math.max(0, dy);
    sheet.style.transform = `translateY(${off}px)`;
    // Its colour, not its opacity, which would fade the sheet inside it too.
    if (backdrop) backdrop.style.backgroundColor = dim(Math.max(0, 1 - off / sheet.offsetHeight));
  };
  const up = (e: PointerEvent) => {
    sheet.removeEventListener('pointermove', move);
    sheet.removeEventListener('pointerup', up);
    sheet.removeEventListener('pointercancel', up);
    if (!dragging) return;
    // Letting go over the back button would also press it.
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }));
    const dy = e.clientY - y0;
    const close = e.type === 'pointerup' && (dy > DISMISS_AT || (dy > 20 && speed > DISMISS_SPEED));
    sheet.style.transition = 'transform 0.2s ease-out';
    if (backdrop) backdrop.style.transition = 'background-color 0.2s ease-out';
    if (close) {
      sheet.style.transform = 'translateY(100%)';
      if (backdrop) backdrop.style.backgroundColor = dim(0);
      setTimeout(onClose, 200);
    } else {
      sheet.style.transform = '';
      if (backdrop) backdrop.style.backgroundColor = '';
    }
  };
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', up);
}

/**
 * Bottom sheet on the phone, centred card on wide screens. Escape, a tap outside
 * or (on the phone) dragging it down by its top closes it.
 */
export function Sheet(props: {
  title: string;
  subtitle?: string;
  /** A way back above the title (a section of the settings on the phone). */
  back?: { label: string; onClick: () => void };
  class?: string;
  /** Over another sheet: its backdrop adds no shade, the one below already dims the page. */
  stacked?: boolean;
  /** Covered by another sheet: out of the focus order, the pointer and the accessibility tree, its scroll kept. */
  inert?: boolean;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const { title, subtitle, back, stacked, inert, onClose, children } = props;
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (backdrop.current) backdrop.current.inert = !!inert;
  }, [inert]);
  useEffect(() => {
    // Only the one on top (the last one) closes: a dialog over the settings leaves them open.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && [...document.querySelectorAll('.sheet-backdrop')].pop() === backdrop.current && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class={`sheet-backdrop ${stacked ? 'stacked' : ''}`} ref={backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${props.class ?? ''}`} ref={panel} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-top" onPointerDown={(e) => dragToClose(e, panel.current!, stacked ? null : backdrop.current!, onClose)}>
          <div class="sheet-grip" />
          <div class="sheet-head">
            {back && (
              <button class="sheet-back" onClick={back.onClick}>
                ‹ {back.label}
              </button>
            )}
            <h2>{title}</h2>
            {subtitle && <p class="dim small">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
