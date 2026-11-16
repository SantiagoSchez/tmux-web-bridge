import { computed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SCRATCHPAD_MAX_CHARS, SCRATCHPAD_MAX_NOTES } from '../../../shared/scratchpads';
import type { ScratchpadAddRequest, ScratchpadEditRequest, ScratchpadNote, ScratchpadPasteRequest } from '../../../shared/types';
import { api } from '../api';
import { isDesktop, prefs, SCRATCHPADS_KEY, setPref, toggleScratchpads } from '../prefs';
import { route } from '../router';
import { findWindow, paneOf, scratchpads, scratchpadsOpen, toast } from '../state';
import { IconPaste, IconPin, IconSidebarRight, IconTrash } from './icons';

/** The three scratchpads, by position: their colour and the name a screen reader says. */
const PADS = [
  { name: 'Azul', color: 'var(--blue)' },
  { name: 'Verde', color: 'var(--green)' },
  { name: 'Naranja', color: 'var(--peach)' },
] as const;

/** Where «Pegar» types a note: the pane the open window works on, or null outside a window. */
const target = computed<ScratchpadPasteRequest | null>(() => {
  const r = route.value;
  if (r.name !== 'window') return null;
  const found = findWindow(r.host, r.window);
  const pane = found && paneOf(found.window, r.pane);
  return pane ? { host: r.host, pane: pane.id } : null;
});

function selected(): number {
  const n = prefs.value.scratchpad;
  return n >= 0 && n < PADS.length ? n : 0;
}

/** Shows scratchpad `n`, unfolding the sidebar if it was folded. */
function show(n: number): void {
  setPref('scratchpad', n);
  if (prefs.value.scratchpadsCollapsed) toggleScratchpads();
}

/** Runs a change on the hub; a refusal becomes a toast. The hub's broadcast updates every device. */
async function call(path: string, body: unknown): Promise<boolean> {
  try {
    await api(path, body);
    return true;
  } catch (err) {
    toast((err as Error).message, 'error');
    return false;
  }
}

const notePath = (id: string) => `/api/scratchpads/notes/${encodeURIComponent(id)}`;

/** Enter saves, Shift+Enter is a new line. */
function isSave(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** The colour tabs, the selected scratchpad's notes and the field that adds one. */
export function Scratchpads() {
  const n = selected();
  const notes = scratchpads.value[n];
  return (
    <section class="pads" aria-label="Scratchpads" style={{ '--pad': PADS[n].color }}>
      <div class="pads-head">
        <div class="pads-tabs" role="tablist" aria-label="Scratchpad">
          {PADS.map((p, i) => (
            <button
              key={p.name}
              role="tab"
              aria-selected={i === n}
              class={`pads-tab ${i === n ? 'on' : ''}`}
              style={{ '--pad': p.color }}
              aria-label={`${p.name}: ${scratchpads.value[i].length} notas`}
              title={`${p.name} (${scratchpads.value[i].length}/${SCRATCHPAD_MAX_NOTES})`}
              onClick={() => setPref('scratchpad', i)}
            >
              <span class="pads-dot" aria-hidden="true" />
              {scratchpads.value[i].length > 0 && (
                <span class="pads-count" aria-hidden="true">
                  {scratchpads.value[i].length}
                </span>
              )}
            </button>
          ))}
        </div>
        {isDesktop.value && (
          <button class="icon-btn" aria-label="Ocultar los scratchpads" title={`Ocultar los scratchpads (${SCRATCHPADS_KEY})`} onClick={toggleScratchpads}>
            <IconSidebarRight />
          </button>
        )}
      </div>
      <ul class="pads-notes scroll" role="tabpanel" aria-label={`Scratchpad ${PADS[n].name.toLowerCase()}`}>
        {notes.map((note) => (
          <NoteRow key={note.id} note={note} />
        ))}
        {notes.length === 0 && <li class="pads-empty dim small">Sin notas. Apunta abajo lo que quieras decirle después a Claude.</li>}
      </ul>
      <AddField pad={n} count={notes.length} />
    </section>
  );
}

/** A note: its text (a click edits it) and the buttons to paste, pin and delete it. */
function NoteRow({ note }: { note: ScratchpadNote }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const to = target.value;

  const paste = async () => {
    if (!to || busy) return;
    setBusy(true);
    const ok = await call(`${notePath(note.id)}/paste`, to);
    setBusy(false);
    // On a phone, back to the terminal to see it.
    if (ok && !isDesktop.value) scratchpadsOpen.value = false;
  };

  return (
    <li class={`pads-note ${note.pinned ? 'pinned' : ''}`}>
      {editing ? (
        <NoteEditor note={note} onDone={() => setEditing(false)} />
      ) : (
        <button class="pads-text" title="Editar" onClick={() => setEditing(true)}>
          {note.text}
        </button>
      )}
      <div class="pads-actions">
        <button
          class="icon-btn"
          aria-label="Pegar en el panel"
          title={to ? 'Pegar en el panel, sin Enter' : 'Abre una ventana para pegar'}
          disabled={!to || busy}
          onClick={() => void paste()}
        >
          <IconPaste />
        </button>
        <button
          class={`icon-btn ${note.pinned ? 'on' : ''}`}
          aria-label="Fijar"
          aria-pressed={note.pinned}
          title={note.pinned ? 'Fijada: se queda al pegarla' : 'Fijar: que se quede al pegarla'}
          onClick={() => void call(notePath(note.id), { pinned: !note.pinned } satisfies ScratchpadEditRequest)}
        >
          <IconPin />
        </button>
        <button class="icon-btn" aria-label="Borrar" title="Borrar" onClick={() => void call(`${notePath(note.id)}/delete`, {})}>
          <IconTrash />
        </button>
      </div>
    </li>
  );
}

/** A note open for editing: Enter or leaving it saves (empty deletes it), Escape cancels. */
function NoteEditor({ note, onDone }: { note: ScratchpadNote; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = ref.current?.value ?? note.text;
    if (save && text !== note.text) void call(notePath(note.id), { text } satisfies ScratchpadEditRequest);
    onDone();
  };

  return (
    <textarea
      ref={ref}
      class="pads-input pads-edit"
      aria-label="Texto de la nota"
      rows={Math.min(8, note.text.split('\n').length + 1)}
      maxLength={SCRATCHPAD_MAX_CHARS}
      defaultValue={note.text}
      onKeyDown={(e) => {
        if (isSave(e)) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

/** The field at the foot of a scratchpad: Enter adds its text as a note. */
function AddField({ pad, count }: { pad: number; count: number }) {
  const [text, setText] = useState('');
  const full = count >= SCRATCHPAD_MAX_NOTES;
  const add = async () => {
    if (!text.trim()) return;
    if (await call('/api/scratchpads/notes', { pad, text } satisfies ScratchpadAddRequest)) setText('');
  };
  return (
    <div class="pads-add">
      <textarea
        class="pads-input"
        aria-label="Nueva nota"
        rows={2}
        maxLength={SCRATCHPAD_MAX_CHARS}
        disabled={full}
        placeholder={full ? 'Lleno: borra o pega una nota para añadir otra' : 'Nueva nota… (Enter guarda, Mayús+Enter salto de línea)'}
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (isSave(e)) {
            e.preventDefault();
            void add();
          }
        }}
      />
      <span class={`pads-total small ${full ? 'full' : 'dim'}`}>
        {count}/{SCRATCHPAD_MAX_NOTES}
      </span>
    </div>
  );
}

/** The scratchpads folded on a wide screen: a strip with the button that unfolds them and the three colours. */
export function ScratchpadsRail() {
  return (
    <nav class="rail-body pads-rail" aria-label="Scratchpads plegados">
      <button class="icon-btn" aria-label="Mostrar los scratchpads" aria-expanded={false} title={`Mostrar los scratchpads (${SCRATCHPADS_KEY})`} onClick={toggleScratchpads}>
        <IconSidebarRight />
      </button>
      {PADS.map((p, i) => (
        <button
          key={p.name}
          class="pads-tab"
          style={{ '--pad': p.color }}
          aria-label={`Scratchpad ${p.name.toLowerCase()}: ${scratchpads.value[i].length} notas`}
          title={`${p.name} (${scratchpads.value[i].length}/${SCRATCHPAD_MAX_NOTES})`}
          onClick={() => show(i)}
        >
          <span class="pads-dot" aria-hidden="true" />
          {scratchpads.value[i].length > 0 && (
            <span class="pads-count" aria-hidden="true">
              {scratchpads.value[i].length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
