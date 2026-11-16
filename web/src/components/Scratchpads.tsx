import { computed } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { noteLength, SCRATCHPAD_COUNT, SCRATCHPAD_COUNTER_FROM, SCRATCHPAD_MAX_CHARS, SCRATCHPAD_MAX_NOTES } from '../../../shared/scratchpads';
import type { ScratchpadAddRequest, ScratchpadEditRequest, ScratchpadNote, ScratchpadNoteOrigin, ScratchpadPasteRequest } from '../../../shared/types';
import { api } from '../api';
import { isDesktop, prefs, setPref, toggleScratchpads } from '../prefs';
import { isMac, shortcutLabel } from '../shortcuts';
import { openWindow, route } from '../router';
import { findWindow, hosts, paneOf, scratchpadPasted, scratchpads, scratchpadsOpen, toast } from '../state';
import { Sheet } from './Sheet';
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
          <button class="icon-btn" aria-label="Ocultar los scratchpads" title={`Ocultar los scratchpads (${shortcutLabel('foldPads')})`} onClick={toggleScratchpads}>
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

/**
 * Adds a note at the end of scratchpad `pad`, remembering the window shown now (by its ids:
 * the hub stores its names with the note). Null when the hub took it, else why not.
 */
async function addNote(pad: number, text: string): Promise<string | null> {
  const r = route.value;
  const origin = r.name === 'window' ? { host: r.host, window: r.window } : undefined;
  try {
    await api('/api/scratchpads/notes', { pad, text, origin } satisfies ScratchpadAddRequest);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
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
    const error = await addNote(pad, sent);
    if (error) {
      toast(error, 'error');
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
      <button class="icon-btn" aria-label="Mostrar los scratchpads" aria-expanded={false} title={`Mostrar los scratchpads (${shortcutLabel('foldPads')})`} onClick={toggleScratchpads}>
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

/** How Alt is written in the colours' hints: ⌥ on a Mac. */
const altKey = isMac ? '⌥' : 'Alt+';

/**
 * The quick note: a note written and placed without the mouse. The text has the focus and
 * the scratchpad shown is chosen; Alt+1…5 chooses another in screen order, and Tab reaches
 * the colours, which the arrows move between. Enter adds the note and closes, Shift+Enter
 * is a new line, Escape closes; the focus then goes back where it was (the terminal).
 * A full scratchpad or a refusal keeps it open with the text and the reason.
 */
export function QuickNoteDialog({ close }: { close: () => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const before = useRef<Element | null>(null);
  const [pad, setPad] = useState(selected);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const at = PADS.findIndex((p) => p.at === pad);
  const count = scratchpads.value[pad]?.length ?? 0;

  useEffect(() => {
    before.current = document.activeElement;
    field.current?.focus();
  }, []);
  const closed = useRef(false);
  // Once: a note the hub answers after Escape closed the dialog must not close it again.
  const done = () => {
    if (closed.current) return;
    closed.current = true;
    close();
    // After the dialog goes, so the focus lands on what was under it.
    // Opened from the search, what had the focus went with it: the terminal takes it.
    const back = before.current;
    const target = back instanceof HTMLElement && back.isConnected && back !== document.body ? back : document.querySelector<HTMLElement>('.xterm-helper-textarea');
    requestAnimationFrame(() => target?.focus());
  };
  const choose = (i: number, focus = false) => {
    setPad(PADS[i].at);
    setProblem(null);
    if (focus) radios.current[i]?.focus();
  };
  const save = async () => {
    if (busy || !text.trim()) return;
    if (count >= SCRATCHPAD_MAX_NOTES) return setProblem(`El scratchpad ${PADS[at].name.toLowerCase()} está lleno: elige otro color o borra una nota.`);
    setBusy(true);
    const error = await addNote(pad, text);
    setBusy(false);
    if (error) return setProblem(error);
    setPref('scratchpad', pad);
    done();
  };
  const onKey = (e: KeyboardEvent) => {
    const digit = /^Digit([1-5])$/.exec(e.code);
    if (digit && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      // By key position: ⌥1 on a Mac would type «¡».
      e.preventDefault();
      choose(Number(digit[1]) - 1);
    } else if (isSave(e)) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <Sheet title="Nota rápida" subtitle="Enter guarda, Mayús+Enter salto de línea, Esc cierra" class="quick-note" onClose={done}>
      <div class="quick-note-body" style={{ '--pad': PADS[at].color }} onKeyDown={onKey}>
        <textarea
          ref={field}
          class="pads-input"
          aria-label="Texto de la nota"
          rows={3}
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setProblem(null);
          }}
        />
        <CharCount text={text} />
        <div class="quick-note-colors" role="radiogroup" aria-label="Scratchpad">
          {PADS.map((p, i) => (
            <button
              key={p.at}
              ref={(el) => {
                radios.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={p.at === pad}
              aria-label={`${p.name} (${altKey}${i + 1})`}
              title={`${p.name} · ${notesLabel(scratchpads.value[p.at]?.length ?? 0)} (${altKey}${i + 1})`}
              tabIndex={p.at === pad ? 0 : -1}
              class={`pads-tab ${p.at === pad ? 'on' : ''}`}
              style={{ '--pad': p.color }}
              onClick={() => choose(i)}
              onKeyDown={(e) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (step) {
                  e.preventDefault();
                  choose((i + step + PADS.length) % PADS.length, true);
                }
              }}
            >
              <span class="pads-dot" aria-hidden="true" />
              <span class="pads-count" aria-hidden="true">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
        {problem && <p class="settings-state small">{problem}</p>}
      </div>
    </Sheet>
  );
}
