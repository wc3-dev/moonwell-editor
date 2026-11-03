/**
 * The editor's hotkeys (Sven, 2026-10-27): each action's keys, World Editor's where it has them, which the settings'
 * Hotkeys tab changes. A key is written as its modifiers and its key: `Ctrl+Shift+N`, `F2`, `Alt+ArrowLeft`. The
 * changes are kept in `hotkeys.json` in the `.moonwell` folder (Sven, 2026-11-02), only the commands whose keys differ
 * from the defaults, and the file is edited by hand too: a change made in it reaches the page at once, and a file that
 * can't be read is not written to. The table's own keys (arrows, Enter, Ctrl A) are not here. This is also the list
 * the command palette offers (Sven, 2026-11-01), so any command can be given a key.
 */

import type { Kind } from "../api.ts";
import { onHomeChanged } from "../home/home.ts";
import { HomeFile } from "../home/homeFile.svelte.ts";
import { lineOfKey, type Problem, parseObject, setKey } from "../home/jsonc.ts";
import { t } from "../text.ts";

/** The commands that show a kind of object. */
export const kindActions = {
  kindUnit: "unit",
  kindItem: "item",
  kindDestructable: "destructable",
  kindDoodad: "doodad",
  kindAbility: "ability",
  kindBuff: "buff",
  kindUpgrade: "upgrade",
} as const satisfies Record<string, Kind>;

export type Action =
  | "save"
  | "undo"
  | "redo"
  | "newObject"
  | "copyObject"
  | "copy"
  | "paste"
  | "rename"
  | "deleteObject"
  | "filterFields"
  | "fieldIds"
  | "back"
  | "forward"
  | "settings"
  | "commandPalette"
  | "terminal"
  | "openFolder"
  | "openArchive"
  | "reload"
  | "about"
  | "showTerrain"
  | "showTriggers"
  | "showObjects"
  | "showScripts"
  | "showDetails"
  | "showTable"
  | keyof typeof kindActions
  | "changedOnly"
  | "clearFilters"
  | "collapseAll"
  | "expandAll";

/** Every action, in the order the settings list them, with its name and its keys out of the box. */
export const actionList: { action: Action; name: string; keys: string[] }[] = [
  { action: "save", name: t("hotkey.save"), keys: ["Ctrl+S"] },
  { action: "undo", name: t("hotkey.undo"), keys: ["Ctrl+Z"] },
  { action: "redo", name: t("hotkey.redo"), keys: ["Ctrl+Y", "Ctrl+Shift+Z"] },
  { action: "newObject", name: t("hotkey.newObject"), keys: ["Ctrl+Shift+N"] },
  { action: "copyObject", name: t("hotkey.copyObject"), keys: ["Ctrl+Shift+D"] },
  { action: "copy", name: t("hotkey.copy"), keys: ["Ctrl+C"] },
  { action: "paste", name: t("hotkey.paste"), keys: ["Ctrl+V"] },
  { action: "rename", name: t("hotkey.rename"), keys: ["F2"] },
  { action: "deleteObject", name: t("hotkey.deleteObject"), keys: ["Delete"] },
  { action: "filterFields", name: t("hotkey.filterFields"), keys: ["Ctrl+F"] },
  { action: "fieldIds", name: t("hotkey.fieldIds"), keys: ["Ctrl+D"] },
  { action: "back", name: t("hotkey.back"), keys: ["Alt+ArrowLeft"] },
  { action: "forward", name: t("hotkey.forward"), keys: ["Alt+ArrowRight"] },
  { action: "settings", name: t("hotkey.settings"), keys: ["F10"] },
  { action: "commandPalette", name: t("hotkey.commandPalette"), keys: ["Ctrl+Shift+P"] },
  // VS Code's key (Sven, 2026-11-02), which is the Ö key on a Swedish keyboard.
  { action: "terminal", name: t("hotkey.terminal"), keys: ["Ctrl+`", "Ctrl+Ö"] },
  { action: "openFolder", name: t("hotkey.openFolder"), keys: [] },
  { action: "openArchive", name: t("hotkey.openArchive"), keys: [] },
  { action: "reload", name: t("hotkey.reload"), keys: [] },
  { action: "about", name: t("hotkey.about"), keys: [] },
  { action: "showTerrain", name: t("hotkey.showTerrain"), keys: [] },
  { action: "showTriggers", name: t("hotkey.showTriggers"), keys: [] },
  { action: "showObjects", name: t("hotkey.showObjects"), keys: [] },
  { action: "showScripts", name: t("hotkey.showScripts"), keys: [] },
  { action: "showDetails", name: t("hotkey.showDetails"), keys: [] },
  { action: "showTable", name: t("hotkey.showTable"), keys: [] },
  { action: "kindUnit", name: t("hotkey.kindUnit"), keys: [] },
  { action: "kindItem", name: t("hotkey.kindItem"), keys: [] },
  { action: "kindDestructable", name: t("hotkey.kindDestructable"), keys: [] },
  { action: "kindDoodad", name: t("hotkey.kindDoodad"), keys: [] },
  { action: "kindAbility", name: t("hotkey.kindAbility"), keys: [] },
  { action: "kindBuff", name: t("hotkey.kindBuff"), keys: [] },
  { action: "kindUpgrade", name: t("hotkey.kindUpgrade"), keys: [] },
  { action: "changedOnly", name: t("hotkey.changedOnly"), keys: [] },
  { action: "clearFilters", name: t("hotkey.clearFilters"), keys: [] },
  { action: "collapseAll", name: t("hotkey.collapseAll"), keys: [] },
  { action: "expandAll", name: t("hotkey.expandAll"), keys: [] },
];

export type Keymap = Record<Action, string[]>;

/** The text a new `hotkeys.json` starts from: only where its schema is, for suggestions in the editor it is written in. */
export const emptyHotkeys = '{\n  "$schema": "./schemas/hotkeys.schema.json"\n}\n';

/** The keys out of the box. */
export function defaultKeymap(): Keymap {
  return Object.fromEntries(actionList.map((each) => [each.action, [...each.keys]])) as Keymap;
}

const sameKeys = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((key, at) => key === b[at]);

// What the file holds as a keymap: the defaults with the commands it lists.
function keymapOf(
  root: Record<string, unknown>,
  text: string | null,
): {
  keymap: Keymap;
  problems: Problem[];
} {
  const keymap = defaultKeymap();
  const problems: Problem[] = [];
  const known = new Set<string>(actionList.map((each) => each.action));
  for (const [key, keys] of Object.entries(root)) {
    if (key === "$schema") continue;
    const line = text === null ? undefined : lineOfKey(text, key);
    const where = line === undefined ? {} : { line };
    if (!known.has(key)) problems.push({ code: "unknownKey", key, ...where });
    else if (Array.isArray(keys) && keys.every((each) => typeof each === "string"))
      keymap[key as Action] = keys;
    else problems.push({ code: "badValue", key, ...where });
  }
  return { keymap, problems };
}

/**
 * The keymap `hotkeys.json` makes: the defaults with the commands the text lists. `null` is a file that is not there.
 * A command that does not exist, or a value that is not a list of keys, is a problem and is skipped; a text that can't
 * be read as JSON is one problem and no change.
 */
export function readKeymap(text: string | null): { keymap: Keymap; problems: Problem[] } {
  const { root, problems } = parseObject(text);
  return problems.length > 0 ? { keymap: defaultKeymap(), problems } : keymapOf(root, text);
}

// The file's latest text, whether it may be written to and the page's own write coming back are the HomeFile's.
const file = new HomeFile("hotkeys.json", emptyHotkeys);

/** What is wrong with `hotkeys.json`: shown in Settings' Hotkeys tab while it is. */
export const hotkeyProblems = file.problems;

// The keymap the last readable hotkeys.json made.
let loaded = defaultKeymap();

/** The keys the last readable `hotkeys.json` made, the defaults before there is one: what the editor starts from. */
export function loadedKeymap(): Keymap {
  return Object.fromEntries(
    actionList.map((each) => [each.action, [...loaded[each.action]]]),
  ) as Keymap;
}

/**
 * Takes the text of `hotkeys.json`: gives the keymap it makes, and `hotkeyProblems` is what is wrong with it. A file that
 * can't be read as JSON, or that the app could not read (`unreadable`), gives none (the keys stay as they are) and is
 * not written to until a text comes that can be read. The page's own write coming back gives none either.
 */
export function loadHotkeys(text: string | null, unreadable = false): Keymap | undefined {
  const taken = file.take(text, unreadable);
  if (taken.kind !== "read") return undefined;

  const { keymap, problems } = keymapOf(taken.root, text);
  file.show(problems);
  loaded = keymap;
  return keymap;
}

/**
 * The text with the commands whose keys differ between `before` and `keymap` set to the new keys, edited in so the text's
 * comments and order stay. Only commands that differ from the defaults are in the file, so one put back to its keys is
 * taken out.
 */
export function withKeymap(text: string, before: Keymap, keymap: Keymap): string {
  const defaults = defaultKeymap();
  let next = text;
  for (const { action } of actionList) {
    if (sameKeys(keymap[action], before[action])) continue;
    next = setKey(
      next,
      action,
      sameKeys(keymap[action], defaults[action]) ? undefined : keymap[action],
    );
  }
  return next;
}

/**
 * Keeps the keymap's changes in `hotkeys.json`, edited into its latest text so its comments and order stay. Nothing is
 * written while the file can't be read.
 */
export function saveKeymap(keymap: Keymap): void {
  const before = readKeymap(file.text).keymap;
  file.edit((text) => withKeymap(text, before, keymap));
}

/** Follows `hotkeys.json` as it is saved by another program: `apply` gets each keymap it makes. Gives the way to stop. */
export function watchHotkeys(apply: (keymap: Keymap) => void): () => void {
  return onHomeChanged((change) => {
    if (change.file !== "hotkeys.json") return;
    const keymap = loadHotkeys(change.text);
    if (keymap) apply(keymap);
  });
}

const modifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

/** The key a key press is, as the keymap writes it; null for a modifier alone. */
export function keyOf(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey">,
): string | null {
  if (modifierKeys.has(event.key)) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", key]
    .filter(Boolean)
    .join("+");
}

/** The action a key press asks for in the keymap; undefined for none. */
export function actionOf(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey">,
  keymap: Keymap,
): Action | undefined {
  const key = keyOf(event);
  if (!key) return undefined;
  return actionList.find((each) => keymap[each.action].includes(key))?.action;
}

/** The actions other than `action` that already use `key`. */
export function clashes(keymap: Keymap, action: Action, key: string): Action[] {
  return actionList
    .filter((each) => each.action !== action && keymap[each.action].includes(key))
    .map((each) => each.action);
}

/** A key as the settings show it: `Ctrl Shift N`, `Alt ←`. */
export function shownKey(key: string): string {
  return key
    .split("+")
    .map((part) =>
      part === "ArrowLeft"
        ? "←"
        : part === "ArrowRight"
          ? "→"
          : part === "ArrowUp"
            ? "↑"
            : part === "ArrowDown"
              ? "↓"
              : part,
    )
    .join(" ");
}
