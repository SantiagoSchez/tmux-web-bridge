import { useEffect, useState } from 'preact/hooks';
import { cancelDictation, dictating, toggleDictation } from '../dictation';
import { hubSettings } from '../state';

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 🎤: tap to start dictating to the pane, tap again to send it (typed in without Enter);
 * ✕ throws the recording away. Only there when dictation is on in the hub's settings.
 * onPointerDown lets the keybar keep the phone keyboard as it is.
 */
export function MicButton(props: { hostId: string; paneId: string; class: string; onPointerDown?: (e: Event) => void }) {
  const d = dictating.value;
  const [, tick] = useState(0);
  useEffect(() => {
    if (d?.phase !== 'recording') return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [d?.phase]);
  if (!hubSettings.value?.dictation) return null;

  if (d?.phase === 'sending') {
    return (
      <button type="button" class={`${props.class} mic busy`} disabled aria-label="Transcribiendo" title="Transcribiendo…">
        …
      </button>
    );
  }
  if (d?.phase === 'recording') {
    return (
      <>
        <button
          type="button"
          class={`${props.class} mic rec`}
          aria-label="Parar y enviar el dictado"
          title="Parar y enviar (Ctrl+Shift+Espacio)"
          onPointerDown={props.onPointerDown}
          onClick={() => toggleDictation(props.hostId, props.paneId)}
        >
          ● {clock(Date.now() - d.since)}
        </button>
        <button type="button" class={props.class} aria-label="Descartar el dictado" title="Descartar" onPointerDown={props.onPointerDown} onClick={cancelDictation}>
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
      title="Dictar (Ctrl+Shift+Espacio)"
      onPointerDown={props.onPointerDown}
      onClick={() => toggleDictation(props.hostId, props.paneId)}
    >
      🎤
    </button>
  );
}
