import { type Action, kindActions } from "./keymap.ts";
import type { Page } from "./pages.svelte.ts";

export type KeyCommand =
  | Action
  | "dismiss"
  | "focusTableFilter"
  | "renameTrigger"
  | "deleteTrigger";

export type KeyPlace = {
  page: Page;
  dialogOpen: boolean;
  mapOpen: boolean;
  /** The key goes to a box the user types in, which has its own undo and Delete. */
  typing: boolean;
  /** The key goes to a popover or dialog (a list of choices, a checkbox), not to the object shown. */
  inPopup: boolean;
  textSelected: boolean;
};

export type KeyAnswer = { command?: KeyCommand; prevent?: boolean };

const taken: KeyAnswer = { prevent: true };
const left: KeyAnswer = {};
const run = (command: KeyCommand): KeyAnswer => ({ command, prevent: true });

const keysOfTheObjectShown: Action[] = [
  "rename",
  "fieldIds",
  "newObject",
  "copyObject",
  "back",
  "forward",
  "changedOnly",
  "clearFilters",
  "collapseAll",
  "expandAll",
];
/** The keys of the window, which act on every page and in Monaco too. */
export const keysEverywhere: Action[] = [
  "save",
  "settings",
  "commandPalette",
  "terminal",
  "openFolder",
  "openArchive",
  "reload",
  "about",
  "showTerrain",
  "showTriggers",
  "showObjects",
  "showScripts",
  "showDetails",
  "showTable",
  ...(Object.keys(kindActions) as Action[]),
];
const keysOfTheScripts: Action[] = [...keysEverywhere, "undo", "redo"];
/** The keys that leave a terminal: all the others are the shell's. */
export const keysOutOfTheTerminal: Action[] = ["commandPalette", "terminal"];

/** The keys that act differently in the table; null for the others. */
function inTable(action: Action | undefined): KeyAnswer | null {
  if (action === "filterFields") return run("focusTableFilter");
  // The grid takes Delete for its cells, and anywhere else in the table the object shown is not in view.
  if (action === "deleteObject") return left;
  return action && keysOfTheObjectShown.includes(action) ? taken : null;
}

function inTriggers(action: "rename" | "deleteObject", place: KeyPlace): KeyAnswer {
  if (place.typing || place.inPopup) return action === "rename" ? taken : left;
  return run(action === "rename" ? "renameTrigger" : "deleteTrigger");
}

/** What a key press means where it happened. `action` is what the keymap makes of it. */
export function answerKey(
  action: Action | undefined,
  isEscape: boolean,
  place: KeyPlace,
): KeyAnswer {
  if (place.dialogOpen) return left;
  if (action === "commandPalette" && place.inPopup) return left;
  if (place.page === "table") {
    const answer = inTable(action);
    if (answer) return answer;
  }
  // The map takes undo and redo too: the Terrain Editor's strokes are undo steps.
  if (place.page === "map" && !(action && keysOfTheScripts.includes(action))) return left;
  if (isEscape) return { command: "dismiss" };
  if (!action) return left;
  if (place.page === "triggers" && (action === "rename" || action === "deleteObject")) {
    return inTriggers(action, place);
  }
  if (
    (place.page === "triggers" || place.page === "scripts") &&
    !keysOfTheScripts.includes(action)
  ) {
    return left;
  }
  switch (action) {
    case "undo":
    case "redo":
      return place.typing ? left : run(action);
    case "copy":
    case "paste":
      if (place.page !== "details" || !place.mapOpen || place.typing || place.inPopup) return left;
      return action === "copy" && place.textSelected ? left : run(action);
    case "deleteObject":
      return place.typing || place.inPopup ? left : run(action);
    default:
      return run(action);
  }
}

export function inMonaco(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".monaco-editor") !== null;
}

export function inTerminal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".xterm") !== null;
}

export function typingIn(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset"].includes(target.type);
  }
  if (inMonaco(target)) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * Whether the page has text selected that a copy would take. A box keeps its selection after the focus leaves it, and
 * Chromium still gives it as the page's selection (an offset in the box's parent, at the box), so a word left selected
 * in a box the user has clicked away from does not count: Ctrl C then went to it and the object was not copied.
 */
export function hasTextToCopy(selection: Selection | null): boolean {
  if (!selection || selection.toString() === "") return false;
  const at = selection.anchorNode?.childNodes[selection.anchorOffset];
  const inBox = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement;
  return !inBox || at === document.activeElement;
}

export function inPopup(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"], [data-popup]') !== null;
}
