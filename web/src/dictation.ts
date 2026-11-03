import { signal } from '@preact/signals';
import { DEFAULT_DICTATION_SHORTCUT, parseShortcut, type Shortcut } from '../../shared/dictation';
import type { DictateResult, DictationInfo } from '../../shared/types';
import { isTouch } from './prefs';
import { dictationInfo, hubSettings, toast } from './state';

const SAMPLE_RATE = 16_000;
/** The hub takes up to five minutes; the recording stops by itself a bit before. */
const MAX_MS = 4.5 * 60 * 1000;
/** Shorter than this is a tap by mistake, not something said. */
const MIN_SECONDS = 0.4;

/** The dictation in progress (one at a time): recording, or being transcribed by the hub. */
export const dictating = signal<{ phase: 'recording' | 'sending'; host: string; pane: string; since: number } | null>(null);
/** The pane a dictation just ended on (typed, discarded or failed): the terminal takes the focus back. */
export const dictationEnded = signal<{ pane: string; at: number } | null>(null);
/** The settings are listening for a new shortcut: the current one does not dictate meanwhile. */
export const recordingShortcut = signal(false);

/** Opening the microphone: stopping before it is open discards (nothing was said yet). */
let starting = false;
let stopWanted = false;

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let cancelled = false;
let maxTimer: ReturnType<typeof setTimeout> | undefined;

const FALLBACK: Record<NonNullable<DictateResult['fallback']>, string> = {
  timeout: 'La limpieza tardaba demasiado: va tal y como se oyó',
  error: 'No se pudo limpiar: va tal y como se oyó',
  unavailable: 'No hay modelo de limpieza: va tal y como se oyó',
};

/** Why the hub cannot transcribe yet, for a tap on the microphone. */
export function notReady(info: DictationInfo | null): string | null {
  switch (info?.state) {
    case 'ready':
      return null;
    case 'downloading':
      return `Descargando el modelo de voz: ${Math.round((info.progress ?? 0) * 100)} %`;
    case 'loading':
      return 'Cargando el modelo de voz…';
    case 'error':
      return `El modelo de voz falló: ${info.error ?? 'error desconocido'}`;
    default:
      return 'El dictado está desactivado (Ajustes → Dictado)';
  }
}

/** Starts recording for a pane; what is said goes there when it stops. */
export async function startDictation(host: string, pane: string): Promise<void> {
  if (dictating.value || starting) return;
  const why = notReady(dictationInfo.value);
  if (why) return toast(why, 'error');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return toast('Este navegador no puede grabar audio aquí (hace falta HTTPS)', 'error');
  }
  starting = true;
  stopWanted = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    const denied = (err as Error).name === 'NotAllowedError';
    return toast(denied ? 'Has bloqueado el micrófono para este sitio. Actívalo en los ajustes del navegador.' : `No se pudo abrir el micrófono: ${(err as Error).message}`, 'error');
  } finally {
    starting = false;
  }
  if (stopWanted) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    dictationEnded.value = { pane, at: Date.now() };
    return;
  }
  chunks = [];
  cancelled = false;
  const rec = new MediaRecorder(stream);
  recorder = rec;
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.onstop = () => void finish(rec, host, pane);
  rec.start();
  dictating.value = { phase: 'recording', host, pane, since: Date.now() };
  // On a phone, a tick under the finger: it is listening, start talking.
  if (isTouch) navigator.vibrate?.(15);
  maxTimer = setTimeout(stopDictation, MAX_MS);
}

/** Stops recording and sends what was said. */
export function stopDictation(): void {
  if (starting) stopWanted = true;
  else if (dictating.value?.phase === 'recording') recorder?.stop();
}

/** Stops recording and throws it away. */
export function cancelDictation(): void {
  if (starting) stopWanted = true;
  if (dictating.value?.phase !== 'recording') return;
  cancelled = true;
  recorder?.stop();
}

/** The microphone's button and shortcut: start, or stop and send. */
export function toggleDictation(host: string, pane: string): void {
  const d = dictating.value;
  if (!d) void startDictation(host, pane);
  else if (d.phase === 'recording') stopDictation();
}

async function finish(rec: MediaRecorder, host: string, pane: string): Promise<void> {
  clearTimeout(maxTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  recorder = null;
  if (cancelled) {
    dictating.value = null;
    dictationEnded.value = { pane, at: Date.now() };
    return;
  }
  dictating.value = { ...dictating.value!, phase: 'sending' };
  try {
    const pcm = await toPcm(new Blob(chunks, { type: rec.mimeType }));
    if (pcm.length < SAMPLE_RATE * MIN_SECONDS) return;
    const res = await fetch(`/api/dictate?${new URLSearchParams({ host, pane })}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: pcm.buffer as ArrayBuffer,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<DictateResult> & { error?: string; message?: string };
    if (!res.ok) throw new Error(data.error ?? data.message ?? `Error ${res.status}`);
    if (!data.text) toast('No se ha entendido nada');
    else if (data.fallback) toast(FALLBACK[data.fallback]);
  } catch (err) {
    toast(`Dictado: ${(err as Error).message}`, 'error');
  } finally {
    chunks = [];
    dictating.value = null;
    dictationEnded.value = { pane, at: Date.now() };
  }
}

/** The hub's shortcut (Ajustes → Dictado), or the default one. */
export function dictationShortcut(): Shortcut {
  return parseShortcut(hubSettings.value?.dictationShortcut ?? '') ?? parseShortcut(DEFAULT_DICTATION_SHORTCUT)!;
}

export function shortcutFromEvent(e: KeyboardEvent): Shortcut {
  return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, code: e.code };
}

function matches(e: KeyboardEvent, sc: Shortcut): boolean {
  return e.code === sc.code && e.ctrlKey === sc.ctrl && e.altKey === sc.alt && e.shiftKey === sc.shift && e.metaKey === sc.meta;
}

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const KEY_NAMES: Record<string, string> = {
  Space: 'Espacio', Enter: 'Enter', Backspace: '⌫', Tab: 'Tab', Insert: 'Insert', Delete: 'Supr', Home: 'Inicio', End: 'Fin', PageUp: 'RePág', PageDown: 'AvPág',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
};

/** "Ctrl+Shift+Espacio", "Cmd+Option+D". */
export function formatShortcut(sc: Shortcut): string {
  const mods = [sc.ctrl && 'Ctrl', sc.alt && (MAC ? 'Option' : 'Alt'), sc.shift && 'Shift', sc.meta && (MAC ? 'Cmd' : 'Win')].filter(Boolean);
  const key = KEY_NAMES[sc.code] ?? sc.code.replace(/^(Key|Digit)/, '');
  return [...mods, key].join('+');
}

/** Held longer than this, the shortcut is push-to-talk (releasing sends); shorter, a press that starts and another that sends. */
const HOLD_MS = 350;
let keyHold: { code: string; at: number } | null = null;

/**
 * The shortcut for a pane: held, it records until released; pressed and let go, it
 * records until pressed again. Escape discards a recording. True when the key was the
 * dictation's (the caller keeps it from the terminal).
 */
export function dictationKeyDown(e: KeyboardEvent, host: string, pane: string): boolean {
  if (recordingShortcut.value) return false;
  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (dictating.value?.phase === 'recording' || starting)) {
    keyHold = null;
    cancelDictation();
    return true;
  }
  if (!matches(e, dictationShortcut())) return false;
  if (e.repeat) return true;
  if (dictating.value?.phase === 'recording' || starting) {
    keyHold = null;
    stopDictation();
  } else if (!dictating.value) {
    keyHold = { code: e.code, at: Date.now() };
    void startDictation(host, pane);
  }
  return true;
}

export function dictationKeyUp(e: KeyboardEvent): boolean {
  if (!keyHold || e.code !== keyHold.code) return false;
  const held = Date.now() - keyHold.at;
  keyHold = null;
  if (held >= HOLD_MS) stopDictation();
  return true;
}

/** The window lost the keyboard while the shortcut was held: its release will not arrive, so it counts as one. */
export function dictationBlur(): void {
  if (keyHold) dictationKeyUp(new KeyboardEvent('keyup', { code: keyHold.code }));
}

/**
 * The recording (WebM/Opus on Chrome, MP4/AAC on Safari) as 16 kHz mono 16-bit PCM,
 * what Parakeet takes: the browser decodes and resamples it, so the hub needs no ffmpeg.
 */
async function toPcm(blob: Blob): Promise<Int16Array> {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const n = audio.length;
  const mono = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-1, Math.min(1, mono[i])) * 0x7fff;
  return pcm;
}
