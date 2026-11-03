import { computed, effect, signal } from '@preact/signals';
import { prefs } from './prefs';

/** Light or dark, with "system" already resolved. */
export type Appearance = 'dark' | 'light';

interface TermTheme {
  ansi: { normal: string[]; bright: string[] };
  xterm: Record<string, string>;
  /**
   * xterm's minimumContrastRatio. Light: what is on the pane was mostly drawn for a dark
   * terminal (Claude Code's dark theme writes white text and dark blocks, tmux themes too),
   * so every colour is pushed until it reads on its background. Dark: colours as they are.
   */
  minContrast: number;
}

function termTheme(
  ansi: TermTheme['ansi'],
  base: { background: string; foreground: string; cursor: string; selectionBackground: string },
  minContrast: number,
): TermTheme {
  const [black, red, green, yellow, blue, magenta, cyan, white] = ansi.normal;
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = ansi.bright;
  return {
    ansi,
    minContrast,
    xterm: {
      ...base,
      cursorAccent: base.background,
      black, red, green, yellow, blue, magenta, cyan, white,
      brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
    },
  };
}

/** The terminal's colours: Catppuccin Frappé (the flavour of the tmux theme on the Mac) or Latte. */
export const TERM_THEMES: Record<Appearance, TermTheme> = {
  dark: termTheme(
    {
      normal: ['#51576d', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#b5bfe2'],
      bright: ['#626880', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#a5adce'],
    },
    { background: '#303446', foreground: '#c6d0f5', cursor: '#f2d5cf', selectionBackground: '#62688099' },
    1,
  ),
  light: termTheme(
    {
      normal: ['#5c5f77', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#acb0be'],
      bright: ['#6c6f85', '#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#ea76cb', '#179299', '#bcc0cc'],
    },
    { background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selectionBackground: '#acb0be99' },
    4.5,
  ),
};

/** The browser bar's colour (the app's --crust). */
const CHROME: Record<Appearance, string> = { dark: '#232634', light: '#dce0e8' };

const systemQuery = matchMedia('(prefers-color-scheme: light)');
const systemLight = signal(systemQuery.matches);
systemQuery.addEventListener('change', (e) => (systemLight.value = e.matches));

export const appearance = computed<Appearance>(() => {
  const t = prefs.value.theme;
  return t === 'light' || (t === 'system' && systemLight.value) ? 'light' : 'dark';
});

effect(() => {
  const a = appearance.value;
  document.documentElement.dataset.theme = a;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[a]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', a);
});
