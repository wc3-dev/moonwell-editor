/**
 * Makes an editor theme for each VS Code theme that has none (Sven, 2026-11-02): `npm run themes` writes
 * `src/themes/<id>.json` from `node_modules/tm-themes`. It never overwrites a file, so the shipped themes can be tuned by
 * hand, and a code theme added later gets its twin. It runs under Node's type stripping, so it and what it imports use
 * relative `.ts` imports and nothing Vite-only.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fillColors } from "../src/lib/themes/fill.ts";
import { parseTheme, themeText } from "../src/lib/themes/format.ts";
import { editorColors, type VsCodeThemeFile } from "./vscodeColors.ts";

// Aurora X is left out of the code themes, for its GPL.
const left = new Set(["aurora-x"]);

/** The ids in `codeIds` that have no file among the `existing` ids, in the order of `codeIds`. */
export function missingThemes(codeIds: string[], existing: string[]): string[] {
  const had = new Set(existing);
  return codeIds.filter((id) => !had.has(id));
}

/** The text of the editor theme file for a VS Code theme, with every colour written. */
export function editorThemeText(id: string, vsCodeText: string): string {
  const file: VsCodeThemeFile = JSON.parse(vsCodeText);
  const colors = fillColors(file.type, editorColors(file));
  const text = themeText(
    { name: file.displayName, type: file.type, colors },
    `Made from the VS Code theme "${file.displayName}" in tm-themes.`,
  );
  const { theme, problems } = parseTheme(id, text, "shipped");
  if (theme === null || problems.length > 0) {
    throw new Error(`The theme made for ${id} has problems: ${JSON.stringify(problems)}`);
  }
  return text;
}

const idsIn = (folder: string): string[] =>
  readdirSync(folder)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();

/** Writes `themesDir` a file for each code theme in `codeDir` that has none, and returns their ids. */
export function makeThemes(codeDir: string, themesDir: string): string[] {
  mkdirSync(themesDir, { recursive: true });
  const codeIds = idsIn(codeDir).filter((id) => !left.has(id));
  const made = missingThemes(codeIds, idsIn(themesDir));
  for (const id of made) {
    const vsCodeText = readFileSync(join(codeDir, `${id}.json`), "utf8");
    writeFileSync(join(themesDir, `${id}.json`), editorThemeText(id, vsCodeText));
  }
  return made;
}

if (import.meta.main) {
  const made = makeThemes(
    fileURLToPath(new URL("../node_modules/tm-themes/themes", import.meta.url)),
    fileURLToPath(new URL("../src/themes", import.meta.url)),
  );
  console.log(
    made.length === 0
      ? "Every code theme has an editor theme: wrote none."
      : `Wrote ${made.length} editor themes to src/themes.`,
  );
}
