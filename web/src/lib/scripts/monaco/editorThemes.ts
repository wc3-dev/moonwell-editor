/** The code themes, as an extension gives them to VS Code (Sven, 2026-11-01). */
import { type CodeThemeInfo, loadCodeThemes } from "../../codeThemes.ts";

export function editorThemeId(theme: CodeThemeInfo): string {
  return `moonwell-${theme.id}`;
}

/** Every code theme: what the extension adds, and the files they are in. */
export async function editorThemes(): Promise<{
  contributes: { id: string; label: string; uiTheme: "vs" | "vs-dark"; path: string }[];
  files: Map<string, string>;
}> {
  const themes = await loadCodeThemes();
  return {
    contributes: themes.map((theme) => ({
      id: editorThemeId(theme),
      label: theme.name,
      uiTheme: theme.type === "dark" ? "vs-dark" : "vs",
      path: `./${editorThemeId(theme)}.json`,
    })),
    files: new Map(themes.map((theme) => [`/${editorThemeId(theme)}.json`, theme.file])),
  };
}
