import { signal } from '@preact/signals';
import { prefs, setPref } from './prefs';
import { toast } from './state';
import { hub } from './ws';

// Idle Detection API (Chromium only): keyboard/mouse activity anywhere on the
// system and whether the screen is locked, even with the app in the background.
declare class IdleDetector extends EventTarget {
  static requestPermission(): Promise<PermissionState>;
  readonly userState: 'active' | 'idle' | null;
  readonly screenState: 'locked' | 'unlocked' | null;
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>;
}

/** No input for this long, or the screen locked, and you are no longer at this device. */
const IDLE_MS = 5 * 60_000;

export type PresenceState = 'unsupported' | 'denied' | 'off' | 'on';

export const presenceState = signal<PresenceState>('IdleDetector' in window ? 'off' : 'unsupported');

let stop: AbortController | null = null;

async function start(): Promise<void> {
  stop?.abort();
  stop = new AbortController();
  const detector = new IdleDetector();
  const update = () => hub.setPresent(detector.userState === 'active' && detector.screenState === 'unlocked');
  detector.addEventListener('change', update);
  await detector.start({ threshold: IDLE_MS, signal: stop.signal });
  update();
  presenceState.value = 'on';
}

/** At startup: back on if it was on here and the permission still holds (asking needs a click). */
export async function resumePresence(): Promise<void> {
  if (presenceState.value === 'unsupported' || !prefs.value.silenceWhilePresent) return;
  try {
    const perm = await navigator.permissions.query({ name: 'idle-detection' as PermissionName });
    if (perm.state === 'granted') await start();
    else presenceState.value = perm.state === 'denied' ? 'denied' : 'off';
  } catch {
    presenceState.value = 'off';
  }
}

export async function enablePresence(): Promise<void> {
  try {
    if ((await IdleDetector.requestPermission()) !== 'granted') {
      presenceState.value = 'denied';
      return;
    }
    await start();
    setPref('silenceWhilePresent', true);
  } catch (err) {
    toast(`No se pudo activar: ${(err as Error).message}`, 'error');
  }
}

export function disablePresence(): void {
  stop?.abort();
  stop = null;
  setPref('silenceWhilePresent', false);
  hub.setPresent(false);
  presenceState.value = 'off';
}
