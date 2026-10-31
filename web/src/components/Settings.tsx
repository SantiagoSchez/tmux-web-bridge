import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { auth, logout } from '../auth';
import { disablePresence, enablePresence, presenceState, type PresenceState } from '../presence';
import { dialog, hubSettings, sheet, toast, vapidKey } from '../state';
import { newer, updateInfo } from '../updates';
import { hub } from '../ws';
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

/** Why the switch can't be used here (when it can, it says on or off by itself). */
const PUSH_NOTE: Partial<Record<PushState, string>> = {
  unsupported: 'Este navegador no admite notificaciones push.',
  insecure: 'Hace falta HTTPS para las notificaciones.',
  denied: 'Has bloqueado las notificaciones para este sitio. Actívalas en los ajustes del navegador.',
};

const PRESENCE_NOTE: Partial<Record<PresenceState, string>> = {
  unsupported: 'Este navegador no puede saber si estás usando el dispositivo (hace falta Chrome, Edge o Brave).',
  denied: 'Has bloqueado la detección de actividad para este sitio. Actívala en los ajustes del navegador.',
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

/** One setting: name, explanation, a switch on the right, and what goes with it underneath. */
function Toggle(props: { title: string; desc: ComponentChildren; on: boolean; disabled?: boolean; onChange: (on: boolean) => void; children?: ComponentChildren }) {
  return (
    <section class="setting">
      <div class="setting-row">
        <div class="setting-text">
          <h3>{props.title}</h3>
          <p class="dim small">{props.desc}</p>
        </div>
        <button
          class={`switch ${props.on ? 'on' : ''}`}
          role="switch"
          aria-checked={props.on}
          aria-label={props.title}
          disabled={props.disabled}
          onClick={() => props.onChange(!props.on)}
        />
      </div>
      {props.children}
    </section>
  );
}

type Tab = 'device' | 'machines' | 'account';

export function Settings() {
  const open = sheet.value === 'settings';
  const [tab, setTab] = useState<Tab>('device');
  const account = auth.value?.method === 'password';
  if (!open) return null;

  const tabs: [Tab, string][] = [
    ['device', 'Dispositivo'],
    ['machines', 'Máquinas'],
  ];
  if (account) tabs.push(['account', 'Cuenta']);
  const current = tab === 'account' && !account ? 'device' : tab;

  return (
    <Sheet title="Ajustes" onClose={() => (sheet.value = null)}>
      <div class="settings-tabs" role="tablist" aria-label="Secciones de los ajustes">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={current === id} class={current === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div class="settings-panel" role="tabpanel">
        {current === 'device' && <DeviceSettings />}
        {current === 'machines' && <MachineSettings />}
        {current === 'account' && <AccountSettings />}
      </div>
    </Sheet>
  );
}

/** This browser only: its notifications and whether using it silences them. */
function DeviceSettings() {
  const [push, setPush] = useState<PushState>('busy');
  useEffect(() => {
    detect().then(setPush, () => setPush('unsupported'));
  }, []);

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

  const presence = presenceState.value;
  return (
    <>
      <Toggle
        title="Notificaciones"
        desc="Avisos de 🙋 preguntas, 💬 permisos y ✅ tareas terminadas de Claude en este dispositivo, salvo que ya lo estés mirando."
        on={push === 'on'}
        disabled={push !== 'on' && push !== 'off'}
        onChange={(on) => void (on ? enable() : disable())}
      >
        {PUSH_NOTE[push] && <p class="settings-state small">{PUSH_NOTE[push]}</p>}
        {push === 'on' && (
          <div class="row-btns">
            <button class="btn" onClick={test}>
              Enviar prueba
            </button>
          </div>
        )}
      </Toggle>

      <Toggle
        title="Silenciar mientras lo uso"
        desc="Si has usado el teclado o el ratón en los últimos 5 minutos (en cualquier aplicación) y la pantalla no está bloqueada, no llegan notificaciones a ningún dispositivo: los avisos ya están en la lista de pendientes. Necesita esta app abierta, aunque sea en segundo plano."
        on={presence === 'on'}
        disabled={presence !== 'on' && presence !== 'off'}
        onChange={(on) => (on ? void enablePresence() : disablePresence())}
      >
        {PRESENCE_NOTE[presence] && <p class="settings-state small">{PRESENCE_NOTE[presence]}</p>}
      </Toggle>
    </>
  );
}

/** The hub's settings: the same for every machine and every device. */
function MachineSettings() {
  const s = hubSettings.value;
  const info = updateInfo.value;
  const latest = info?.latest?.version;
  const updateState = !info?.enabled
    ? null
    : latest && newer(latest, info.current)
      ? `Hay una versión nueva: ${latest} (este servidor tiene la ${info.current}).`
      : `Al día: versión ${info.current}.`;
  return (
    <>
      <p class="settings-scope dim small">Valen para todas las máquinas y todos los dispositivos.</p>
      {s && (
        <Toggle
          title="Límites en la status line"
          desc="Los límites de 5 h y semanal al final de la línea de estado de Claude Code. Desactívalo si la barra de tmux ya los muestra; en el panel siguen siempre en la franja de arriba."
          on={s.limitsInStatusLine}
          onChange={(on) => hub.send({ t: 'settings', settings: { limitsInStatusLine: on } })}
        />
      )}
      {info && (
        <Toggle
          title="Buscar actualizaciones"
          desc="Una vez al día el servidor central mira en GitHub si hay una versión nueva de twb, y avisa también de las máquinas cuyo kit va por detrás. No se envía ningún dato."
          on={info.enabled}
          onChange={(on) => hub.send({ t: 'updateCheck', enabled: on })}
        >
          {updateState && <p class="settings-state small">{updateState}</p>}
        </Toggle>
      )}
    </>
  );
}

/** Password login only: two-step verification and the sessions. */
function AccountSettings() {
  return (
    <>
      <TwoFactorSettings />
      <section class="setting">
        <h3>Sesión</h3>
        <p class="dim small">Se cierra sola tras {auth.value?.days ?? 30} días sin abrir el panel en este dispositivo.</p>
        <div class="row-btns">
          <button class="btn" onClick={() => void logout()}>
            Cerrar sesión
          </button>
          <button class="btn" onClick={logoutEverywhere}>
            En todos los dispositivos
          </button>
        </div>
      </section>
    </>
  );
}
