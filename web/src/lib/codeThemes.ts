/**
 * The code themes: VS Code's own theme files as their authors publish them, from Shiki's collection (tm-themes), so a
 * script looks as it does in VS Code (Sven, 2026-11-01). Monaco reads the files as they are. A script box on a card has
 * one colour per kind of word, read from the same file. Aurora X is left out, for its GPL. The files, 2 MB in all, load
 * when a theme is first wanted; tm-themes' own index names them.
 */
import { themes } from "tm-themes";
import { scopeColor, type TokenRule } from "./scopeColor.ts";
import type { ThemeType } from "./themes/format.ts";

const files = import.meta.glob<string>(
  ["/node_modules/tm-themes/themes/*.json", "!/node_modules/tm-themes/themes/aurora-x.json"],
  { query: "?raw", import: "default" },
);

const fileOf = (id: string) => `/node_modules/tm-themes/themes/${id}.json`;

/** A code theme's name and kind; `loadCodeTheme` gives its colours. */
export type CodeThemeInfo = { id: string; name: string; type: "dark" | "light" };

export type CodeTheme = CodeThemeInfo & {
  colors: Record<string, string>;
  tokenColors: TokenRule[];
  /** The theme's file, for Monaco. */
  file: string;
};

/** Every code theme, the dark ones first, as the interface is dark. */
export const codeThemes: CodeThemeInfo[] = themes
  .filter((each) => fileOf(each.name) in files)
  .map((each) => ({ id: each.name, name: each.displayName, type: each.type }))
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

const loaded = new Map<string, Promise<CodeTheme>>();

/** A code theme with its colours and its file, loaded once. */
export function loadCodeTheme(info: CodeThemeInfo): Promise<CodeTheme> {
  let theme = loaded.get(info.id);
  if (!theme) {
    const load = files[fileOf(info.id)] as () => Promise<string>;
    theme = load().then((file) => {
      const { colors, tokenColors } = JSON.parse(file);
      return { ...info, colors, tokenColors, file };
    });
    loaded.set(info.id, theme);
  }
  return theme;
}

/** Every code theme with its colours, in the order of `codeThemes`. */
export function loadCodeThemes(): Promise<CodeTheme[]> {
  return Promise.all(codeThemes.map(loadCodeTheme));
}

/** The ids of the palettes from before the interface used VS Code's themes, whose twins took over. */
const earlierIds: Record<string, string> = {
  "gruvbox-dark": "gruvbox-dark-medium",
  "one-dark": "one-dark-pro",
};

/** The code theme with this id, or the id of a palette from before. */
export function codeThemeWith(id: string): CodeThemeInfo | undefined {
  return codeThemes.find((each) => each.id === (earlierIds[id] ?? id));
}

/**
 * The theme scripts are drawn in: the one chosen for them (Sven, 2026-10-31), else Dark Plus, or Light Plus under a
 * light editor theme (Sven, 2026-11-02).
 */
export function codeThemeOf(id: string, type: ThemeType): CodeThemeInfo {
  return (
    codeThemeWith(id) ??
    (codeThemeWith(type === "light" ? "light-plus" : "dark-plus") as CodeThemeInfo)
  );
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
