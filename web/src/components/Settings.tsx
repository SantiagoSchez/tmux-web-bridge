import { useEffect, useState } from 'preact/hooks';
import { auth, logout } from '../auth';
import { disablePresence, enablePresence, presenceState, type PresenceState } from '../presence';
import { dialog, sheet, toast, vapidKey } from '../state';
import { Sheet } from './Dialogs';
import { TwoFactorSettings } from './TwoFactor';

type PushState = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on' | 'busy';

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function detect(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  if (!sub) return 'off';
  // The browser may hold a subscription the hub forgot (data dir wiped): re-register it.
  const status = await fetch(`/api/push/status?endpoint=${encodeURIComponent(sub.endpoint)}`).then((r) => r.json());
  if (!status.subscribed) await post('/api/push/subscribe', { subscription: sub.toJSON() });
  return 'on';
}

const STATE_TEXT: Record<PushState, string> = {
  unsupported: 'Este navegador no admite notificaciones push.',
  insecure: 'Hace falta HTTPS para las notificaciones.',
  denied: 'Has bloqueado las notificaciones para este sitio. Actívalas en los ajustes del navegador.',
  off: 'Desactivadas en este dispositivo.',
  on: 'Activadas en este dispositivo.',
  busy: '…',
};

const PRESENCE_TEXT: Record<PresenceState, string> = {
  unsupported: 'Este navegador no puede saber si estás usando el dispositivo (hace falta Chrome, Edge o Brave).',
  denied: 'Has bloqueado la detección de actividad para este sitio. Actívala en los ajustes del navegador.',
  off: 'Desactivado en este dispositivo.',
  on: 'Activado: mientras lo uses, no llegan notificaciones a ningún dispositivo.',
};

function logoutEverywhere(): void {
  dialog.value = {
    kind: 'confirm',
    title: '¿Cerrar todas las sesiones?',
    message: 'Todos los navegadores que hayan entrado con la contraseña, este incluido, tendrán que volver a escribirla.',
    confirm: 'Cerrar todas',
    danger: true,
    onSubmit: () => {
      sheet.value = null;
      void logout(true);
    },
  };
}

export function Settings() {
  const open = sheet.value === 'settings';
  const [push, setPush] = useState<PushState>('busy');

  useEffect(() => {
    if (open) detect().then(setPush, () => setPush('unsupported'));
  }, [open]);
  if (!open) return null;

  const enable = async () => {
    setPush('busy');
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setPush('denied');
      if (!vapidKey.value) throw new Error('El servidor no ha enviado su clave VAPID');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey.value) });
      await post('/api/push/subscribe', { subscription: sub.toJSON() });
      setPush('on');
      toast('Notificaciones activadas');
    } catch (err) {
      toast(`No se pudieron activar: ${(err as Error).message}`, 'error');
      setPush(await detect().catch(() => 'unsupported' as const));
    }
  };

  const disable = async () => {
    setPush('busy');
    const sub = await currentSubscription();
    if (sub) {
      await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    setPush('off');
  };

  const test = async () => {
    const sub = await currentSubscription();
    const res = await post('/api/push/test', { endpoint: sub?.endpoint }).catch((e) => ({ ok: false, error: e.message }));
    toast(res.ok ? 'Notificación de prueba enviada' : `Fallo al enviar: ${res.error ?? 'sin destinatarios'}`, res.ok ? 'info' : 'error');
  };

  return (
    <Sheet title="Ajustes" onClose={() => (sheet.value = null)}>
      <section class="settings-group">
        <h3>Notificaciones</h3>
        <p class="dim small">Avisos de 🙋 preguntas, 💬 permisos y ✅ tareas terminadas de Claude, salvo que ya lo estés mirando.</p>
        <p class="settings-state">{STATE_TEXT[push]}</p>
        <div class="row-btns">
          {push === 'off' && (
            <button class="btn btn-primary" onClick={enable}>
              Activar en este dispositivo
            </button>
          )}
          {push === 'on' && (
            <>
              <button class="btn" onClick={test}>
                Enviar prueba
              </button>
              <button class="btn" onClick={disable}>
                Desactivar
              </button>
            </>
          )}
        </div>
      </section>

      <section class="settings-group">
        <h3>Silenciar mientras uso este dispositivo</h3>
        <p class="dim small">
          Si has usado el teclado o el ratón en los últimos 5 minutos (en cualquier aplicación) y la pantalla no está bloqueada, no se envían notificaciones: los
          avisos ya están en la lista de pendientes. Necesita esta app abierta, aunque sea en segundo plano.
        </p>
        <p class="settings-state">{PRESENCE_TEXT[presenceState.value]}</p>
        <div class="row-btns">
          {presenceState.value === 'off' && (
            <button class="btn btn-primary" onClick={() => void enablePresence()}>
              Activar en este dispositivo
            </button>
          )}
          {presenceState.value === 'on' && (
            <button class="btn" onClick={disablePresence}>
              Desactivar
            </button>
          )}
        </div>
      </section>

      {auth.value?.method === 'password' && <TwoFactorSettings />}

      {auth.value?.method === 'password' && (
        <section class="settings-group">
          <h3>Sesión</h3>
          <p class="dim small">Se cierra sola tras {auth.value.days ?? 30} días sin abrir el panel en este dispositivo.</p>
          <div class="row-btns">
            <button class="btn" onClick={() => void logout()}>
              Cerrar sesión
            </button>
            <button class="btn" onClick={logoutEverywhere}>
              En todos los dispositivos
            </button>
          </div>
        </section>
      )}
    </Sheet>
  );
}
