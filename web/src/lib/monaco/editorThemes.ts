/**
 * The code themes as VS Code's own themes, for Monaco (Sven, 2026-11-01), so a script has the colours there that it has on
 * a card. The scopes are the ones the JASS and Lua grammars name; a more exact scope wins over a shorter one.
 */
import { codeColors, type Theme, themes } from "../themes.ts";

export type EditorTheme = {
  name: string;
  type: "dark";
  colors: Record<string, string>;
  tokenColors: { scope: string[]; settings: { foreground: string } }[];
};

export function editorThemeId(theme: Theme): string {
  return `moonwell-${theme.id}`;
}

export function editorTheme(theme: Theme): EditorTheme {
  const code = codeColors(theme);
  const { colors } = theme;
  const scopes: [string, string[]][] = [
    [code["code-fg"], ["variable", "variable.parameter"]],
    [
      code["code-keyword"],
      ["keyword", "keyword.control", "keyword.declaration", "storage.type", "storage.modifier"],
    ],
    [
      code["code-type"],
      [
        "storage.type.primitive",
        "support.type",
        "support.class",
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
      ],
    ],
    [code["code-string"], ["string", "meta.string", "punctuation.definition.string"]],
    [code["code-number"], ["constant.numeric", "constant.language", "constant.character"]],
    [code["code-comment"], ["comment", "punctuation.definition.comment"]],
    [code["code-function"], ["entity.name.function", "variable.function", "support.function"]],
    [code["code-special"], ["variable.other.global", "variable.other.constant.global"]],
    [code["code-operator"], ["keyword.operator", "punctuation.separator", "punctuation.section"]],
  ];
  return {
    name: theme.name,
    type: "dark",
    colors: {
      "editor.background": code["code-bg"],
      "editor.foreground": code["code-fg"],
      "editorGutter.background": code["code-bg"],
      "minimap.background": code["code-bg"],
      "editorLineNumber.foreground": code["code-gutter"],
      "editorLineNumber.activeForeground": code["code-fg"],
      "editorCursor.foreground": code["code-fg"],
      "editor.selectionBackground": code["code-selection"],
      "editor.lineHighlightBackground": `${colors.surface}80`,
      "editorBracketMatch.background": code["code-selection"],
      "editorBracketMatch.border": colors.accent,
      "editorWidget.background": colors.surface,
      "editorWidget.border": colors.border,
      "editorWidget.foreground": colors.fg,
      "input.background": colors.bg,
      "input.border": colors.border,
      "input.foreground": colors.fg,
      focusBorder: colors.accent,
      "list.hoverBackground": colors.hover,
      "list.activeSelectionBackground": colors["accent-lo"],
      "list.activeSelectionForeground": colors.fg,
      "list.focusBackground": colors["accent-lo"],
      "list.focusForeground": colors.fg,
      "list.highlightForeground": colors["accent-hi"],
      "quickInput.background": colors.surface,
      "quickInput.foreground": colors.fg,
    },
    tokenColors: scopes.map(([foreground, scope]) => ({ scope, settings: { foreground } })),
  };
}

/** Every code theme, as an extension gives them to VS Code: what it adds, and the files they are in. */
export function editorThemes(): {
  contributes: { id: string; label: string; uiTheme: "vs-dark"; path: string }[];
  files: Map<string, string>;
} {
  return {
    contributes: themes.map((theme) => ({
      id: editorThemeId(theme),
      label: theme.name,
      uiTheme: "vs-dark",
      path: `./${editorThemeId(theme)}.json`,
    })),
    files: new Map(
      themes.map((theme) => [`/${editorThemeId(theme)}.json`, JSON.stringify(editorTheme(theme))]),
    ),
  };
}
