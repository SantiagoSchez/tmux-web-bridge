import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { noteLength, noteOrigin, noteText, sanitizeScratchpads } from '../../shared/scratchpads.js';
import type { SessionInfo, Scratchpads, WindowInfo } from '../../shared/types.js';
import { originOf, ScratchpadError, ScratchpadStore } from './scratchpads.js';

test('a note keeps its text without the trailing whitespace', () => {
  assert.deepEqual(noteText('  Revisar el test\nde login \n\n'), { ok: true, text: '  Revisar el test\nde login' });
});

test('an empty note, or one of only whitespace, is refused', () => {
  for (const raw of ['', '   ', '\n\t\n']) {
    const r = noteText(raw);
    assert.equal(r.ok, false, JSON.stringify(raw));
    assert.match(r.ok ? '' : r.error, /vacía/);
  }
});

test('a note holds up to 4000 characters', () => {
  assert.deepEqual(noteText('a'.repeat(4000)), { ok: true, text: 'a'.repeat(4000) });
  const r = noteText('a'.repeat(4001));
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /4000 caracteres/);
});

test("the panel's counter measures a note as the hub stores it, without trailing whitespace", () => {
  assert.equal(noteLength('a'.repeat(3999) + '\n\n'), 3999);
  assert.equal(noteLength('a'.repeat(4000) + '  \n'), 4000);
  assert.equal(noteText('a'.repeat(4000) + '  \n').ok, true);
  assert.equal(noteLength('a'.repeat(4001) + ' '), 4001);
  assert.equal(noteText('a'.repeat(4001) + ' ').ok, false);
});

test('a note text that is not a string is refused', () => {
  for (const raw of [undefined, null, 42, ['texto'], { text: 'x' }]) assert.equal(noteText(raw).ok, false, JSON.stringify(raw));
});

const note = (i: number) => ({ id: `n${i}`, text: `nota ${i}`, pinned: false });

test('a saved file is read as exactly five scratchpads of valid notes, at most 20 each', () => {
  const raw = [
    [{ id: 'a', text: 'fijada', pinned: 1, extra: 'x' }, { id: 'b' }, { text: 'sin id' }, 'basura', { id: 'c', text: '   ' }],
    Array.from({ length: 22 }, (_, i) => note(i)),
    'no es una lista',
    [note(97)],
    [note(98)],
    [note(99)],
  ];
  assert.deepEqual(sanitizeScratchpads(raw), [
    [{ id: 'a', text: 'fijada', pinned: true }],
    Array.from({ length: 20 }, (_, i) => note(i)),
    [],
    [note(97)],
    [note(98)],
  ]);
});

test('a file saved with three scratchpads keeps each note in its place and adds two empty ones', () => {
  const raw = [[note(1)], [note(2)], [note(3)]];
  assert.deepEqual(sanitizeScratchpads(raw), [[note(1)], [note(2)], [note(3)], [], []]);
});

test('anything that is not a list of scratchpads reads as five empty ones', () => {
  for (const raw of [undefined, null, {}, 'x', 7]) assert.deepEqual(sanitizeScratchpads(raw), [[], [], [], [], []]);
});

test('a note id repeated in the file is kept only the first time', () => {
  const dup = { id: 'a', text: 'uno', pinned: false };
  assert.deepEqual(sanitizeScratchpads([[dup], [{ ...dup, text: 'dos' }]]), [[dup], [], [], [], []]);
});

const origin = { host: 'local', window: '@3', hostName: 'Local', session: 'demo', index: 1, name: 'claude' };

test('a well-formed window origin is kept as it is', () => {
  assert.deepEqual(noteOrigin({ ...origin, extra: 'x' }), origin);
  assert.deepEqual(noteOrigin({ ...origin, index: 0 }), { ...origin, index: 0 });
});

test('an origin with a missing field, a name that is not a string or too long, or a bad index is dropped', () => {
  const bad = [
    undefined,
    null,
    'local:@3',
    { ...origin, host: undefined },
    { ...origin, window: 3 },
    { ...origin, session: null },
    { ...origin, hostName: 'a'.repeat(201) },
    { ...origin, name: ['claude'] },
    { ...origin, index: -1 },
    { ...origin, index: 1.5 },
    { ...origin, index: '1' },
  ];
  for (const raw of bad) assert.equal(noteOrigin(raw), undefined, JSON.stringify(raw));
  assert.deepEqual(noteOrigin({ ...origin, name: 'a'.repeat(200) }), { ...origin, name: 'a'.repeat(200) });
});

test('a saved note keeps its window origin, and a malformed origin is dropped without dropping the note', () => {
  const raw = [[{ ...note(1), origin }, { ...note(2), origin: { ...origin, index: -1 } }, note(3)]];
  assert.deepEqual(sanitizeScratchpads(raw), [[{ ...note(1), origin }, note(2), note(3)], [], [], [], []]);
  assert.equal('origin' in sanitizeScratchpads(raw)[0][1], false);
});

// ---------------------------------------------------------------- the store

function withStore(run: (store: ScratchpadStore, dir: string) => void | Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-scratchpads-'));
    try {
      await run(new ScratchpadStore(dir), dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** The status and message a store call fails with. */
function failure(fn: () => unknown): { status: number; message: string } {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ScratchpadError, String(err));
    return { status: err.status, message: err.message };
  }
  assert.fail('expected the call to fail');
}

test(
  'a new note goes last in its scratchpad, unpinned, and is announced',
  withStore((store) => {
    const changes: Scratchpads[] = [];
    store.on('change', (pads: Scratchpads) => changes.push(pads));
    const first = store.add(1, 'Revisar el test de login');
    const second = store.add(1, 'Preguntar por la migración  ');
    assert.notEqual(first, second);
    assert.deepEqual(store.pads[1], [
      { id: first, text: 'Revisar el test de login', pinned: false },
      { id: second, text: 'Preguntar por la migración', pinned: false },
    ]);
    assert.deepEqual(store.pads[0], []);
    assert.equal(changes.length, 2);
    assert.deepEqual(changes[1], store.pads);
  }),
);

test(
  'a twenty-first note is refused as the scratchpad is full',
  withStore((store) => {
    for (let i = 0; i < 20; i++) store.add(2, `nota ${i}`);
    const f = failure(() => store.add(2, 'una más'));
    assert.equal(f.status, 409);
    assert.match(f.message, /lleno: admite 20 notas/);
    assert.equal(store.pads[2].length, 20);
  }),
);

test(
  'a note for a scratchpad that does not exist, or with bad text, is refused',
  withStore((store) => {
    for (const pad of [-1, 5, 1.5, Number.NaN]) assert.equal(failure(() => store.add(pad, 'x')).status, 400, String(pad));
    assert.deepEqual(failure(() => store.add(0, '   ')), { status: 400, message: 'La nota está vacía' });
    assert.equal(failure(() => store.add(0, 'a'.repeat(4001))).status, 400);
  }),
);

test(
  'the fourth and fifth scratchpads take notes like the others',
  withStore((store) => {
    const yellow = store.add(3, 'amarilla');
    const purple = store.add(4, 'morada');
    assert.deepEqual(store.pads[3], [{ id: yellow, text: 'amarilla', pinned: false }]);
    assert.deepEqual(store.pads[4], [{ id: purple, text: 'morada', pinned: false }]);
  }),
);

test(
  'editing changes the text or the pin, and emptying the text removes the note',
  withStore((store) => {
    const id = store.add(0, 'Preguntar por la migración');
    store.edit(id, { text: 'Preguntar por la migración de usuarios' });
    store.edit(id, { pinned: true });
    assert.deepEqual(store.pads[0], [{ id, text: 'Preguntar por la migración de usuarios', pinned: true }]);
    store.edit(id, { text: '  ' });
    assert.deepEqual(store.pads[0], []);
  }),
);

test(
  'an edit with a text too long, or that is not a string, is refused and keeps the note',
  withStore((store) => {
    const id = store.add(0, 'nota');
    assert.equal(failure(() => store.edit(id, { text: 'a'.repeat(4001) })).status, 400);
    assert.equal(failure(() => store.edit(id, { text: 42 })).status, 400);
    assert.deepEqual(store.pads[0], [{ id, text: 'nota', pinned: false }]);
  }),
);

test(
  'editing or deleting a note that is gone fails with 404',
  withStore((store) => {
    const id = store.add(0, 'nota');
    store.remove(id);
    assert.deepEqual(store.pads, [[], [], [], [], []]);
    assert.equal(failure(() => store.remove(id)).status, 404);
    assert.equal(failure(() => store.edit(id, { pinned: true })).status, 404);
  }),
);

test(
  'the notes are saved and read back by a new store',
  withStore((store, dir) => {
    const id = store.add(2, 'fijada');
    store.edit(id, { pinned: true });
    store.add(0, 'otra');
    assert.deepEqual(new ScratchpadStore(dir).pads, store.pads);
  }),
);

test(
  'a broken file starts with empty scratchpads',
  withStore((_store, dir) => {
    writeFileSync(join(dir, 'scratchpads.json'), '{ roto');
    assert.deepEqual(new ScratchpadStore(dir).pads, [[], [], [], [], []]);
  }),
);

// ---------------------------------------------------------------- pasting

/** A failed async store call: its status and message. */
async function rejection(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ScratchpadError, String(err));
    return { status: err.status, message: err.message };
  }
  assert.fail('expected the call to fail');
}

/** A `send` that waits until `release()` is called, recording what it was given. */
function heldSend() {
  const sent: string[] = [];
  let release!: (err?: Error) => void;
  const done = new Promise<void>((resolve, reject) => (release = (err) => (err ? reject(err) : resolve())));
  return { sent, release, send: (text: string) => (sent.push(text), done) };
}

test(
  'a pasted note is sent once and removed unless it is pinned',
  withStore(async (store) => {
    const loose = store.add(0, 'suelta');
    const pinned = store.add(0, 'fijada');
    store.edit(pinned, { pinned: true });
    const sent: string[] = [];
    const send = async (text: string) => void sent.push(text);
    await store.paste(loose, send);
    await store.paste(pinned, send);
    assert.deepEqual(sent, ['suelta', 'fijada']);
    assert.deepEqual(store.pads[0], [{ id: pinned, text: 'fijada', pinned: true }]);
  }),
);

test(
  'a note being pasted cannot be pasted again until the first paste ends, pinned or not',
  withStore(async (store) => {
    const loose = store.add(0, 'suelta');
    const pinned = store.add(0, 'fijada');
    store.edit(pinned, { pinned: true });
    for (const id of [loose, pinned]) {
      const held = heldSend();
      const first = store.paste(id, held.send);
      const second = await rejection(store.paste(id, held.send));
      assert.equal(second.status, 409);
      assert.match(second.message, /se está pegando/);
      held.release();
      await first;
      assert.equal(held.sent.length, 1);
    }
    assert.deepEqual(store.pads[0].map((n) => n.id), [pinned]);
    await store.paste(pinned, async () => {});
  }),
);

test(
  'a failed paste keeps the note, passes the error up and lets it be pasted again',
  withStore(async (store) => {
    const id = store.add(1, 'nota');
    const machine = new ScratchpadError('No se pudo pegar en Mac: sin conexión', 502);
    const f = await rejection(
      store.paste(id, async () => {
        throw machine;
      }),
    );
    assert.deepEqual(f, { status: 502, message: 'No se pudo pegar en Mac: sin conexión' });
    assert.equal(store.pads[1].length, 1);
    await store.paste(id, async () => {});
    assert.deepEqual(store.pads[1], []);
  }),
);

test(
  'pasting a note that is gone fails with 404 and sends nothing',
  withStore(async (store) => {
    const id = store.add(1, 'nota');
    store.remove(id);
    let sent = false;
    assert.equal((await rejection(store.paste(id, async () => void (sent = true)))).status, 404);
    assert.equal(sent, false);
  }),
);

test(
  'a note deleted while it was being pasted does not come back',
  withStore(async (store) => {
    const id = store.add(1, 'nota');
    const held = heldSend();
    const pasting = store.paste(id, held.send);
    store.remove(id);
    held.release();
    await pasting;
    assert.deepEqual(store.pads[1], []);
  }),
);

// ---------------------------------------------------------------- the window a note was added in

/** A machine with one session «demo» holding window @3 «claude» at index 1, as originOf sees it. */
const machine = {
  id: 'local',
  name: 'Local',
  findWindow: (windowId: string) =>
    windowId === '@3' ? { session: { name: 'demo' } as SessionInfo, window: { id: '@3', index: 1, name: 'claude' } as WindowInfo } : null,
};

test('the origin of an open window carries its ids and the names the hub sees', () => {
  assert.deepEqual(originOf(machine, '@3'), origin);
});

test('a window the machine does not have gives no origin', () => {
  assert.equal(originOf(machine, '@9'), undefined);
});

test(
  'a note added with an origin keeps it through a reload, an edit, a pin and a paste of a pinned note',
  withStore(async (store, dir) => {
    const id = store.add(0, 'Revisar el test de login', origin);
    assert.deepEqual(store.pads[0], [{ id, text: 'Revisar el test de login', pinned: false, origin }]);
    assert.deepEqual(new ScratchpadStore(dir).pads[0][0].origin, origin);
    store.edit(id, { text: 'Revisar el test de logout', pinned: true });
    await store.paste(id, async () => {});
    assert.deepEqual(store.pads[0], [{ id, text: 'Revisar el test de logout', pinned: true, origin }]);
  }),
);

test(
  'a note added without an origin has none',
  withStore((store) => {
    const id = store.add(0, 'Sin ventana');
    assert.deepEqual(store.pads[0], [{ id, text: 'Sin ventana', pinned: false }]);
    assert.equal('origin' in store.pads[0][0], false);
  }),
);
