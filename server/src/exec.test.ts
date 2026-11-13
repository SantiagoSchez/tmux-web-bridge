import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { shPath, shq, shQuote } from './exec.js';

/** What a real sh makes of a word, with HOME set to /home/u. */
const echo = (word: string) =>
  execFileSync('/bin/sh', ['-c', `printf '%s' ${word}`], { env: { PATH: process.env.PATH ?? '', HOME: '/home/u' } }).toString();

test('shQuote keeps any string as one literal word for the shell', () => {
  for (const s of ["it's", 'a b', '$HOME', '`id`', '"x"', '', '~/x', 'a\nb', '*']) assert.equal(echo(shQuote(s)), s);
});

test('shq leaves plain arguments bare and quotes the rest, a leading = included', () => {
  assert.equal(shq('-t'), '-t');
  assert.equal(shq('%12'), '%12');
  assert.equal(shq('=_tw-abc'), "'=_tw-abc'");
  assert.equal(echo(shq("o'clock now")), "o'clock now");
});

test('shPath expands ~ and ~/ to the home folder and quotes the rest', () => {
  assert.equal(echo(shPath('~')), '/home/u');
  assert.equal(echo(shPath("~/my 'repo'/$x")), "/home/u/my 'repo'/$x");
  assert.equal(echo(shPath('/srv/a b')), '/srv/a b');
  assert.equal(echo(shPath('~other/x')), '~other/x');
});
