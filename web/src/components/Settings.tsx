import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { auth, logout } from '../auth';
import { disablePresence, enablePresence, presenceState, type PresenceState } from '../presence';
import { notReady } from '../dictation';
import { dialog, dictationInfo, hubSettings, sheet, toast, vapidKey } from '../state';
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

type Tab = 'device' | 'machines' | 'dictation' | 'account';

export function Settings() {
  const open = sheet.value === 'settings';
  const [tab, setTab] = useState<Tab>('device');
  const account = auth.value?.method === 'password';
  if (!open) return null;

  const tabs: [Tab, string][] = [
    ['device', 'Dispositivo'],
    ['machines', 'Máquinas'],
    ['dictation', 'Dictado'],
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
        {current === 'dictation' && <DictationSettings />}
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

const LLM_STATE = { unset: 'sin configurar en el servidor', ok: 'responde', down: 'no responde' } as const;

/** Dictation, for the whole hub: on or off, how the transcript is cleaned up, and the glossary. */
function DictationSettings() {
  const s = hubSettings.value;
  const info = dictationInfo.value;
  const [glossary, setGlossary] = useState(s?.dictationGlossary ?? '');
  useEffect(() => setGlossary(s?.dictationGlossary ?? ''), [s?.dictationGlossary]);
  if (!s) return null;
  const set = (patch: Partial<typeof s>) => hub.send({ t: 'settings', settings: patch });
  const state = s.dictation ? (notReady(info) ?? 'Listo.') : null;
  const llm = info?.llm ?? 'unset';
  return (
    <>
      <p class="settings-scope dim small">Valen para todas las máquinas y todos los dispositivos.</p>
      <Toggle
        title="Dictado"
        desc={
          <>
            Un botón 🎤 en la barra de teclas del móvil y junto a la letra en el escritorio (o Ctrl+Shift+Espacio): tócalo, habla y vuelve a tocarlo. El servidor central lo
            transcribe y lo escribe en el panel, sin Enter. Nada sale de tu red. El modelo de voz (Parakeet v3) se descarga la primera vez (unos 670 MB) y ocupa
            alrededor de 1 GB de memoria del servidor.
          </>
        }
        on={s.dictation}
        onChange={(on) => set({ dictation: on })}
      >
        {state && <p class="settings-state small">{state}</p>}
      </Toggle>
      {s.dictation && (
        <>
          <section class="setting">
            <h3>Limpieza</h3>
            <p class="dim small">
              Un modelo local quita las muletillas, se queda con la última versión cuando te corriges («la dos, no, la tres») y arregla los términos técnicos, con el
              glosario y lo que hay en la pantalla del panel. Tarda unos segundos; si pasa de 10, el texto va tal y como se oyó.
            </p>
            <div class="seg" role="radiogroup" aria-label="Limpieza del dictado">
              <button role="radio" aria-checked={s.dictationCleanup === 'llm'} class={s.dictationCleanup === 'llm' ? 'on' : ''} onClick={() => set({ dictationCleanup: 'llm' })}>
                {info?.llmModel ?? 'Qwen3.5 4B'}
              </button>
              <button role="radio" aria-checked={s.dictationCleanup === 'none'} class={s.dictationCleanup === 'none' ? 'on' : ''} onClick={() => set({ dictationCleanup: 'none' })}>
                Sin limpieza
              </button>
            </div>
            {s.dictationCleanup === 'llm' && <p class="settings-state small">Modelo de limpieza: {LLM_STATE[llm]}.</p>}
          </section>
          <section class="setting">
            <h3>Glosario</h3>
            <p class="dim small">Nombres y términos que el reconocimiento suele oír mal (uno por línea): proyectos, herramientas, comandos.</p>
            <textarea
              class="glossary"
              rows={5}
              value={glossary}
              placeholder={'tmux\npnpm\nClaude Code'}
              spellcheck={false}
              autocapitalize="off"
              onInput={(e) => setGlossary(e.currentTarget.value)}
              onBlur={() => glossary !== s.dictationGlossary && set({ dictationGlossary: glossary })}
            />
          </section>
        </>
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
