import { useEffect, useRef, useState } from 'preact/hooks';
import { cancelDictation, dictating, dictationShortcut, startDictation, stopDictation, toggleDictation } from '../dictation';
import { shortcutText } from '../shortcuts';
import { hubSettings, toast } from '../state';

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Shorter than this, a press on the hold button was a tap: nothing is sent. */
const MIN_HOLD_MS = 300;
/** How far past the button the finger can wander before letting go discards. */
const SLOP = 24;

/** label: what the idle button shows instead of 🎤 (the key bar's setting). */
type Props = { hostId: string; paneId: string; class: string; label?: string; onPointerDown?: (e: Event) => void };

/**
 * The recording's ● m:ss. It redraws itself: @preact/signals skips a component that
 * reads a signal when its props do not change, so a tick in a parent would not reach it.
 */
function RecClock({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  return <>● {clock(Date.now() - since)}</>;
}

/**
 * 🎤: dictate to the pane (typed in without Enter). Hold mode: talk while pressing it,
 * let go to send, slide off it to throw the recording away. Tap mode: tap to start,
 * tap again to send, ✕ to throw it away. The mode and the shortcut are hub settings;
 * the button is only there when dictation is on. onPointerDown lets the keybar keep
 * the phone keyboard as it is.
 */
export function MicButton(props: Props) {
  const d = dictating.value;
  const s = hubSettings.value;
  if (!s?.dictation) return null;
  const shortcut = shortcutText(dictationShortcut());

  if (d?.phase === 'sending') {
    return (
      <button type="button" class={`${props.class} mic busy`} disabled aria-label="Transcribiendo" title="Transcribiendo…">
        <span class="mic-spinner" aria-hidden="true" />
      </button>
    );
  }
  if (s.dictationButton !== 'toggle') return <HoldMic {...props} shortcut={shortcut} />;
  if (d?.phase === 'recording') {
    return (
      <>
        <button
          type="button"
          class={`${props.class} mic rec`}
          aria-label="Parar y enviar el dictado"
          title={`Parar y enviar (${shortcut})`}
          onPointerDown={props.onPointerDown}
          onClick={() => toggleDictation(props.hostId, props.paneId)}
        >
          <RecClock since={d.since} />
        </button>
        <button type="button" class={props.class} aria-label="Descartar el dictado" title="Descartar (Esc)" onPointerDown={props.onPointerDown} onClick={cancelDictation}>
          ✕
        </button>
      </>
    );
  }
  return (
    <button
      type="button"
      class={`${props.class} mic`}
      aria-label="Dictar"
      title={`Dictar (${shortcut})`}
      onPointerDown={props.onPointerDown}
      onClick={() => toggleDictation(props.hostId, props.paneId)}
    >
      {props.label || '🎤'}
    </button>
  );
}

/** One button for the whole gesture: the pointer stays captured by it while it changes look. */
function HoldMic(props: Props & { shortcut: string }) {
  const d = dictating.value;
  const press = useRef<{ id: number; at: number; box: DOMRect; out: boolean } | null>(null);
  const [out, setOut] = useState<boolean | null>(null);
  const recording = d?.phase === 'recording';

  const down = (e: PointerEvent) => {
    props.onPointerDown?.(e);
    if (e.button !== 0 || press.current) return;
    // Started with the shortcut: a tap on the button sends it, like pressing the shortcut again.
    if (recording) return stopDictation();
    if (d) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    press.current = { id: e.pointerId, at: Date.now(), box: el.getBoundingClientRect(), out: false };
    setOut(false);
    void startDictation(props.hostId, props.paneId);
  };
  const move = (e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    const b = p.box;
    const away = e.clientX < b.left - SLOP || e.clientX > b.right + SLOP || e.clientY < b.top - SLOP || e.clientY > b.bottom + SLOP;
    if (away !== p.out) {
      p.out = away;
      setOut(away);
    }
  };
  const up = (e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.id) return;
    press.current = null;
    setOut(null);
    if (e.type === 'pointercancel' || p.out) return cancelDictation();
    if (Date.now() - p.at < MIN_HOLD_MS) {
      cancelDictation();
      return toast('Mantén pulsado 🎤 mientras hablas');
    }
    stopDictation();
  };

  const held = out !== null;
  const label = out ? '✕ suelta' : recording ? <RecClock since={d.since} /> : props.label || '🎤';
  return (
    <button
      type="button"
      class={`${props.class} mic hold ${held || recording ? 'rec' : ''} ${out ? 'discard' : ''}`}
      aria-label={held ? (out ? 'Suelta para descartar el dictado' : 'Suelta para enviar el dictado') : 'Mantén pulsado para dictar'}
      title={`Mantén pulsado para dictar, suelta para enviar (o ${props.shortcut})`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
