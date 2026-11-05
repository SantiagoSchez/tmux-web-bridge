import { effect } from '@preact/signals';
import { isDesktop } from './prefs';
import { dialog, drawerOpen, paletteOpen, settingsTab, sheet } from './state';

// The phone's back button closes what is open on top (a dialog, a menu, a sheet, the
// search, the drawer) instead of leaving the page. While something is open there is
// one history entry of ours, with the same URL: going back from it closes the top
// one, and if more is still open, the entry goes back in.
//
// An entry left behind when everything is closed by hand (a tap outside, a button)
// is "stale": history can't drop it, so the next open reuses it, a navigation of the
// app replaces it, and going back from it goes back once more, so that press still
// does what it would have done.

type Entry = 'none' | 'live' | 'stale';
let entry: Entry = history.state?.twbOverlay ? 'stale' : 'none';
/** What to do once off our entry (replaceCurrent), run when that going back lands. */
let afterLeaving: (() => void) | null = null;

const anyOpen = () => !!dialog.value || !!sheet.value || paletteOpen.value || drawerOpen.value;

/** Closes the one on top; the settings on the phone go from a section back to their list first. */
function closeTop(): void {
  if (dialog.value) dialog.value = null;
  else if (paletteOpen.value) paletteOpen.value = false;
  else if (sheet.value === 'settings' && settingsTab.value && !isDesktop.value) settingsTab.value = null;
  else if (sheet.value) sheet.value = null;
  else drawerOpen.value = false;
}

function pushEntry(): void {
  // The state of the page under it is kept (fromHome, fromApp), for the router's going back.
  history.pushState({ ...history.state, twbOverlay: true }, '');
  entry = 'live';
}

effect(() => {
  const open = anyOpen();
  if (open && entry !== 'live') {
    if (entry === 'stale') entry = 'live';
    else pushEntry();
  } else if (!open && entry === 'live') {
    entry = 'stale';
  }
});

window.addEventListener('popstate', () => {
  if (afterLeaving) {
    const then = afterLeaving;
    afterLeaving = null;
    then();
  } else if (entry === 'live') {
    entry = 'none';
    closeTop();
    // Closing the top one may show another under it: the effect above has then put the
    // entry back already (a dialog over the settings), or not (a settings section).
    if (anyOpen() && (entry as Entry) !== 'live') pushEntry();
  } else if (entry === 'stale') {
    entry = 'none';
    history.back();
  }
});

/**
 * For the router, before it adds a page to the history: true when the current entry
 * is ours, so the page replaces it instead (closing a dialog and then opening a window
 * leaves no entry in between that going back would stop at).
 */
export function takeOverlayEntry(): boolean {
  if (entry === 'none') return false;
  entry = 'none';
  return true;
}

/**
 * For the router, to put a page in place of the current one: if the current entry is
 * ours, off it first, so the page it was opened over is the one replaced.
 */
export function replaceCurrent(replace: () => void): void {
  if (entry === 'none') return replace();
  entry = 'none';
  afterLeaving = replace;
  history.back();
}

/** The router going back a page: past the back button's entry too, if the current one is ours. */
export function goBack(): void {
  if (entry === 'none') return history.back();
  entry = 'none';
  history.go(-2);
}
