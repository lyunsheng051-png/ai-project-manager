import type { ITheme } from '@xterm/xterm';

export function readTerminalTheme(): ITheme {
  const palette = getComputedStyle(document.documentElement);
  const color = (name: string) => palette.getPropertyValue(`--${name}`).trim();
  return {
    background: '#00000000', foreground: color('ink'), cursor: color('accent'), cursorAccent: color('terminal'),
    selectionBackground: color('editor-selection'), selectionForeground: color('selection-ink'),
    black: color('ansi-black'), red: color('ansi-red'), green: color('ansi-green'), yellow: color('ansi-yellow'),
    blue: color('ansi-blue'), magenta: color('ansi-magenta'), cyan: color('ansi-cyan'), white: color('ansi-white'),
    brightBlack: color('ansi-bright-black'), brightRed: color('ansi-bright-red'), brightGreen: color('ansi-bright-green'),
    brightYellow: color('ansi-bright-yellow'), brightBlue: color('ansi-bright-blue'), brightMagenta: color('ansi-bright-magenta'),
    brightCyan: color('ansi-bright-cyan'), brightWhite: color('ansi-bright-white'),
  };
}
