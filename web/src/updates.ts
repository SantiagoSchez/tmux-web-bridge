import { computed, signal } from '@preact/signals';
import type { UpdateInfo } from '../../shared/types';
import { hosts } from './state';

/** The hub's daily check for a new release (see server/src/updates.ts). */
export const updateInfo = signal<UpdateInfo | null>(null);

/** Whether version a ("1.2.0") is newer than b. */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/**
 * What the notice says: the hub and the machines whose kit is behind the last release.
 * A kit older than 1.0.0 publishes no version: a machine with numbered spaces has one.
 */
export const updateNotice = computed(() => {
  const info = updateInfo.value;
  if (!info?.enabled || !info.latest || info.dismissed === info.latest.version) return null;
  const latest = info.latest.version;
  const hub = newer(latest, info.current);
  const kits = hosts.value
    .filter((h) => h.status === 'ok' && (h.kit ? newer(latest, h.kit) : h.sessions.some((s) => s.num !== null)))
    .map((h) => h.name);
  if (!hub && !kits.length) return null;
  return { latest, url: info.latest.url, current: info.current, hub, kits };
});
