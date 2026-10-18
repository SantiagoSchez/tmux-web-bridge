import { signal } from '@preact/signals';
import { hub } from './ws';

export interface AuthState {
  method: 'tailscale' | 'password';
  authenticated: boolean;
  /** Days a login lasts without use (method "password"). */
  days?: number;
  /** Was signed in and lost it (expired or closed from another device). */
  expired?: boolean;
}

/** null while the first check runs. */
export const auth = signal<AuthState | null>(null);

async function fetchSession(): Promise<AuthState> {
  const res = await fetch('/api/session', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** First check on load: the socket only opens once there is a session. */
export async function boot(): Promise<void> {
  try {
    auth.value = await fetchSession();
  } catch {
    // Hub unreachable: try the socket anyway, it shows the reconnecting state.
    auth.value = { method: 'tailscale', authenticated: true };
  }
  if (auth.value.authenticated) hub.connect();
}

export function signedIn(): void {
  auth.value = { ...auth.value, method: 'password', authenticated: true, expired: false };
  hub.connect();
}

/** The socket keeps failing: find out whether the session is gone. */
export async function recheck(): Promise<boolean> {
  try {
    const s = await fetchSession();
    if (s.authenticated) return true;
    signedOut();
    return false;
  } catch {
    return true; // hub down, not logged out: keep retrying
  }
}

export function signedOut(): void {
  hub.disconnect();
  auth.value = { ...auth.value, method: 'password', authenticated: false, expired: true };
}

export async function logout(all = false): Promise<void> {
  await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all }) }).catch(() => {});
  hub.disconnect();
  auth.value = { ...auth.value, method: 'password', authenticated: false, expired: false };
}
