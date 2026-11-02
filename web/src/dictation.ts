import { signal } from '@preact/signals';
import type { DictateResult, DictationInfo } from '../../shared/types';
import { dictationInfo, toast } from './state';

const SAMPLE_RATE = 16_000;
/** The hub takes up to five minutes; the recording stops by itself a bit before. */
const MAX_MS = 4.5 * 60 * 1000;
/** Shorter than this is a tap by mistake, not something said. */
const MIN_SECONDS = 0.4;

/** The dictation in progress (one at a time): recording, or being transcribed by the hub. */
export const dictating = signal<{ phase: 'recording' | 'sending'; host: string; pane: string; since: number } | null>(null);

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
  if (dictating.value) return;
  const why = notReady(dictationInfo.value);
  if (why) return toast(why, 'error');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return toast('Este navegador no puede grabar audio aquí (hace falta HTTPS)', 'error');
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    const denied = (err as Error).name === 'NotAllowedError';
    return toast(denied ? 'Has bloqueado el micrófono para este sitio. Actívalo en los ajustes del navegador.' : `No se pudo abrir el micrófono: ${(err as Error).message}`, 'error');
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
  maxTimer = setTimeout(stopDictation, MAX_MS);
}

/** Stops recording and sends what was said. */
export function stopDictation(): void {
  if (dictating.value?.phase === 'recording') recorder?.stop();
}

/** Stops recording and throws it away. */
export function cancelDictation(): void {
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
  }
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
