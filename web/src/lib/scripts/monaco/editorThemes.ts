/** The code themes, as an extension gives them to VS Code (Sven, 2026-11-01). */
import { type CodeTheme, codeThemes } from "../../codeThemes.ts";

export function editorThemeId(theme: CodeTheme): string {
  return `moonwell-${theme.id}`;
}

/** Every code theme: what the extension adds, and the files they are in. */
export function editorThemes(): {
  contributes: { id: string; label: string; uiTheme: "vs" | "vs-dark"; path: string }[];
  files: Map<string, string>;
} {
  return {
    contributes: codeThemes.map((theme) => ({
      id: editorThemeId(theme),
      label: theme.name,
      uiTheme: theme.type === "dark" ? "vs-dark" : "vs",
      path: `./${editorThemeId(theme)}.json`,
    })),
    files: new Map(codeThemes.map((theme) => [`/${editorThemeId(theme)}.json`, theme.file])),
  };
}
