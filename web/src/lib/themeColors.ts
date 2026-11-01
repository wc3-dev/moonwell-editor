/**
 * The interface's colours from a VS Code theme (Sven, 2026-11-01). Which of a file's colours each token reads was
 * measured against the 13 palettes the editor had before, each against its own theme's file, so a theme looks as it did.
 * VS Code has no name for the seven kinds of object: they take the terminal's colours, else the syntax's. What a file
 * leaves out or sets too close to the panels is worked out, so every theme stays readable.
 */
import { type CodeTheme, scopeColor } from "./codeThemes.ts";
import type { Token } from "./themes.ts";

type Rgba = { rgb: [number, number, number]; alpha: number };

function parsed(color: string): Rgba {
  const digits = color.slice(1);
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const part = (at: number) => Number.parseInt(full.slice(at, at + 2), 16);
  return {
    rgb: [part(0), part(2), part(4)],
    alpha: full.length === 8 ? part(6) / 255 : 1,
  };
}

function written(rgb: [number, number, number]): string {
  return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of the way from one solid colour to the other, from 0 to 1. */
export function mix(from: string, to: string, amount: number): string {
  const a = parsed(from).rgb;
  const b = parsed(to).rgb;
  return written([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** A colour that may be see-through as it shows on `under`, which is solid. */
function flattened(color: string, under: string): string {
  const { rgb, alpha } = parsed(color);
  return mix(under, written(rgb), alpha);
}

function luminance(color: string): number {
  const [r, g, b] = parsed(color).rgb.map((part) => {
    const value = part / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How far apart two colours read, from 1 to 21: the WCAG's measure. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A colour moved toward `toward` until it reads `ratio` against `on`. */
function readable(color: string, on: string, toward: string, ratio: number): string {
  for (let step = 0; step < 10; step++) {
    const moved = mix(color, toward, step / 10);
    if (contrast(moved, on) >= ratio) return moved;
  }
  return toward;
}

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

/** The interface's colours of a theme, each a solid `#rrggbb`. */
export function interfaceColors(theme: CodeTheme): Record<Token, string> {
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
    bg: under ?? mix(surface, "#000000", dark ? 0.3 : 0.05),
    surface,
    raised,
    hover: shade(["list.inactiveSelectionBackground", "list.hoverBackground"], raised),
    border: mix(surface, fg, 0.18),
    fg,
    text: readable(mix(fg, surface, 0.1), surface, fg, 4.5),
    muted: mark(mix(fg, surface, 0.18)),
    faint: mark(
      first("gitDecoration.ignoredResourceForeground", "editorLineNumber.foreground") ??
        mix(fg, surface, 0.55),
      2,
    ),
    accent,
    "accent-hi": cyan,
    "accent-lo": mix(surface, accent, 0.18),
    changed: yellow,
    warn: red,
    "warn-lo": mix(surface, red, 0.18),
    cyan,
    purple: mark(first("terminal.ansiBrightMagenta") ?? magenta),
    "kind-unit": blue,
    "kind-item": mark(mix(red, yellow, 0.5)),
    "kind-destructable": green,
    "kind-doodad": yellow,
    "kind-ability": cyan,
    "kind-buff": magenta,
    "kind-upgrade": red,
  };
}
