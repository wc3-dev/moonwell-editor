/**
 * The editor's own switches (Sven, 2026-10-27), kept in `settings.json` in the `.moonwell` folder (Sven, 2026-11-02):
 * the theme and the code theme, the UI scale, the Warcraft III folder, the graphics mode, the team colour models are
 * shown in at first (Sven, 2026-10-29: player 1, Red), whether the objects World Editor does not show are listed (Sven,
 * 2026-11-02: off at first), whether the editor asks before reloading, deleting or dropping unsaved changes (Sven,
 * 2026-10-29: off asks nothing at all), whether the alpha notice opens at start (Sven, 2026-10-28: only Settings turns
 * it off), whether the experimental features are on (Sven, 2026-10-29: the table view; off at first), whether the
 * last map opens at start (Sven, 2026-11-03: off at first; the app reads it) and the shell a new terminal runs (Sven,
 * 2026-11-01).
 *
 * The file is edited by hand too, so a change made here is edited into its text, which keeps its comments and order
 * (Sven, 2026-11-02), and only what differs from the default is in it. A change made in the file reaches the page at
 * once. A file that can't be read is not written to: the page keeps the values it has until the file is fixed.
 */
import { codeThemeWith } from "./codeThemes.ts";
import type { GraphicsMode } from "./graphics.svelte.ts";
import { onHomeChanged } from "./home/home.ts";
import { HomeFile } from "./home/homeFile.svelte.ts";
import { lineOfKey, type Problem, setKey } from "./home/jsonc.ts";
import { playerIndex, teamColorIds } from "./teamColors.ts";
import { defaultTheme } from "./themes/shipped.ts";

export type Prefs = {
  /** The interface's theme, by id. */
  theme: string;
  /** The theme scripts are drawn in, by id; "" for the interface's kind of theme (Sven, 2026-10-31). */
  codeTheme: string;
  /** The UI scale, in percent. */
  uiScale: number;
  /** The Warcraft III install's folder; null for the install found. */
  gameFolder: string | null;
  graphicsMode: GraphicsMode;
  /** The player index (0 for player 1). */
  teamColor: number;
  showHidden: boolean;
  confirm: boolean;
  alphaNotice: boolean;
  experimental: boolean;
  reopenLastMap: boolean;
  /** The shell a new terminal runs, by id; "" for the first found (Sven, 2026-11-01). */
  terminalShell: string;
};

/** The UI scales the settings offer, in percent, as the app takes them. */
export const uiScales = [80, 100, 120];

type Setting<K extends keyof Prefs> = {
  /** The key in `settings.json`, a public name. */
  key: string;
  /** The value when the file has none, and the one not written. */
  fallback: Prefs[K];
  /** The pref for the file's value, or undefined when the editor can't use that value. */
  read: (value: unknown) => Prefs[K] | undefined;
  /** The file's value for the pref. */
  write: (value: Prefs[K]) => unknown;
};

const named = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;
const flag = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;
const oneOf =
  <T>(allowed: readonly T[]) =>
  (value: unknown): T | undefined =>
    allowed.find((each) => each === value);
const asWritten = <T>(value: T): T => value;
const noneIsNull = (value: string): string | null => value || null;

/** Each pref, its key in the file, and how the file's value and the pref turn into each other. */
const settings: { [K in keyof Prefs]: Setting<K> } = {
  theme: { key: "appearance.theme", fallback: defaultTheme, read: named, write: asWritten },
  codeTheme: {
    key: "appearance.codeTheme",
    fallback: "",
    read: (value) =>
      value === null ? "" : typeof value === "string" && codeThemeWith(value) ? value : undefined,
    write: noneIsNull,
  },
  uiScale: { key: "appearance.uiScale", fallback: 100, read: oneOf(uiScales), write: asWritten },
  gameFolder: {
    key: "game.folder",
    fallback: null,
    read: (value) => (value === null ? null : named(value)),
    write: asWritten,
  },
  graphicsMode: {
    key: "game.graphicsMode",
    fallback: "de",
    read: oneOf<GraphicsMode>(["sd", "hd", "de"]),
    write: asWritten,
  },
  teamColor: {
    key: "objects.teamColor",
    fallback: 0,
    read: (value) => {
      const index = (teamColorIds as readonly unknown[]).indexOf(value);
      return index < 0 ? undefined : index;
    },
    write: (index) => teamColorIds[playerIndex(index)],
  },
  showHidden: { key: "objects.showHidden", fallback: false, read: flag, write: asWritten },
  confirm: { key: "editor.confirm", fallback: true, read: flag, write: asWritten },
  alphaNotice: { key: "editor.alphaNotice", fallback: true, read: flag, write: asWritten },
  experimental: { key: "editor.experimental", fallback: false, read: flag, write: asWritten },
  reopenLastMap: { key: "editor.reopenLastMap", fallback: false, read: flag, write: asWritten },
  terminalShell: {
    key: "terminal.shell",
    fallback: "",
    read: (value) => (value === null ? "" : named(value)),
    write: noneIsNull,
  },
};

type Loose = {
  key: string;
  fallback: unknown;
  read: (value: unknown) => unknown;
  write: (value: unknown) => unknown;
};
const entries = Object.entries(settings) as unknown as [keyof Prefs, Loose][];

/** Every key of `settings.json` and its default there, for the schema. */
export const settingsDefaults: Record<string, unknown> = Object.fromEntries(
  entries.map(([, each]) => [each.key, each.write(each.fallback)]),
);

/** What a new `settings.json` holds: only where its schema is, for suggestions in the editor it is written in. */
export const emptySettings = '{\n  "$schema": "./schemas/settings.schema.json"\n}\n';

/** The text of a new `settings.json` holding `values`: only those that differ from the default, in the order of the keys. */
export function settingsTextOf(values: Partial<Prefs>): string {
  let text = emptySettings;
  for (const [pref, each] of entries) {
    const value = values[pref];
    if (value !== undefined && value !== each.fallback)
      text = setKey(text, each.key, each.write(value));
  }
  return text;
}

/** The switches; reading one in a template follows its changes. */
export const prefs = $state<Prefs>(
  Object.fromEntries(entries.map(([pref, each]) => [pref, each.fallback])) as Prefs,
);

// The file's latest text, whether it may be written to and the page's own write coming back are the HomeFile's.
const file = new HomeFile("settings.json", emptySettings);

/** What is wrong with `settings.json`: shown in Settings while it is. */
export const settingsProblems = file.problems;

/**
 * Takes the text of `settings.json`: every pref is what the file says or its default, and `settingsProblems` is what
 * is wrong with it. `null` is a file that is not there. A file that can't be read as JSON, or that the app could not
 * read (`unreadable`), leaves the prefs as they are and is not written to until a text comes that can be read.
 */
export function loadSettings(text: string | null, unreadable = false): void {
  const taken = file.take(text, unreadable);
  if (taken.kind !== "read") return;

  const found: Problem[] = [];
  for (const [pref, each] of entries) {
    const raw = taken.root[each.key];
    const value = raw === undefined ? undefined : each.read(raw);
    if (raw !== undefined && value === undefined) {
      const line = text === null ? undefined : lineOfKey(text, each.key);
      found.push({ code: "badValue", key: each.key, ...(line === undefined ? {} : { line }) });
    }
    (prefs as Record<string, unknown>)[pref] = value === undefined ? each.fallback : value;
  }
  file.show(found);
}

/** Sets a switch, and edits it into `settings.json`. */
export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs[key] = value;
  const each = settings[key] as unknown as Loose;
  file.edit((text) =>
    setKey(text, each.key, value === each.fallback ? undefined : each.write(value)),
  );
}

/** Follows `settings.json` as it is saved by another program. Gives the way to stop. */
export function watchSettings(): () => void {
  return onHomeChanged((change) => {
    if (change.file === "settings.json") loadSettings(change.text);
  });
}
