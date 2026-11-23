import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filesContentType, pageContentType } from './content-types.js';

test('a page and its files are served with the type of their extension, text in UTF-8', () => {
  assert.equal(pageContentType('a.HTML'), 'text/html; charset=utf-8');
  assert.equal(pageContentType('estilo.css'), 'text/css; charset=utf-8');
  assert.equal(pageContentType('app.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(pageContentType('datos.json'), 'application/json; charset=utf-8');
  assert.equal(pageContentType('fuente.woff2'), 'font/woff2');
  assert.equal(pageContentType('img/logo.png'), 'image/png');
});

test('a page file of an unknown kind is plain bytes, never sniffed into something else', () => {
  assert.equal(pageContentType('a.bin'), 'application/octet-stream');
  assert.equal(pageContentType('LICENSE'), 'application/octet-stream');
  assert.equal(pageContentType('.env'), 'application/octet-stream');
});

test('the viewer gets images, PDFs, video and sound with their type, and everything else as text', () => {
  assert.equal(filesContentType('captura.png'), 'image/png');
  assert.equal(filesContentType('factura.PDF'), 'application/pdf');
  assert.equal(filesContentType('clip.mp4'), 'video/mp4');
  assert.equal(filesContentType('informe.html'), 'text/plain; charset=utf-8');
  assert.equal(filesContentType('app.js'), 'text/plain; charset=utf-8');
  assert.equal(filesContentType('fuente.woff2'), 'text/plain; charset=utf-8');
  assert.equal(filesContentType('a.svgz'), 'text/plain; charset=utf-8');
});
