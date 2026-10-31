import { computed, signal } from '@preact/signals';
import type { HostInfo, UpdateInfo } from '../../shared/types';
import { hosts } from './state';

/** The hub's daily check for a new release (see server/src/updates.ts). */
export const updateInfo = signal<UpdateInfo | null>(null);
/** Kits being updated from the panel: the buttons wait meanwhile. */
export const kitUpdating = signal(false);

/** Whether version a ("1.2.0") is newer than b. */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/**
 * Whether a machine's kit is behind that release. A kit older than 1.0.0 publishes no
 * version: a machine with numbered spaces has one. A machine that does not answer is left
 * out until it is back.
 */
export function kitBehind(h: HostInfo, latest: string): boolean {
  return h.status === 'ok' && (h.kit ? newer(latest, h.kit) : h.sessions.some((s) => s.num !== null));
}

/** The last release, when the check is on (whether or not its notice was closed). */
export const latestRelease = computed(() => {
  const info = updateInfo.value;
  return info?.enabled && info.latest ? info.latest.version : null;
});

/** What the notice says: the hub and the machines whose kit is behind the last release. */
export const updateNotice = computed(() => {
  const info = updateInfo.value;
  if (!info?.enabled || !info.latest || info.dismissed === info.latest.version) return null;
  const latest = info.latest.version;
  const hub = newer(latest, info.current);
  const kits = hosts.value.filter((h) => kitBehind(h, latest));
  if (!hub && !kits.length) return null;
  return { latest, url: info.latest.url, current: info.current, hub, kits };
});
