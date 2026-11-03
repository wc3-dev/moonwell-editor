/**
 * The editor's colours from a VS Code theme (Sven, 2026-11-01). Which of a file's colours each one reads was measured
 * against the 13 palettes the editor had before, each against its own theme's file, so a theme looks as it did. VS Code
 * has no name for the seven kinds of object: they take the terminal's colours, else the syntax's. What a file leaves out
 * or sets too close to the panels is worked out, so every theme stays readable.
 *
 * The mapping used to run in the page; it is here to make the shipped themes once (Sven, 2026-11-02). Gutter, field,
 * selection, button and the faint border are left to `fillColors`, which works them out as `app.css` did.
 */
import { scopeColor, type TokenRule } from "../src/lib/scopeColor.ts";
import { contrast, flattened, luminance, mix, parsed, readable } from "../src/lib/themes/color.ts";
import type { ColorKey, Colors, ThemeType } from "../src/lib/themes/format.ts";

/** A VS Code theme's file as its author publishes it. */
export type VsCodeThemeFile = {
  displayName: string;
  type: ThemeType;
  colors: Record<string, string>;
  tokenColors: TokenRule[];
};

type KindKey = Extract<ColorKey, `kind.${string}`>;
type TerminalKey = Extract<ColorKey, `terminal.${string}`>;
type InterfaceKey =
  | KindKey
  | "background.base"
  | "background.panel"
  | "background.raised"
  | "background.hover"
  | "border.normal"
  | "text.normal"
  | "text.soft"
  | "text.muted"
  | "text.faint"
  | "accent.normal"
  | "accent.text"
  | "accent.background"
  | "state.changed"
  | "state.warning"
  | "state.warningBackground";

// A panel-coloured shade: close enough to the panels to sit with them, far enough to show.
function shades(color: string, panel: string): boolean {
  const apart = contrast(color, panel);
  return apart >= 1.04 && apart <= 1.8;
}

// Not a grey, which would not stand out as an accent.
function colourful(color: string): boolean {
  const { rgb } = parsed(color);
  return Math.max(...rgb) - Math.min(...rgb) >= 32;
}

const ansiNames = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"];

// What VS Code's terminal shows for a colour a theme leaves out: the eight colours, then their bright ones.
// biome-ignore format: eight colours to a line
const ansiDefaults = {
  dark: [
    "#000000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
    "#666666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5",
  ],
  light: [
    "#000000", "#cd3131", "#00bc00", "#949800", "#0451a5", "#bc05bc", "#0598bc", "#555555",
    "#666666", "#cd3131", "#14ce14", "#b5ba00", "#0451a5", "#bc05bc", "#0598bc", "#a5a5a5",
  ],
};

/** A theme's colours for the terminal panel, on its panels unless it gives the terminal a background of its own. */
export function terminalColors(theme: VsCodeThemeFile): Record<TerminalKey, string> {
  const { colors } = theme;
  const { "background.panel": panel, "text.normal": fg } = interfaceColors(theme);
  const terminal = colors["terminal.background"];
  const background = terminal ? flattened(terminal, panel) : panel;
  const read = (key: string, otherwise: string): string => {
    const color = colors[key];
    return color ? flattened(color, background) : otherwise;
  };
  const named = (name: string, bright: boolean, at: number): [string, string] => [
    `terminal.${bright ? `bright${name}` : name.toLowerCase()}`,
    read(`terminal.ansi${bright ? "Bright" : ""}${name}`, ansiDefaults[theme.type][at] as string),
  ];
  return {
    "terminal.background": background,
    "terminal.foreground": readable(read("terminal.foreground", fg), background, fg, 3),
    "terminal.cursor": read("terminalCursor.foreground", fg),
    "terminal.selection": read(
      "terminal.selectionBackground",
      read("editor.selectionBackground", mix(background, fg, 0.25)),
    ),
    ...Object.fromEntries([
      ...ansiNames.map((name, at) => named(name, false, at)),
      ...ansiNames.map((name, at) => named(name, true, at + 8)),
    ]),
  } as Record<TerminalKey, string>;
}

/** The interface's colours of a theme, each a solid `#rrggbb`. */
export function interfaceColors(theme: VsCodeThemeFile): Record<InterfaceKey, string> {
  const { colors } = theme;
  const dark = theme.type === "dark";
  const end = dark ? "#ffffff" : "#000000";
  const editor = flattened(colors["editor.background"] ?? (dark ? "#1e1e1e" : "#ffffff"), end);
  // Panels as dark as can be (Vitesse Black) have no room under them, so they lift a little.
  const surface = editor === "#000000" ? mix(editor, end, 0.07) : editor;

  const first = (...keys: string[]): string | undefined => {
    const key = keys.find((each) => colors[each]);
    return key ? flattened(colors[key] as string, surface) : undefined;
  };
  const shade = (keys: string[], otherwise: string): string =>
    keys.map((key) => first(key)).find((each) => each && shades(each, surface)) ?? otherwise;

  // Some themes dim one of their two foregrounds: the interface's text is the one that reads best.
  const [brightest] = [first("foreground"), first("editor.foreground")]
    .filter((each) => each !== undefined)
    .sort((a, b) => contrast(b, surface) - contrast(a, surface));
  const fg = readable(brightest ?? (dark ? "#cccccc" : "#616161"), surface, end, 4.5);
  const mark = (color: string, ratio = 3): string => readable(color, surface, fg, ratio);

  const under = [
    first("editorGroupHeader.tabsBackground"),
    first("sideBar.background"),
    first("titleBar.activeBackground"),
  ].find((each) => each && shades(each, surface) && luminance(each) < luminance(surface));
  const raised = shade(
    ["tab.activeBackground", "editor.lineHighlightBackground", "list.inactiveSelectionBackground"],
    mix(surface, fg, 0.09),
  );

  const red = mark(
    first("terminal.ansiRed", "errorForeground", "editorError.foreground") ??
      (dark ? "#f14c4c" : "#e51400"),
  );
  const yellow = mark(
    first("terminal.ansiYellow", "editorWarning.foreground") ??
      scopeColor(theme, "constant.numeric", fg),
  );
  const green = mark(first("terminal.ansiGreen") ?? scopeColor(theme, "string", fg));
  const blue = mark(first("terminal.ansiBlue") ?? scopeColor(theme, "entity.name.function", fg));
  const magenta = mark(first("terminal.ansiMagenta") ?? scopeColor(theme, "keyword.control", fg));
  const cyan = mark(first("terminal.ansiCyan") ?? scopeColor(theme, "support.type", fg));
  const accent = mark(
    ["list.highlightForeground", "textLink.foreground", "button.background", "focusBorder"]
      .map((key) => first(key))
      .find((each) => each && colourful(each)) ?? (dark ? "#3794ff" : "#006ab1"),
  );

  return {
    "background.base": under ?? mix(surface, "#000000", dark ? 0.3 : 0.05),
    "background.panel": surface,
    "background.raised": raised,
    "background.hover": shade(["list.inactiveSelectionBackground", "list.hoverBackground"], raised),
    "border.normal": mix(surface, fg, 0.18),
    "text.normal": fg,
    "text.soft": readable(mix(fg, surface, 0.1), surface, fg, 4.5),
    "text.muted": mark(mix(fg, surface, 0.18)),
    "text.faint": mark(
      first("gitDecoration.ignoredResourceForeground", "editorLineNumber.foreground") ??
        mix(fg, surface, 0.55),
      2,
    ),
    "accent.normal": accent,
    "accent.text": cyan,
    "accent.background": mix(surface, accent, 0.18),
    "state.changed": yellow,
    "state.warning": red,
    "state.warningBackground": mix(surface, red, 0.18),
    "kind.unit": blue,
    "kind.item": mark(mix(red, yellow, 0.5)),
    "kind.destructable": green,
    "kind.doodad": yellow,
    "kind.ability": cyan,
    "kind.buff": magenta,
    "kind.upgrade": red,
  };
}

/** The colours of an editor theme that a VS Code theme sets; `fillColors` works out the rest. */
export function editorColors(file: VsCodeThemeFile): Partial<Colors> {
  return { ...interfaceColors(file), ...terminalColors(file) };
}
