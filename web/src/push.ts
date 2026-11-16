import { hub } from './ws';

/** This browser's Web Push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Tells the hub which push subscription is this device's, so that while you work
 * here with the app hidden it notifies only here.
 */
export async function syncPushEndpoint(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    hub.setPushEndpoint((await currentSubscription())?.endpoint ?? null);
  } catch {
    hub.setPushEndpoint(null);
  }
}
