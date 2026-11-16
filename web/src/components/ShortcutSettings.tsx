import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_DICTATION_SHORTCUT } from '../../../shared/dictation';
import { formatShortcut, PANEL_SHORTCUTS, panelDefault, parseShortcut, serializeShortcut, shortcutClash, shortcutProblem, type PanelShortcutId, type Shortcut } from '../../../shared/shortcuts';
import { shortcutFromEvent } from '../dictation';
import { prefs, setPref } from '../prefs';
import { isMac, recordingShortcut, shortcutOf } from '../shortcuts';
import { hubSettings } from '../state';
import { hub } from '../ws';

type Taken = { label: string; shortcut: Shortcut };

const DICTATION = 'Dictado';

/** The dictation shortcut the hub keeps, or its default. */
function dictationOf(raw: string | undefined): Shortcut {
  return parseShortcut(raw ?? '') ?? parseShortcut(DEFAULT_DICTATION_SHORTCUT)!;
}

/**
 * One shortcut: its combination, changed by pressing «Cambiar» and then the new one
 * (Escape cancels), and «Restablecer» while it is not the default. A combination that
 * would type, that the terminal or the number shortcuts use, or that `taken` holds is
 * refused with the reason. While it listens, no shortcut of the panel acts.
 */
function ShortcutRow(props: { id: string; label: string; desc?: string; value: Shortcut; byDefault: boolean; taken: Taken[]; onChange: (v: string | null) => void; note?: string | null }) {
  const { id, label, value, taken, onChange } = props;
  const listening = recordingShortcut.value === id;
  const [problem, setProblem] = useState<string | null>(null);
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
      const clash = shortcutClash(sc, taken);
      const why = parseShortcut(serializeShortcut(sc)) ? (clash ? `ya es «${clash}».` : null) : (shortcutProblem(sc) ?? 'Esa tecla no se puede usar.');
      setProblem(why ? `${formatShortcut(sc, isMac)}: ${why}` : null);
      if (why) return;
      onChange(serializeShortcut(sc));
      recordingShortcut.value = null;
    };
    globalThis.addEventListener('keydown', onKey, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKey, { capture: true });
      if (recordingShortcut.value === id) recordingShortcut.value = null;
    };
  }, [listening, taken]);
  return (
    <section class="setting shortcut-row">
      <h3>{label}</h3>
      {props.desc && <p class="dim small">{props.desc}</p>}
      <div class="row-btns">
        <kbd class="shortcut">{listening ? 'Pulsa la combinación…' : formatShortcut(value, isMac)}</kbd>
        {listening ? (
          <button class="btn" onClick={() => (recordingShortcut.value = null)}>
            Cancelar
          </button>
        ) : (
          <button
            class="btn"
            onClick={() => {
              setProblem(null);
              recordingShortcut.value = id;
            }}
          >
            Cambiar
          </button>
        )}
        {!listening && !props.byDefault && (
          <button
            class="btn"
            onClick={() => {
              setProblem(null);
              onChange(null);
            }}
          >
            Restablecer
          </button>
        )}
      </div>
      {listening && problem && <p class="settings-state small">{problem}</p>}
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
  const panel = PANEL_SHORTCUTS.map((def) => ({ ...def, shortcut: shortcutOf(def.id) }));
  const dictation = dictationOf(s?.dictationShortcut);
  const all: (Taken & { id: string })[] = [...panel.map((p) => ({ id: p.id, label: p.label, shortcut: p.shortcut })), { id: 'dictation', label: DICTATION, shortcut: dictation }];
  const others = (id: string) => all.filter((t) => t.id !== id);
  const setPanel = (id: PanelShortcutId, v: string | null) => {
    const next = { ...saved };
    if (v === null || v === panelDefault(id, isMac)) delete next[id];
    else next[id] = v;
    setPref('shortcuts', next);
  };
  const dictationClash = shortcutClash(
    dictation,
    panel.map((p) => ({ label: p.label, shortcut: p.shortcut })),
  );
  return (
    <>
      <p class="settings-scope dim small">Se guardan en este dispositivo, salvo el del dictado, que vale para todos.</p>
      {panel.map((p) => (
        <ShortcutRow
          key={p.id}
          id={p.id}
          label={p.label}
          value={p.shortcut}
          byDefault={saved[p.id] === undefined || serializeShortcut(p.shortcut) === panelDefault(p.id, isMac)}
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
          byDefault={serializeShortcut(dictation) === DEFAULT_DICTATION_SHORTCUT}
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
