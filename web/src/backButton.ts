import { effect } from '@preact/signals';
import { isDesktop } from './prefs';
import { fileViewer, fileViewerBack } from './fileViewer';
import { dialog, drawerOpen, paletteOpen, settingsTab, sheet } from './state';

// The phone's back button closes what is open on top (a dialog, a menu, a sheet, a
// section of the settings, the search, the drawer) instead of leaving the page. Each
// of those layers has a history entry of ours, with the same URL and its depth in the
// state (1 for the bottom one), pushed when it opens: going back from it closes it.
//
// The entries are pushed only then, while the tap that opened the layer still counts
// as the user's: Chrome on Android skips, on back, entries added without one, so an
// entry put back after closing the top layer (from popstate) made the next press
// leave the app.
//
// Entries left behind when layers are closed by hand (a tap outside, a button) are
// "stale": history can't drop them, so the next layers to open reuse them, a
// navigation of the app replaces the current one, and going back from one goes back
// once more, so that press still does what it would have done.

/**
 * Open layers, each with its own entry: the settings on the phone count a section apart,
 * and the file viewer each of its screens (changed files › a diff › the file).
 */
function layers(): number {
  const settingsSection = sheet.value === 'settings' && !!settingsTab.value && !isDesktop.value;
  const files = fileViewer.value?.stack.length ?? 0;
  return Number(!!dialog.value) + Number(!!sheet.value) + Number(settingsSection) + Number(paletteOpen.value) + Number(drawerOpen.value) + files;
}

/** The depth of an entry of ours, 0 for a page (true: one from before depths were kept). */
function depthOf(state: unknown): number {
  const d = (state as { twbOverlay?: unknown } | null)?.twbOverlay;
  return typeof d === 'number' ? d : d ? 1 : 0;
}

/** Depth of the current entry: how many of ours there are down to the page. */
let depth = depthOf(history.state);
/** What to do once back on the page (replaceCurrent), run when that going back lands. */
let afterLeaving: (() => void) | null = null;

/** Closes the one on top; the settings on the phone go from a section back to their list first. */
function closeTop(): void {
  if (dialog.value) dialog.value = null;
  else if (paletteOpen.value) paletteOpen.value = false;
  else if (fileViewer.value) fileViewerBack();
  else if (sheet.value === 'settings' && settingsTab.value && !isDesktop.value) settingsTab.value = null;
  else if (sheet.value) sheet.value = null;
  else drawerOpen.value = false;
}

effect(() => {
  const open = layers();
  // The state of the page under them is kept (fromHome, fromApp), for the router's going back.
  while (depth < open) history.pushState({ ...history.state, twbOverlay: ++depth }, '');
});

window.addEventListener('popstate', () => {
  if (afterLeaving) {
    const then = afterLeaving;
    afterLeaving = null;
    then();
    return;
  }
  const from = depth;
  depth = depthOf(history.state);
  if (depth >= from) return; // forward, or onto a page
  if (depth < layers()) {
    // Off live entries: close their layers (more than one with history.go).
    while (depth < layers()) closeTop();
  } else {
    // Off a stale one: once more, onto the next live entry or off the page.
    history.back();
  }
});

/**
 * For the router, before it adds a page to the history: true when the current entry
 * is ours, so the page replaces it instead (closing a dialog and then opening a window
 * leaves no entry in between that going back would stop at).
 */
export function takeOverlayEntry(): boolean {
  if (!depth) return false;
  depth = 0;
  return true;
}

/**
 * For the router, to put a page in place of the current one: if the current entry is
 * ours, back to the page first, so the page it was opened over is the one replaced.
 */
export function replaceCurrent(replace: () => void): void {
  if (!depth) return replace();
  afterLeaving = replace;
  history.go(-depth);
  depth = 0;
}

/** The router going back a page: past the back button's entries too, if the current one is ours. */
export function goBack(): void {
  const n = depth + 1;
  depth = 0;
  history.go(-n);
}
