import { untrack } from "svelte";
import { frameColors } from "../api.ts";
import { codeThemeOf } from "../codeThemes.ts";
import { setState, stateOf } from "../home/state.svelte.ts";
import { prefs, setPref } from "../prefs.svelte.ts";
import { allThemes, applyTheme, type Theme, terminalTheme, themeOf, themeVars } from "../themes.ts";

/** The theme the page showed last, kept in `state.json` for `public/first-paint.js` to show at the next start. */
type LastTheme = { id: string; scheme: Theme["type"]; vars: Record<string, string> };

const anything = (value: unknown): value is unknown => value !== undefined;

// Sends the theme to state.json when it differs from the one kept there, which is once per change of theme. Read
// untracked, so the page's effect that shows the theme doesn't run again for every other change to the state.
function remember(chosen: Theme): void {
  const last: LastTheme = { id: chosen.id, scheme: chosen.type, vars: themeVars(chosen) };
  const kept = untrack(() => stateOf("lastTheme", null, anything));
  if (JSON.stringify(kept) !== JSON.stringify(last)) setState("lastTheme", last);
}

export class Appearance {
  /** The theme `settings.json` names, or the default one when no theme has that id. Follows the theme files. */
  readonly theme = $derived(themeOf(prefs.theme, allThemes()));
  /** Scripts have a theme of their own: the one chosen in the settings, or Dark Plus or Light Plus by this one's kind. */
  readonly codeTheme = $derived(codeThemeOf(prefs.codeTheme, this.theme.type));
  /** The terminal panel follows the interface's theme, as the rest of the page does. */
  readonly terminalColors = $derived(terminalTheme(this.theme));

  #framed: Theme | null = null;

  constructor() {
    // Before the page mounts. The first paint can come earlier: public/first-paint.js shows the last theme until then.
    applyTheme(this.theme);
  }

  /** Puts the theme on the page, and on the window's frame once. The page calls it again when the theme changes. */
  show = (): void => {
    const chosen = this.theme;
    applyTheme(chosen);
    if (this.#framed === chosen) return;
    this.#framed = chosen;
    frameColors(chosen.colors["background.panel"], chosen.colors["border.normal"]).catch(() => {});
    remember(chosen);
  };

  /** Chooses a theme: it goes into `settings.json` and on the page at once. */
  use = (chosen: Theme): void => {
    setPref("theme", chosen.id);
    this.show();
  };
}
