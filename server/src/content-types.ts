import { fileType } from '../../shared/file-types.js';

// The Content-Type a file of a machine is served with, by its extension: for the viewer
// (/api/files), which only lets the browser show media, and for a rendered HTML page and
// the files of its folder (/api/page), which a page loads as what they are.

const TEXT = '; charset=utf-8';

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
  html: `text/html${TEXT}`, htm: `text/html${TEXT}`, css: `text/css${TEXT}`, js: `text/javascript${TEXT}`, mjs: `text/javascript${TEXT}`,
  json: `application/json${TEXT}`, map: `application/json${TEXT}`, txt: `text/plain${TEXT}`, csv: `text/csv${TEXT}`, md: `text/markdown${TEXT}`,
  xml: `application/xml${TEXT}`, wasm: 'application/wasm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

/** The extension of the last part of `name`, in lower case; '' without one (a leading dot alone is a hidden name). */
function extension(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1);
}

/** For a rendered page and its folder's files: its own type, or plain bytes when unknown. */
export function pageContentType(name: string): string {
  return TYPES[extension(name)] ?? 'application/octet-stream';
}

/** For the viewer: images, PDFs, video and sound with their type; anything else as text, never run. */
export function filesContentType(name: string): string {
  const kind = fileType(name);
  const media = kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio';
  return (media && TYPES[extension(name)]) || `text/plain${TEXT}`;
}

/**
 * Whether the viewer sends a file sandboxed: everything but a PDF (Chrome's viewer does not
 * run in a sandbox), a video and a sound (a sandboxed player asks for the file again from an
 * opaque origin, without the session). Those keep their type and `nosniff`, so nothing in
 * them runs; an image stays sandboxed, since an SVG can hold scripts.
 */
export function filesSandboxed(name: string): boolean {
  return !/^(application\/pdf|video\/|audio\/)/.test(filesContentType(name));
}
