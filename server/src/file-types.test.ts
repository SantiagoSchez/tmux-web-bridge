import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileType, isHtml } from '../../shared/file-types.js';

test('each kind of file is told by its extension', () => {
  assert.equal(fileType('captura.png'), 'image');
  assert.equal(fileType('logo.svg'), 'image');
  assert.equal(fileType('actual.mp4'), 'video');
  assert.equal(fileType('nota.m4a'), 'audio');
  assert.equal(fileType('factura.pdf'), 'pdf');
  assert.equal(fileType('INDICE.md'), 'markdown');
  assert.equal(fileType('app.ts'), 'code');
  assert.equal(fileType('config.yaml'), 'code');
  assert.equal(fileType('backup.tar.gz'), 'archive');
  assert.equal(fileType('fotos.zip'), 'archive');
  assert.equal(fileType('notas.txt'), 'file');
  assert.equal(fileType('server.log'), 'file');
});

test('the letter case of the extension does not matter', () => {
  assert.equal(fileType('captura.PNG'), 'image');
  assert.equal(fileType('Clip.MOV'), 'video');
  assert.equal(fileType('App.TSX'), 'code');
});

test('a name with no extension is a generic file, except the build files named by convention', () => {
  assert.equal(fileType('LICENSE'), 'file');
  assert.equal(fileType('.env'), 'file');
  assert.equal(fileType('Dockerfile'), 'code');
  assert.equal(fileType('Makefile'), 'code');
});

test('only the last part of a path counts', () => {
  assert.equal(fileType('docs/captura.png'), 'image');
  assert.equal(fileType('src.d/LICENSE'), 'file');
  assert.equal(fileType('build.tmp/Makefile'), 'code');
});

test('an HTML page is told by its .html or .htm extension, in any case, and keeps the code icon', () => {
  assert.equal(isHtml('informe.html'), true);
  assert.equal(isHtml('PORTADA.HTM'), true);
  assert.equal(isHtml('docs/a.htm'), true);
  assert.equal(isHtml('a.html.txt'), false);
  assert.equal(isHtml('html'), false);
  assert.equal(isHtml('.html'), false);
  assert.equal(isHtml('notas.md'), false);
  assert.equal(isHtml('web.html/notas.md'), false);
  assert.equal(fileType('informe.html'), 'code');
});
