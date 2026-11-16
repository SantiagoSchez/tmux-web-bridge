import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_DICTATION_SHORTCUT, dictationShortcutOf } from '../../../shared/dictation';
import { PANEL_SHORTCUT_IDS, PANEL_SHORTCUTS, panelDefault, panelShortcut, serializeShortcut, shortcutClash, shortcutRefusal, type PanelShortcutId, type Shortcut } from '../../../shared/shortcuts';
import { prefs, setPref } from '../prefs';
import { isMac, recordingShortcut, shortcutFromEvent, shortcutOf, shortcutText } from '../shortcuts';
import { hubSettings } from '../state';
import { hub } from '../ws';

type Taken = { label: string; shortcut: Shortcut };

const DICTATION = 'Dictado';

/**
 * One shortcut: its combination, changed by pressing «Cambiar» and then the new one
 * (Escape cancels), and «Restablecer» back to `fallback` while it is another. A
 * combination, or a default, that would type, that the terminal, the number shortcuts or
 * the quick note's colours use, or that `taken` holds is refused with the reason. While
 * it listens, no shortcut of the panel acts.
 */
function ShortcutRow(props: { id: string; label: string; desc?: string; value: Shortcut; fallback: Shortcut; taken: Taken[]; onChange: (v: string | null) => void; note?: string | null }) {
  const { id, label, value, fallback } = props;
  const listening = recordingShortcut.value === id;
  const [problem, setProblem] = useState<string | null>(null);
  // Read by the listener, so a re-render (a hub broadcast) does not restart it.
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat || ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return;
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        recordingShortcut.value = null;
        return;
      }
      const sc = shortcutFromEvent(e);
      const why = shortcutRefusal(sc, latest.current.taken);
      setProblem(why && `${shortcutText(sc)}: ${why}`);
      if (why) return;
      latest.current.onChange(serializeShortcut(sc));
      recordingShortcut.value = null;
    };
    globalThis.addEventListener('keydown', onKey, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKey, { capture: true });
      if (recordingShortcut.value === id) recordingShortcut.value = null;
      setProblem(null);
    };
  }, [listening]);
  // A refused «Restablecer» is explained while the reason holds: once the other shortcut moves, it goes.
  const [resetTried, setResetTried] = useState(false);
  const resetWhy = shortcutRefusal(fallback, props.taken);
  useEffect(() => {
    if (!resetWhy) setResetTried(false);
  }, [resetWhy]);
  const reset = () => {
    setProblem(null);
    setResetTried(!!resetWhy);
    if (!resetWhy) props.onChange(null);
  };
  const byDefault = serializeShortcut(value) === serializeShortcut(fallback);
  const resetProblem = resetTried && !byDefault && resetWhy && `«Restablecer» no se puede: ${shortcutText(fallback)} ${resetWhy}`;
  return (
    <section class="setting shortcut-row">
      <h3>{label}</h3>
      {props.desc && <p class="dim small">{props.desc}</p>}
      <div class="row-btns">
        <kbd class="shortcut">{listening ? 'Pulsa la combinación…' : shortcutText(value)}</kbd>
        {listening ? (
          <button class="btn" onClick={() => (recordingShortcut.value = null)}>
            Cancelar
          </button>
        ) : (
          <button
            class="btn"
            onClick={() => {
              setProblem(null);
              setResetTried(false);
              recordingShortcut.value = id;
            }}
          >
            Cambiar
          </button>
        )}
        {!listening && !byDefault && (
          <button class="btn" onClick={reset}>
            Restablecer
          </button>
        )}
      </div>
      {(problem || resetProblem) && <p class="settings-state small">{problem || resetProblem}</p>}
      {props.note && <p class="settings-state small">{props.note}</p>}
    </section>
  );
}

/** The number shortcuts, the same as tmux's: listed, never changed. */
const FIXED = [
  { label: 'Ir a la ventana N del espacio', keys: isMac ? '⌃1…9' : 'Ctrl+1…9' },
  { label: 'Ir al espacio N', keys: isMac ? '⌃⇧1…9' : 'Ctrl+Shift+1…9' },
  { label: 'Ir a la máquina N', keys: isMac ? '⌃⌥⇧1…9' : 'Ctrl+Alt+Shift+1…9' },
];

/**
 * Ajustes › Atajos: the panel's shortcuts, kept on this device, the dictation's, kept by
 * the hub for every device, and the fixed number shortcuts.
 */
export function ShortcutSettings() {
  const s = hubSettings.value;
  const saved = prefs.value.shortcuts;
  const panel = PANEL_SHORTCUT_IDS.map((id) => ({ id, label: PANEL_SHORTCUTS[id].label, shortcut: shortcutOf(id) }));
  const dictation = dictationShortcutOf(s?.dictationShortcut);
  const all: (Taken & { id: string })[] = [...panel, { id: 'dictation', label: DICTATION, shortcut: dictation }];
  const others = (id: string) => all.filter((t) => t.id !== id);
  const setPanel = (id: PanelShortcutId, v: string | null) => {
    const next = { ...saved };
    if (v === null || v === panelDefault(id, isMac)) delete next[id];
    else next[id] = v;
    setPref('shortcuts', next);
  };
  const dictationClash = shortcutClash(dictation, panel);
  return (
    <>
      <p class="settings-scope dim small">Se guardan en este dispositivo, salvo el del dictado, que vale para todos.</p>
      {panel.map((p) => (
        <ShortcutRow
          key={p.id}
          id={p.id}
          label={p.label}
          value={p.shortcut}
          fallback={panelShortcut(p.id, undefined, isMac)}
          taken={others(p.id)}
          onChange={(v) => setPanel(p.id, v)}
        />
      ))}
      {s && (
        <ShortcutRow
          id="dictation"
          label={DICTATION}
          desc={`Vale para todos tus dispositivos.${s.dictation ? '' : ' El dictado está desactivado (Ajustes › Dictado).'}`}
          value={dictation}
          fallback={dictationShortcutOf(DEFAULT_DICTATION_SHORTCUT)}
          taken={others('dictation')}
          onChange={(v) => hub.send({ t: 'settings', settings: { dictationShortcut: v ?? DEFAULT_DICTATION_SHORTCUT } })}
          note={dictationClash && `En este dispositivo coincide con «${dictationClash}», que es el que actúa.`}
        />
      )}
      <section class="setting">
        <h3>Fijos</h3>
        <p class="dim small">Los mismos que en tmux; no se cambian.</p>
        <ul class="shortcut-fixed">
          {FIXED.map((f) => (
            <li key={f.label}>
              <kbd class="shortcut">{f.keys}</kbd> {f.label}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
