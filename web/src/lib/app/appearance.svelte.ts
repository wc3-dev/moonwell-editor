import { frameColors } from "../api.ts";
import { prefs } from "../prefs.svelte.ts";
import { applyTheme, codeThemeOf, savedTheme, saveTheme, type Theme } from "../themes.ts";

export class Appearance {
  theme = $state(savedTheme());
  /** Scripts have a theme of their own: the one chosen in the settings, or this one. */
  readonly codeTheme = $derived(codeThemeOf(prefs.codeTheme, this.theme));

  constructor() {
    // Before the first paint, so the page never shows the default theme first.
    applyTheme(this.theme);
  }

  /** Puts a theme on the page and the window's frame, and remembers it. */
  use = (chosen: Theme): void => {
    this.theme = chosen;
    applyTheme(chosen);
    saveTheme(chosen);
    frameColors(chosen.colors.surface, chosen.colors.border).catch(() => {});
  };
}
