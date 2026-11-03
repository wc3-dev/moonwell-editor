/**
 * The move from the window's storage to the `.moonwell` folder (Sven, 2026-11-02): the first start that finds no
 * `settings.json` turns what the page kept in the storage, and what the old app settings kept, into the new files, so
 * nobody loses a setting. The old storage is left as it is and no longer read.
 */
import { kinds } from "../api.ts";
import { defaultKeymap, emptyHotkeys, readKeymap, withKeymap } from "../app/keymap.ts";
import { codeThemeWith } from "../codeThemes.ts";
import { storageKey as columnsKey } from "../objects/table.ts";
import { type Prefs, settingsTextOf, uiScales } from "../prefs.svelte.ts";
import { playerIndex } from "../teamColors.ts";
import { defaultTheme } from "../themes.ts";
import { type HomeBoot, keepState, writeHome } from "./home.ts";
import { isRecord } from "./jsonc.ts";

const movedKey = "moonwell-editor.moved";

type Moved = {
  settings: string;
  hotkeys: string | null;
  state: Record<string, unknown>;
};

/** What the storage keeps under `key`, or null when there is nothing or the storage refuses. */
function stored(storage: Pick<Storage, "getItem">, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** What the storage keeps under `key` as JSON, or undefined when there is nothing or it is not JSON. */
function storedJson(storage: Pick<Storage, "getItem">, key: string): unknown {
  const text = stored(storage, key);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The id VS Code's own theme has for an id the editor saved (a palette from before has a twin), else the id as saved. */
const themeId = (id: string): string => codeThemeWith(id)?.id ?? id;

/** What the old storage kept under `moonwell-editor.prefs`; nothing when it is missing or not an object. */
function oldPrefs(storage: Pick<Storage, "getItem">): Record<string, unknown> {
  const read = storedJson(storage, "moonwell-editor.prefs");
  return isRecord(read) ? read : {};
}

/** The switches as the old storage held them, with the values the old app took them as. */
function savedSwitches(
  storage: Pick<Storage, "getItem">,
  old: Record<string, unknown>,
  legacy: HomeBoot["legacy"],
): Partial<Prefs> {
  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  const theme = stored(storage, "moonwell-editor.theme");
  const graphics = stored(storage, "moonwell-editor.graphics");
  const codeTheme = text(old.codeTheme);
  // Without a saved theme the old app showed its default one, and scripts followed the interface unless prefs chose a theme.
  const interfaceTheme = codeThemeWith(theme ?? defaultTheme)?.id ?? defaultTheme;
  const followed = theme || stored(storage, "moonwell-editor.prefs") !== null;

  return {
    theme: theme ? themeId(theme) : defaultTheme,
    // Same as the theme meant the interface's theme, and now means Dark Plus or Light Plus (Sven, 2026-11-02).
    codeTheme: codeTheme ? themeId(codeTheme) : followed ? interfaceTheme : "",
    uiScale: uiScales.find((each) => each === old.uiScale) ?? 100,
    gameFolder: legacy?.gameFolder || null,
    graphicsMode: graphics === "sd" || graphics === "hd" ? graphics : "de",
    teamColor: playerIndex(typeof old.teamColor === "number" ? old.teamColor : 0),
    showHidden: old.showHidden === true,
    // Kept as confirmReload before it covered every question.
    confirm: (old.confirm ?? old.confirmReload) !== false,
    // Where the notice's own "Don't show this again" was kept before it moved to Settings.
    alphaNotice:
      typeof old.alphaNotice === "boolean"
        ? old.alphaNotice
        : stored(storage, "moonwell-editor.alpha-understood") !== "yes",
    experimental: old.experimental === true,
    terminalShell: text(old.terminalShell),
  };
}

/** The hotkeys file the old changes make, or null when they change nothing. */
function savedHotkeys(storage: Pick<Storage, "getItem">): string | null {
  const { keymap } = readKeymap(stored(storage, "moonwell-editor.hotkeys"));
  const text = withKeymap(emptyHotkeys, defaultKeymap(), keymap);
  return text === emptyHotkeys ? null : text;
}

/** The state the old storage kept, under the keys `state.json` uses. */
function savedState(
  storage: Pick<Storage, "getItem">,
  old: Record<string, unknown>,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (typeof old.terminalHeight === "number" && Number.isFinite(old.terminalHeight)) {
    state.terminalHeight = old.terminalHeight;
  }

  // Each kind kept `{ favourites }`; the state keeps the list.
  const filters = storedJson(storage, "moonwell-editor.field-filters");
  const favourites: Record<string, string[]> = {};
  for (const kind of kinds) {
    const ofKind = isRecord(filters) ? filters[kind] : undefined;
    const ids = isRecord(ofKind) && Array.isArray(ofKind.favourites) ? ofKind.favourites : [];
    const named = ids.filter((id): id is string => typeof id === "string");
    if (named.length > 0) favourites[kind] = named;
  }
  if (Object.keys(favourites).length > 0) state.favourites = favourites;

  // The columns were JSON text under the key the state uses.
  for (const kind of kinds) {
    const columns = storedJson(storage, columnsKey(kind));
    if (Array.isArray(columns)) state[columnsKey(kind)] = columns;
  }

  const colours = storedJson(storage, "moonwell-editor.tooltip-colours");
  const own = Array.isArray(colours)
    ? colours.filter(
        (each): each is string => typeof each === "string" && /^#[0-9a-f]{6}$/i.test(each),
      )
    : [];
  if (own.length > 0) state.tooltipColours = own;
  return state;
}

/**
 * The new files' contents for what the storage kept, and `legacy` (what the old app settings kept). The settings text
 * holds only what differs from the defaults; the hotkeys are null when no command differs.
 */
export function moveFromStorage(
  storage: Pick<Storage, "getItem">,
  legacy: HomeBoot["legacy"],
): Moved {
  const old = oldPrefs(storage);
  return {
    settings: settingsTextOf(savedSwitches(storage, old, legacy)),
    hotkeys: savedHotkeys(storage),
    state: savedState(storage, old),
  };
}

/**
 * Sends the moved files: the state's keys, then the hotkeys, then `settings.json`, whose being there is what stops the
 * move. It is written only when every write before it went through, and the storage is marked as moved once it is
 * written. After a write that failed, `settings.json` is not there and the next start moves again, so nothing is lost.
 */
async function send(moved: Moved, withHotkeys: boolean, storage: Storage): Promise<void> {
  let kept = true;
  for (const [key, value] of Object.entries(moved.state)) {
    if (!(await keepState(key, value))) kept = false;
  }
  if (withHotkeys && moved.hotkeys !== null && !(await writeHome("hotkeys.json", moved.hotkeys))) {
    kept = false;
  }
  if (!kept || !(await writeHome("settings.json", moved.settings))) return;
  try {
    storage.setItem(movedKey, "yes");
  } catch {
    // Not marked: the next start has settings.json, which stops the move all the same.
  }
}

/**
 * Moves once: when there is no `settings.json` (and none that could not be read) and the storage has not moved already,
 * sends the files and the state's keys (`send`, which remembers it moved). Gives the boot with the moved texts, for the
 * page to load; else gives `boot`. A `hotkeys.json` that is there is left alone.
 */
export function moveIfNeeded(boot: HomeBoot, storage: Storage): HomeBoot {
  if (boot.settings !== null || boot.unreadable.includes("settings.json")) return boot;
  if (stored(storage, movedKey) === "yes") return boot;

  const moved = moveFromStorage(storage, boot.legacy);
  const keepHotkeys = boot.hotkeys !== null || boot.unreadable.includes("hotkeys.json");
  void send(moved, !keepHotkeys, storage);
  return {
    ...boot,
    settings: moved.settings,
    hotkeys: keepHotkeys ? boot.hotkeys : moved.hotkeys,
    state: Object.keys(moved.state).length > 0 ? JSON.stringify(moved.state) : boot.state,
  };
}
