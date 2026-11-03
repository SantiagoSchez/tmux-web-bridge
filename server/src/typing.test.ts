import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SENTINEL as S, typedDiff } from '../../shared/typing.js';

test('new characters are typed and removed ones erased', () => {
  assert.deepEqual(typedDiff(`${S}gi`, `${S}git`), { removed: 0, added: 't', sent: `${S}git` });
  assert.deepEqual(typedDiff(`${S}git`, `${S}gi`), { removed: 1, added: '', sent: `${S}gi` });
  assert.deepEqual(typedDiff(`${S}`, `${S}ls\n`), { removed: 0, added: 'ls\r', sent: `${S}ls\n` });
});

test('a corrected word is rewritten from the first change', () => {
  assert.deepEqual(typedDiff(`${S}ehco`, `${S}echo `), { removed: 3, added: 'cho ', sent: `${S}echo ` });
});

test('the keyboard capitalizing the typed word keeps the lowercase', () => {
  assert.deepEqual(typedDiff(`${S}claude`, `${S}Claude `), { removed: 0, added: ' ', sent: `${S}claude ` });
  // Corrected and capitalized at once: the correction goes through, the capital does not.
  assert.deepEqual(typedDiff(`${S}jose`, `${S}José `), { removed: 1, added: 'é ', sent: `${S}josé ` });
  // A word capitalized mid-field.
  assert.deepEqual(typedDiff(`${S}cd foo`, `${S}cd Foo,`), { removed: 0, added: ',', sent: `${S}cd foo,` });
});

test('the field keeps a capital the terminal never got', () => {
  // Next keystroke after the fix: the field still shows "Claude", the terminal "claude".
  assert.deepEqual(typedDiff(`${S}claude`, `${S}Claude,`), { removed: 0, added: ',', sent: `${S}claude,` });
  // Backspacing into it.
  assert.deepEqual(typedDiff(`${S}claude`, `${S}Claud`), { removed: 1, added: '', sent: `${S}claud` });
});

test('capitals the user types go through', () => {
  assert.deepEqual(typedDiff(`${S}`, `${S}C`), { removed: 0, added: 'C', sent: `${S}C` });
  assert.deepEqual(typedDiff(`${S}C`, `${S}Cl`), { removed: 0, added: 'l', sent: `${S}Cl` });
  // A different letter is a real change, not a capital.
  assert.deepEqual(typedDiff(`${S}ca`, `${S}Da`), { removed: 2, added: 'Da', sent: `${S}Da` });
});
