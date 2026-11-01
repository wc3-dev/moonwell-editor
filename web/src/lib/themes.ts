/**
 * The page's colour themes (Sven, 2026-11-01): VS Code's own themes (`codeThemes.ts`), each setting the colour tokens
 * app.css defines on `:root` (Kanagawa Dragon there, and first here: the default, Sven, 2026-10-29). A light theme makes
 * the whole page light. The choice is remembered in the window's storage.
 */
import { codeThemes, codeThemeWith } from "./codeThemes.ts";
import { interfaceColors } from "./themeColors.ts";

/** The colour tokens every theme sets, as app.css names them without the `--`. */
export const tokens = [
  "bg",
  "surface",
  "raised",
  "hover",
  "border",
  "fg",
  "text",
  "muted",
  "faint",
  "accent",
  "accent-hi",
  "accent-lo",
  "changed",
  "warn",
  "warn-lo",
  "cyan",
  "purple",
  "kind-unit",
  "kind-item",
  "kind-destructable",
  "kind-doodad",
  "kind-ability",
  "kind-buff",
  "kind-upgrade",
] as const;

export type Token = (typeof tokens)[number];

export type Theme = {
  id: string;
  name: string;
  type: "dark" | "light";
  colors: Record<Token, string>;
};

/** The theme the page starts with when none is chosen. */
export const defaultTheme = "kanagawa-dragon";

const fromFiles: Theme[] = codeThemes.map(({ id, name, type, ...rest }) => ({
  id,
  name,
  type,
  colors: interfaceColors({ id, name, type, ...rest }),
}));

/** Every theme: the default, then the others in the code themes' order, dark ones first. */
export const themes: Theme[] = [
  ...fromFiles.filter((each) => each.id === defaultTheme),
  ...fromFiles.filter((each) => each.id !== defaultTheme),
];

const storageKey = "moonwell-editor.theme";

/** The theme with this id (or the id of a palette from before, which VS Code's own took over), or the default one. */
export function themeOf(id: string | null | undefined): Theme {
  const wanted = codeThemeWith(id ?? "")?.id;
  return themes.find((each) => each.id === wanted) ?? (themes[0] as Theme);
}

/** Puts a theme's colours on the page. */
export function applyTheme(chosen: Theme, root: HTMLElement = document.documentElement): void {
  for (const token of tokens) root.style.setProperty(`--${token}`, chosen.colors[token]);
  root.dataset.theme = chosen.id;
  root.dataset.scheme = chosen.type;
  root.style.colorScheme = chosen.type;
}

/** The theme chosen last; the default one when none was, or the storage cannot be read. */
export function savedTheme(): Theme {
  try {
    return themeOf(localStorage.getItem(storageKey));
  } catch {
    return themeOf(defaultTheme);
  }
}

/** Remembers the theme chosen (the page still shows it when the storage cannot be written). */
export function saveTheme(chosen: Theme): void {
  try {
    localStorage.setItem(storageKey, chosen.id);
  } catch {
    // Not remembered: the next start shows the default theme.
  }
}
