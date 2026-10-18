// Catppuccin Frappé, the flavour of the tmux theme on the Mac.
export const ANSI = {
  normal: ['#51576d', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#b5bfe2'],
  bright: ['#626880', '#e78284', '#a6d189', '#e5c890', '#8caaee', '#f4b8e4', '#81c8be', '#a5adce'],
};

export const XTERM_THEME = {
  background: '#303446',
  foreground: '#c6d0f5',
  cursor: '#f2d5cf',
  cursorAccent: '#303446',
  selectionBackground: '#62688099',
  black: ANSI.normal[0],
  red: ANSI.normal[1],
  green: ANSI.normal[2],
  yellow: ANSI.normal[3],
  blue: ANSI.normal[4],
  magenta: ANSI.normal[5],
  cyan: ANSI.normal[6],
  white: ANSI.normal[7],
  brightBlack: ANSI.bright[0],
  brightRed: ANSI.bright[1],
  brightGreen: ANSI.bright[2],
  brightYellow: ANSI.bright[3],
  brightBlue: ANSI.bright[4],
  brightMagenta: ANSI.bright[5],
  brightCyan: ANSI.bright[6],
  brightWhite: ANSI.bright[7],
};
