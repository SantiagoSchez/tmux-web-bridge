import { computed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { noteLength, SCRATCHPAD_COUNT, SCRATCHPAD_COUNTER_FROM, SCRATCHPAD_MAX_CHARS, SCRATCHPAD_MAX_NOTES } from '../../../shared/scratchpads';
import type { ScratchpadAddRequest, ScratchpadEditRequest, ScratchpadNote, ScratchpadNoteOrigin, ScratchpadPasteRequest } from '../../../shared/types';
import { api } from '../api';
import { isDesktop, prefs, SCRATCHPADS_KEY, setPref, toggleScratchpads } from '../prefs';
import { openWindow, route } from '../router';
import { findWindow, hosts, paneOf, scratchpadPasted, scratchpads, scratchpadsOpen, toast } from '../state';
import { IconPaste, IconPin, IconSidebarRight, IconTrash } from './icons';

/**
 * The scratchpads in screen order: their storage position (`at`, the index in `Scratchpads`
 * and in `prefs.scratchpad`), colour and the name a screen reader says. Yellow and purple
 * came later and are stored after orange, so older notes keep their colour.
 */
const PADS = [
  { at: 0, name: 'Azul', color: 'var(--blue)' },
  { at: 1, name: 'Verde', color: 'var(--green)' },
  { at: 3, name: 'Amarillo', color: 'var(--yellow)' },
  { at: 2, name: 'Naranja', color: 'var(--peach)' },
  { at: 4, name: 'Morado', color: 'var(--mauve)' },
] as const;

/** Where «Pegar» types a note: the pane the open window works on, or null outside a window. */
const target = computed<ScratchpadPasteRequest | null>(() => {
  const r = route.value;
  if (r.name !== 'window') return null;
  const found = findWindow(r.host, r.window);
  const pane = found && paneOf(found.window, r.pane);
  return pane ? { host: r.host, pane: pane.id } : null;
});

/** The storage position of the scratchpad shown on this device. */
function selected(): number {
  const n = prefs.value.scratchpad;
  return Number.isInteger(n) && n >= 0 && n < SCRATCHPAD_COUNT ? n : 0;
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

/** «1 nota», «3 notas». */
const notesLabel = (n: number) => `${n} ${n === 1 ? 'nota' : 'notas'}`;

/**
 * A note's length against the limit, under its field once it gets close: nothing below
 * `SCRATCHPAD_COUNTER_FROM`. Trailing whitespace does not count, as the hub does not store it.
 */
function CharCount({ text }: { text: string }) {
  const length = noteLength(text);
  if (length < SCRATCHPAD_COUNTER_FROM) return null;
  return (
    <span class={`pads-total small ${length > SCRATCHPAD_MAX_CHARS ? 'over' : 'dim'}`}>
      {length}/{SCRATCHPAD_MAX_CHARS}
    </span>
  );
}

/** Enter saves, Shift+Enter is a new line. */
function isSave(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** The colour tabs, the selected scratchpad's notes and the field that adds one. */
export function Scratchpads() {
  const n = selected();
  const pad = PADS.find((p) => p.at === n) ?? PADS[0];
  const notes = scratchpads.value[n];
  return (
    <section class="pads" aria-label="Scratchpads" style={{ '--pad': pad.color }}>
      <div class="pads-head">
        <div class="pads-tabs" role="tablist" aria-label="Scratchpad">
          {PADS.map((p) => (
            <button
              key={p.name}
              role="tab"
              aria-selected={p.at === n}
              class={`pads-tab ${p.at === n ? 'on' : ''}`}
              style={{ '--pad': p.color }}
              aria-label={`${p.name}: ${notesLabel(scratchpads.value[p.at].length)}`}
              title={`${p.name} (${scratchpads.value[p.at].length}/${SCRATCHPAD_MAX_NOTES})`}
              onClick={() => setPref('scratchpad', p.at)}
            >
              <span class="pads-dot" aria-hidden="true" />
              {scratchpads.value[p.at].length > 0 && (
                <span class="pads-count" aria-hidden="true">
                  {scratchpads.value[p.at].length}
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
      <div class="pads-notes scroll" role="tabpanel" aria-label={`Scratchpad ${pad.name.toLowerCase()}`}>
        {notes.length > 0 ? (
          <ul class="pads-list">
            {notes.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
        ) : (
          <p class="pads-empty dim small">Sin notas. Apunta abajo lo que quieras decirle después a Claude.</p>
        )}
      </div>
      <AddField pad={n} count={notes.length} />
    </section>
  );
}

/**
 * The window a note was added in: while it is open in the same session (by id and creation
 * time, which survive a rename and change when tmux restarts and reuses the ids), a button
 * with its current names that opens it; once closed, or while its machine does not answer,
 * its names as they were, dimmed.
 */
function OriginLine({ origin }: { origin: ScratchpadNoteOrigin }) {
  const found = findWindow(origin.host, origin.window);
  if (!found || found.session.id !== origin.sessionId || found.session.created !== origin.sessionCreated) {
    const offline = hosts.value.find((h) => h.id === origin.host)?.status !== 'ok';
    return (
      <span class="pads-origin closed" title={offline ? 'Máquina sin conexión' : 'Ventana cerrada'}>
        {origin.hostName} · {origin.session} · {origin.index} {origin.name}
      </span>
    );
  }
  const { host, session, window } = found;
  const open = () => {
    openWindow(host.id, window.id);
    if (!isDesktop.value) scratchpadsOpen.value = false;
  };
  return (
    <button class="pads-origin" title="Abrir la ventana en la que se añadió" onClick={open}>
      {host.name} · {session.name} · {window.index} {window.name}
    </button>
  );
}

/** A note: its text (a click edits it), the window it was added in and the buttons to paste, pin and delete it. */
function NoteRow({ note }: { note: ScratchpadNote }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const to = target.value;

  const paste = async () => {
    if (!to || busy) return;
    setBusy(true);
    const ok = await call(`${notePath(note.id)}/paste`, to);
    setBusy(false);
    if (!ok) return;
    // Back to the terminal: on a phone to see it, on a computer to send it with Enter.
    scratchpadPasted.value = { pane: to.pane, at: Date.now() };
    if (!isDesktop.value) scratchpadsOpen.value = false;
  };

  return (
    <li class="pads-note">
      <div class="pads-body">
        {editing ? (
          <NoteEditor note={note} onDone={() => setEditing(false)} />
        ) : (
          <button class="pads-text" title="Editar" onClick={() => setEditing(true)}>
            {note.text}
          </button>
        )}
        {note.origin && <OriginLine origin={note.origin} />}
      </div>
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

/**
 * A note open for editing: Enter or leaving it saves (empty deletes it), Escape cancels.
 * A save the hub refuses leaves it open with the text, so nothing typed is lost.
 */
function NoteEditor({ note, onDone }: { note: ScratchpadNote; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const [draft, setDraft] = useState(note.text);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = async (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = ref.current?.value ?? note.text;
    if (save && text !== note.text && !(await call(notePath(note.id), { text } satisfies ScratchpadEditRequest))) {
      done.current = false;
      return;
    }
    onDone();
  };

  return (
    <div class="pads-edit">
      <textarea
        ref={ref}
        class="pads-input"
        aria-label="Texto de la nota"
        rows={Math.min(8, note.text.split('\n').length + 1)}
        defaultValue={note.text}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (isSave(e)) {
            e.preventDefault();
            void finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            void finish(false);
          }
        }}
        onBlur={() => void finish(true)}
      />
      <CharCount text={draft} />
    </div>
  );
}

/** The field at the foot of a scratchpad: Enter adds its text as a note. How many notes there are shows on the colour. */
function AddField({ pad, count }: { pad: number; count: number }) {
  const [text, setText] = useState('');
  const full = count >= SCRATCHPAD_MAX_NOTES;
  /**
   * Sends the text and empties the field at once, so a second Enter finds it empty and the
   * next note can be typed meanwhile; a refused note comes back, before what was typed since.
   */
  const add = async () => {
    const sent = text;
    if (!sent.trim()) return;
    setText('');
    // The window shown now, by its ids: the hub stores its names with the note.
    const r = route.value;
    const origin = r.name === 'window' ? { host: r.host, window: r.window } : undefined;
    if (!(await call('/api/scratchpads/notes', { pad, text: sent, origin } satisfies ScratchpadAddRequest))) {
      setText((now) => (now ? `${sent}\n${now}` : sent));
    }
  };
  return (
    <div class="pads-add">
      <textarea
        class="pads-input"
        aria-label="Nueva nota"
        rows={2}
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
      <CharCount text={text} />
    </div>
  );
}

/** The scratchpads folded on a wide screen: a strip with the button that unfolds them and the five colours. */
export function ScratchpadsRail() {
  return (
    <nav class="rail-body pads-rail" aria-label="Scratchpads plegados">
      <button class="icon-btn" aria-label="Mostrar los scratchpads" aria-expanded={false} title={`Mostrar los scratchpads (${SCRATCHPADS_KEY})`} onClick={toggleScratchpads}>
        <IconSidebarRight />
      </button>
      {PADS.map((p) => (
        <button
          key={p.name}
          class="pads-tab"
          style={{ '--pad': p.color }}
          aria-label={`Scratchpad ${p.name.toLowerCase()}: ${notesLabel(scratchpads.value[p.at].length)}`}
          title={`${p.name} (${scratchpads.value[p.at].length}/${SCRATCHPAD_MAX_NOTES})`}
          onClick={() => show(p.at)}
        >
          <span class="pads-dot" aria-hidden="true" />
          {scratchpads.value[p.at].length > 0 && (
            <span class="pads-count" aria-hidden="true">
              {scratchpads.value[p.at].length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
