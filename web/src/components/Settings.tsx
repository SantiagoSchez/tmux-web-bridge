import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { auth, logout } from '../auth';
import { prefs, setPref, type Prefs } from '../prefs';
import { disablePresence, enablePresence, presenceState, type PresenceState } from '../presence';
import { DEFAULT_DICTATION_SHORTCUT, DICTATION_TIMEOUTS, parseShortcut, serializeShortcut, shortcutProblem, type DictationButton } from '../../../shared/dictation';
import { formatShortcut, notReady, recordingShortcut, shortcutFromEvent } from '../dictation';
import { dialog, dictationInfo, hubSettings, settingsTab, sheet, toast, vapidKey, type SettingsTab } from '../state';
import { newer, updateInfo } from '../updates';
import { hub } from '../ws';
import { Sheet } from './Dialogs';
import { FolderSettings } from './Folders';
import { KeybarSettings } from './KeybarSettings';
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

export function Settings() {
  const open = sheet.value === 'settings';
  const tab = settingsTab.value;
  const setTab = (t: SettingsTab) => (settingsTab.value = t);
  const account = auth.value?.method === 'password';
  if (!open) return null;

  const tabs: [SettingsTab, string][] = [
    ['device', 'Dispositivo'],
    ['machines', 'Máquinas'],
    ['folders', 'Carpetas'],
    ['dictation', 'Dictado'],
    ['keys', 'Teclas'],
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
        {current === 'folders' && <FolderSettings />}
        {current === 'dictation' && <DictationSettings />}
        {current === 'keys' && <KeybarSettings />}
        {current === 'account' && <AccountSettings />}
      </div>
    </Sheet>
  );
}

const THEMES: [Prefs['theme'], string][] = [
  ['dark', 'Oscuro'],
  ['light', 'Claro'],
  ['system', 'Sistema'],
];

/** This browser only: its look, its notifications and whether using it silences them. */
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
  const theme = prefs.value.theme;
  return (
    <>
      <section class="setting">
        <h3>Tema</h3>
        <p class="dim small">Los colores del panel y del terminal en este dispositivo. «Sistema» sigue el modo claro u oscuro que tenga configurado.</p>
        <div class="seg" role="radiogroup" aria-label="Tema">
          {THEMES.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={theme === id} class={theme === id ? 'on' : ''} onClick={() => setPref('theme', id)}>
              {label}
            </button>
          ))}
        </div>
      </section>

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
          title="Spaces de una ventana en una fila"
          desc="Un space con una sola ventana se muestra como una única fila, sin cabecera aparte. Desactívalo para ver siempre el space y sus ventanas por separado."
          on={s.soloSpaces}
          onChange={(on) => hub.send({ t: 'settings', settings: { soloSpaces: on } })}
        />
      )}
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

const MIC_MODES: [DictationButton, string][] = [
  ['hold', 'Mantener pulsado'],
  ['toggle', 'Tocar y volver a tocar'],
];

/** The dictation shortcut: shown, and changed by pressing the new combination. */
function ShortcutSetting({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const listening = recordingShortcut.value;
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        recordingShortcut.value = false;
        return;
      }
      const sc = shortcutFromEvent(e);
      const why = parseShortcut(serializeShortcut(sc)) ? null : (shortcutProblem(sc) ?? 'Esa tecla no se puede usar.');
      setProblem(why ? `${formatShortcut(sc)}: ${why}` : null);
      if (why) return;
      onChange(serializeShortcut(sc));
      recordingShortcut.value = false;
    };
    globalThis.addEventListener('keydown', onKey, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKey, { capture: true });
      recordingShortcut.value = false;
    };
  }, [listening]);
  const current = parseShortcut(value);
  return (
    <section class="setting">
      <h3>Atajo de teclado</h3>
      <p class="dim small">Mantenlo pulsado mientras hablas y suéltalo para enviar, o púlsalo una vez para empezar y otra para enviar. Esc descarta lo grabado.</p>
      <div class="row-btns">
        <kbd class="shortcut">{listening ? 'Pulsa la combinación…' : current ? formatShortcut(current) : value}</kbd>
        {listening ? (
          <button class="btn" onClick={() => (recordingShortcut.value = false)}>
            Cancelar
          </button>
        ) : (
          <button
            class="btn"
            onClick={() => {
              setProblem(null);
              recordingShortcut.value = true;
            }}
          >
            Cambiar
          </button>
        )}
        {!listening && value !== DEFAULT_DICTATION_SHORTCUT && (
          <button class="btn" onClick={() => onChange(DEFAULT_DICTATION_SHORTCUT)}>
            Restablecer
          </button>
        )}
      </div>
      {problem && <p class="settings-state small">{problem}</p>}
    </section>
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
            Un botón 🎤 en la barra de teclas del móvil y encima de la terminal en el escritorio, y un atajo de teclado. El servidor central transcribe lo que dices y
            lo escribe en el panel, sin Enter. Nada sale de tu red. El modelo de voz (Parakeet v3) se descarga la primera vez (unos 670 MB) y ocupa
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
            <h3>Botón 🎤</h3>
            <p class="dim small">
              {s.dictationButton === 'toggle'
                ? 'Tócalo para empezar a hablar y otra vez para enviarlo; ✕ lo descarta.'
                : 'Mantenlo pulsado mientras hablas y suéltalo para enviarlo. Para descartarlo, desliza el dedo fuera del botón antes de soltar.'}
            </p>
            <div class="seg" role="radiogroup" aria-label="Botón del dictado">
              {MIC_MODES.map(([id, label]) => (
                <button key={id} role="radio" aria-checked={s.dictationButton === id} class={s.dictationButton === id ? 'on' : ''} onClick={() => set({ dictationButton: id })}>
                  {label}
                </button>
              ))}
            </div>
          </section>
          <ShortcutSetting value={s.dictationShortcut} onChange={(v) => set({ dictationShortcut: v })} />
          <section class="setting">
            <h3>Limpieza</h3>
            <p class="dim small">
              Un modelo local quita las muletillas, se queda con la última versión cuando te corriges («la dos, no, la tres») y arregla los términos técnicos, con el
              glosario y lo que hay en la pantalla del panel.
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
          {s.dictationCleanup === 'llm' && (
            <section class="setting">
              <h3>Tiempo máximo</h3>
              <p class="dim small">Lo que puede tardar la limpieza. Si pasa de ahí, el texto va tal y como se oyó. Los dictados largos necesitan más.</p>
              <div class="seg" role="radiogroup" aria-label="Tiempo máximo de la limpieza">
                {DICTATION_TIMEOUTS.map((secs) => (
                  <button key={secs} role="radio" aria-checked={s.dictationTimeout === secs} class={s.dictationTimeout === secs ? 'on' : ''} onClick={() => set({ dictationTimeout: secs })}>
                    {secs} s
                  </button>
                ))}
              </div>
            </section>
          )}
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
