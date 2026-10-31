import { effect } from '@preact/signals';
import type { PaneState } from '../../shared/types';
import { pending } from './state';

// While something waits for you, the tab says so: the most urgent emoji on the
// favicon (🙋 > 💬 > ✅, as in the pending list) and the count in the title.

const ICON = '/icons/icon.svg';
const TITLE = 'twb';
const EMOJI: Partial<Record<PaneState, string>> = { question: '🙋', attention: '💬', done: '✅' };
const SIZE = 64;

const base = new Image();
base.src = ICON;
const ready = base.decode().catch(() => {});

/** The app icon with the emoji over its bottom-right corner, as a PNG data URL. */
async function badged(emoji: string): Promise<string> {
  await ready;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  if (base.complete && base.naturalWidth) ctx.drawImage(base, 0, 0, SIZE, SIZE);
  ctx.font = `${SIZE * 0.6}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(emoji, SIZE, SIZE + SIZE * 0.06);
  return canvas.toDataURL('image/png');
}

function setIcon(href: string, type: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link || link.href.endsWith(href)) return;
  link.type = type;
  link.href = href;
}

let shown = '';
effect(() => {
  const list = pending.value;
  document.title = list.length ? `(${list.length}) ${TITLE}` : TITLE;
  // The list is most urgent first.
  const emoji = (list[0]?.pane.state && EMOJI[list[0].pane.state]) || '';
  if (emoji === shown) return;
  shown = emoji;
  if (!emoji) return setIcon(ICON, 'image/svg+xml');
  void badged(emoji).then((href) => shown === emoji && setIcon(href, 'image/png'));
});
