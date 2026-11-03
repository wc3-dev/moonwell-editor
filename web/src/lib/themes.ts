/**
 * The theme on the page (Sven, 2026-11-02): the editor's own theme files (`themes/`), each colour a CSS variable named
 * for its key, as app.css starts them in Kanagawa Dragon, the default (Sven, 2026-10-29). A light theme makes the whole
 * page light. The terminal takes its colours from the theme too. The choice is `appearance.theme` in `settings.json`. The
 * user's own themes (`themes/user.svelte.ts`) are here too, to be chosen from with the shipped ones.
 */
import { codeThemeWith } from "./codeThemes.ts";
import { type ColorKey, colorKeys, type Theme } from "./themes/format.ts";
import { defaultTheme } from "./themes/shipped.ts";

export {
  allThemes,
  copyTheme,
  loadUserThemes,
  type ThemeFile,
  themeChanged,
  themeFiles,
  watchThemes,
} from "./themes/user.svelte.ts";
export type { Theme };
export { defaultTheme };

/** The theme with this id (or the id of a palette from before, which VS Code's own took over); undefined for none. */
export function findTheme(id: string | null | undefined, list: Theme[]): Theme | undefined {
  const wanted = id ?? "";
  const byId = (each: string | undefined) => list.find((theme) => theme.id === each);
  return byId(wanted) ?? byId(codeThemeWith(wanted)?.id);
}

/** The theme with this id (or the id of a palette from before), or the default one. */
export function themeOf(id: string | null | undefined, list: Theme[]): Theme {
  return (
    findTheme(id, list) ?? list.find((theme) => theme.id === defaultTheme) ?? (list[0] as Theme)
  );
}

/** The CSS variable a colour is on the page: `state.warningBackground` is `--state-warning-background`. */
export function cssName(key: ColorKey): string {
  return `--${key.replace(".", "-").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

const pageKeys = colorKeys.filter((key) => !key.startsWith("terminal."));

/** A theme's colours as the page's CSS variables, all but the terminal's. */
export function themeVars(chosen: Theme): Record<string, string> {
  return Object.fromEntries(pageKeys.map((key) => [cssName(key), chosen.colors[key]]));
}

/** Puts a theme's colours on the page, all but the terminal's. */
export function applyTheme(chosen: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, color] of Object.entries(themeVars(chosen)))
    root.style.setProperty(name, color);
  root.dataset.theme = chosen.id;
  root.dataset.scheme = chosen.type;
  root.style.colorScheme = chosen.type;
}

/** A terminal's colours, by the names xterm.js gives them. */
export type TerminalColors = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

/** A theme's colours for the terminal panel. */
export function terminalTheme({ colors }: Theme): TerminalColors {
  return {
    background: colors["terminal.background"],
    foreground: colors["terminal.foreground"],
    cursor: colors["terminal.cursor"],
    selectionBackground: colors["terminal.selection"],
    black: colors["terminal.black"],
    red: colors["terminal.red"],
    green: colors["terminal.green"],
    yellow: colors["terminal.yellow"],
    blue: colors["terminal.blue"],
    magenta: colors["terminal.magenta"],
    cyan: colors["terminal.cyan"],
    white: colors["terminal.white"],
    brightBlack: colors["terminal.brightBlack"],
    brightRed: colors["terminal.brightRed"],
    brightGreen: colors["terminal.brightGreen"],
    brightYellow: colors["terminal.brightYellow"],
    brightBlue: colors["terminal.brightBlue"],
    brightMagenta: colors["terminal.brightMagenta"],
    brightCyan: colors["terminal.brightCyan"],
    brightWhite: colors["terminal.brightWhite"],
  };
}
