/**
 * The code themes: VS Code's own theme files as their authors publish them, from Shiki's collection (tm-themes), so a
 * script looks as it does in VS Code (Sven, 2026-11-01). Monaco reads the files as they are. A script box on a card has
 * one colour per kind of word, read from the same file. Aurora X is left out, for its GPL.
 */
import type { Theme } from "./themes.ts";

const files = import.meta.glob<string>(
  ["/node_modules/tm-themes/themes/*.json", "!/node_modules/tm-themes/themes/aurora-x.json"],
  { query: "?raw", import: "default", eager: true },
);

type TokenRule = { scope?: string | string[]; settings?: { foreground?: string } };

export type CodeTheme = {
  id: string;
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
  tokenColors: TokenRule[];
  /** The theme's file, for Monaco. */
  file: string;
};

function read(path: string, file: string): CodeTheme {
  const { displayName, type, colors, tokenColors } = JSON.parse(file);
  const id = path.slice(path.lastIndexOf("/") + 1, -".json".length);
  return { id, name: displayName, type, colors, tokenColors, file };
}

/** Every code theme, the dark ones first, as the interface is dark. */
export const codeThemes: CodeTheme[] = Object.entries(files)
  .map(([path, file]) => read(path, file))
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

/** The ids of the palettes from before the interface used VS Code's themes, whose twins took over. */
const earlierIds: Record<string, string> = {
  "gruvbox-dark": "gruvbox-dark-medium",
  "one-dark": "one-dark-pro",
};

/** The code theme with this id, or the id of a palette from before. */
export function codeThemeWith(id: string): CodeTheme | undefined {
  return codeThemes.find((each) => each.id === (earlierIds[id] ?? id));
}

/** The theme scripts are drawn in: the one chosen for them (Sven, 2026-10-31), or the interface's when none is. */
export function codeThemeOf(id: string, theme: Theme): CodeTheme {
  return codeThemeWith(id) ?? (codeThemeWith(theme.id) as CodeTheme);
}

/** The colours a script is drawn in, as app.css names them without the `--`. */
export const codeTokens = [
  "code-bg",
  "code-fg",
  "code-gutter",
  "code-selection",
  "code-keyword",
  "code-type",
  "code-string",
  "code-number",
  "code-comment",
  "code-function",
  "code-special",
  "code-operator",
] as const;

export type CodeToken = (typeof codeTokens)[number];

function selectors(scope: TokenRule["scope"]): string[] {
  const list = typeof scope === "string" ? scope.split(",") : (scope ?? []);
  return list.map((each) => each.trim());
}

/** The colour a scope gets, as VS Code picks it: the rule that names most of the scope, the later of two the same. */
export function scopeColor(theme: CodeTheme, scope: string, otherwise: string): string {
  let color = otherwise;
  let matched = 0;
  for (const rule of theme.tokenColors) {
    const foreground = rule.settings?.foreground;
    if (!foreground) continue;
    for (const selector of selectors(rule.scope)) {
      const named = scope === selector || scope.startsWith(`${selector}.`);
      if (named && selector.length >= matched) {
        color = foreground;
        matched = selector.length;
      }
    }
  }
  return color;
}

/** A theme's colours for a script box. What a file leaves out is VS Code's default for its kind of theme. */
export function codeColors(theme: CodeTheme): Record<CodeToken, string> {
  const { colors } = theme;
  const dark = theme.type === "dark";
  const fg = colors["editor.foreground"] ?? (dark ? "#d4d4d4" : "#000000");
  return {
    "code-bg": colors["editor.background"] ?? (dark ? "#1e1e1e" : "#ffffff"),
    "code-fg": fg,
    "code-gutter": colors["editorLineNumber.foreground"] ?? (dark ? "#858585" : "#237893"),
    "code-selection": colors["editor.selectionBackground"] ?? (dark ? "#264f78" : "#add6ff"),
    "code-keyword": scopeColor(theme, "keyword.control", fg),
    "code-type": scopeColor(theme, "support.type", fg),
    "code-string": scopeColor(theme, "string.quoted.double", fg),
    "code-number": scopeColor(theme, "constant.numeric", fg),
    "code-comment": scopeColor(theme, "comment.line", fg),
    "code-function": scopeColor(theme, "entity.name.function", fg),
    "code-special": scopeColor(theme, "variable.other.constant", fg),
    "code-operator": scopeColor(theme, "keyword.operator", fg),
  };
}

/** Puts a theme's script colours on the page. */
export function applyCodeTheme(
  chosen: CodeTheme,
  root: HTMLElement = document.documentElement,
): void {
  const colors = codeColors(chosen);
  for (const token of codeTokens) root.style.setProperty(`--${token}`, colors[token]);
}
