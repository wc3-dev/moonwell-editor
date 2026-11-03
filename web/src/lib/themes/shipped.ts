/**
 * The themes the editor comes with (Sven, 2026-11-02): one for each code theme, with its id and name, made once from the
 * code themes by `scripts/make-themes.ts` and tuned by hand since. Kanagawa Dragon is the default and first; then the
 * dark ones, then the light ones, each by name.
 */
import { parseTheme, type Theme } from "./format.ts";

const files = import.meta.glob<string>("/src/themes/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The theme the page starts with when none is chosen. */
export const defaultTheme = "kanagawa-dragon";

const idOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1, -".json".length);

const read = ([path, text]: [string, string]): Theme[] => {
  const { theme } = parseTheme(idOf(path), text, "shipped");
  return theme === null ? [] : [theme];
};

export const shippedThemes: Theme[] = Object.entries(files)
  .flatMap(read)
  .sort(
    (a, b) =>
      Number(b.id === defaultTheme) - Number(a.id === defaultTheme) ||
      a.type.localeCompare(b.type) ||
      a.name.localeCompare(b.name),
  );
