import { createContext, tick } from "svelte";
import type { Kind } from "../api.ts";
import { prefs } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import { Appearance } from "./appearance.svelte.ts";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { type Action, actionList, actionOf, kindActions, loadKeymap, shownKey } from "./keymap.ts";
import { MapSession } from "./mapSession.svelte.ts";
import { Notices } from "./notices.svelte.ts";
import { ObjectActions } from "./objectActions.svelte.ts";
import { Objects } from "./objects.svelte.ts";
import { openEntries } from "./openMenu.ts";
import { type Page, Pages } from "./pages.svelte.ts";
import { Startup } from "./startup.svelte.ts";
import {
  answerKey,
  inMonaco,
  inPopup,
  type KeyCommand,
  type KeyPlace,
  keysEverywhere,
  typingIn,
} from "./windowKeys.ts";

type Menu = { x: number; y: number; items: MenuItem[] };

/** One line of the command palette: a command and its keys. */
export type PaletteCommand = { action: Action; name: string; keys: string[] };

const pageCommands: Partial<Record<Action, Page>> = {
  showTerrain: "map",
  showTriggers: "triggers",
  showScripts: "scripts",
  showDetails: "details",
  showTable: "table",
};

// The commands that act on the object shown.
const objectCommands: Action[] = [
  "newObject",
  "copy",
  "rename",
  "fieldIds",
  "changedOnly",
  "collapseAll",
  "expandAll",
];

/** The editor's state and what acts across it: one for the page, which the components under `App` ask for. */
export class Editor {
  readonly notices = new Notices();
  readonly pages = new Pages();
  readonly queue = new CommandQueue();
  readonly history = new History();
  readonly appearance = new Appearance();
  readonly objects = new Objects({
    queue: this.queue,
    history: this.history,
    scrollPosition: () => this.pages.details?.scrollPosition(),
  });
  readonly session = new MapSession({
    queue: this.queue,
    notices: this.notices,
    objects: this.objects,
    pages: this.pages,
  });
  readonly objectActions = new ObjectActions({
    queue: this.queue,
    notices: this.notices,
    objects: this.objects,
    pages: this.pages,
    session: this.session,
  });
  readonly startup = new Startup(this.session);

  keymap = $state(loadKeymap());
  settingsOpen = $state(false);
  aboutOpen = $state(false);
  /** The notice the editor opens with, until Settings turns it off. */
  alphaOpen = $state(prefs.alphaNotice);
  paletteOpen = $state(false);
  menu = $state.raw<Menu | null>(null);

  readonly #dialogOpen = $derived(
    Boolean(
      this.session.unsaved ||
        this.session.diskChanged ||
        this.objectActions.creating ||
        this.objectActions.deleting ||
        this.settingsOpen ||
        this.aboutOpen ||
        this.alphaOpen ||
        this.paletteOpen ||
        this.session.confirmingReload,
    ),
  );

  /** The menu at the right of the header: opening a map, reloading it, saving, the settings and About. */
  openMainMenu = (button: HTMLElement): void => {
    const box = button.getBoundingClientRect();
    const ready = this.startup.view === "ready" && !this.session.opening;
    const { map, saving, state } = this.session;
    const saveKey = this.keymap.save[0];
    const settingsKey = this.keymap.settings[0];
    const paletteKey = this.keymap.commandPalette[0];
    this.menu = {
      x: box.right,
      y: box.bottom + 4,
      items: [
        ...openEntries.map((entry) => ({
          label: entry.archive ? t("header.openArchive") : t("header.openFolder"),
          disabled: !ready,
          run: () => this.session.openAnother(entry),
        })),
        { label: t("header.reload"), disabled: !map, run: this.session.askReload },
        { separator: true },
        {
          label: saving ? t("header.saving") : t("header.save"),
          shortcut: saveKey ? shownKey(saveKey) : undefined,
          disabled: !map || saving || !state?.dirty,
          run: this.session.save,
        },
        { separator: true },
        {
          label: t("header.settings"),
          shortcut: settingsKey ? shownKey(settingsKey) : undefined,
          run: () => (this.settingsOpen = true),
        },
        {
          label: t("header.commandPalette"),
          shortcut: paletteKey ? shownKey(paletteKey) : undefined,
          run: () => (this.paletteOpen = true),
        },
        { label: t("header.about"), run: () => (this.aboutOpen = true) },
      ],
    };
  };

  /** The context menu of an object in the tree; the object is shown first, so every entry acts on it. */
  openObjectMenu = async (each: Kind, id: string, x: number, y: number): Promise<void> => {
    const items = this.objectActions.menuItems(each, id);
    if (!items) return;
    this.menu = { x, y, items };
    await this.objects.show(each, id);
  };

  /** Opens an object in the details view (a row's name in the table). */
  openInDetails = (each: Kind, id: string): void => {
    this.pages.show("details");
    this.objects.show(each, id);
  };

  walk = async (by: number): Promise<void> => {
    const place = this.history.move(by, this.pages.details?.scrollPosition());
    if (!place) return;
    await this.objects.show(place.kind, place.id, false);
    await tick();
    if (place.scroll !== undefined) this.pages.details?.scrollTo(place.scroll);
  };

  // The mouse's back and forward buttons walk the history too, as in a browser.
  walkByMouse = (event: MouseEvent): void => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    this.walk(event.button === 3 ? -1 : 1);
  };

  // Monaco keeps the keys it knows from the window, and the window's own keys stay the window's there too.
  onkeydowncapture = (event: KeyboardEvent): void => {
    if (!inMonaco(event.target)) return;
    const action = actionOf(event, this.keymap);
    if (!action || !keysEverywhere.includes(action)) return;
    event.stopPropagation();
    this.onkeydown(event);
  };

  onkeydown = (event: KeyboardEvent): void => {
    const typing = typingIn(event.target);
    const { command, prevent } = answerKey(actionOf(event, this.keymap), event.key === "Escape", {
      ...this.#here,
      dialogOpen: this.#dialogOpen,
      typing,
      inPopup: inPopup(event.target),
      textSelected: (window.getSelection()?.toString() ?? "") !== "",
    });
    if (prevent) event.preventDefault();
    if (command === "dismiss") {
      // An Esc that closed a list or a menu is spent (Bits UI marks it). Otherwise it also lets go of a button clicked
      // last (a kind, a view), which would show its focus ring.
      if (!event.defaultPrevented) {
        this.session.problemsOpen = false;
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      }
    } else if (command) {
      this.#carryOut(command, typing);
    }
  };

  /** The commands the palette lists: those that can run where the user is. */
  commands = (): PaletteCommand[] =>
    actionList
      .filter((each) => this.#listed(each.action))
      .map(({ action, name }) => ({ action, name, keys: this.keymap[action] }));

  /** Runs a command the palette picked, as its key would on the page. */
  runCommand = (action: Action): void => {
    const { command } = answerKey(action, false, this.#here);
    if (command && command !== "dismiss") this.#carryOut(command, false);
  };

  // Where the user is, with nothing open and the focus on no box.
  get #here(): KeyPlace {
    return {
      page: this.pages.page,
      dialogOpen: false,
      mapOpen: this.session.map !== null,
      typing: false,
      inPopup: false,
      textSelected: false,
    };
  }

  // A key that does something else here (F2 and Delete act on a trigger in the trigger editor) is not its command.
  #listed(action: Action): boolean {
    if (action === "commandPalette") return false;
    const { command } = answerKey(action, false, this.#here);
    return (command === action || command === "focusTableFilter") && this.#canRun(action);
  }

  #canRun(action: Action): boolean {
    const { history, objects, pages, session, startup } = this;
    const page = pageCommands[action];
    if (page) {
      if (!session.map || page === pages.page) return false;
      if (page === "scripts") return pages.scriptsOpen;
      return page !== "table" || prefs.experimental;
    }
    if (objectCommands.includes(action)) return objects.current !== null;
    switch (action) {
      case "settings":
      case "about":
        return true;
      case "openFolder":
      case "openArchive":
        return startup.view === "ready" && !session.opening;
      case "showObjects":
        return session.map !== null && !pages.inObjectEditor;
      case "copyObject":
      case "deleteObject":
        return Boolean(objects.current?.baseId);
      case "filterFields":
        return pages.page === "table" || objects.current !== null;
      case "back":
        return history.behind.length > 0;
      case "forward":
        return history.ahead.length > 0;
      default:
        return session.map !== null;
    }
  }

  // The commands with no key out of the box. A key set for one works on any page, so it checks it can run first.
  readonly #windowCommands: Partial<Record<KeyCommand, () => void>> = {
    openFolder: () => this.session.openAnother(openEntries[0]),
    openArchive: () => this.session.openAnother(openEntries[1]),
    reload: () => this.session.askReload(),
    about: () => (this.aboutOpen = true),
    showTerrain: () => this.pages.show("map"),
    showTriggers: () => this.pages.show("triggers"),
    showObjects: () => this.pages.showObjectEditor(),
    showScripts: () => this.pages.show("scripts"),
    showDetails: () => this.pages.show("details"),
    showTable: () => this.pages.show("table"),
    changedOnly: () => (this.objects.changedOnly = !this.objects.changedOnly),
    collapseAll: () => this.pages.details?.collapseAll(true),
    expandAll: () => this.pages.details?.collapseAll(false),
    ...Object.fromEntries(
      Object.entries(kindActions).map(([action, each]) => [action, () => this.#showKind(each)]),
    ),
  };

  #showKind(each: Kind): void {
    this.pages.showObjectEditor();
    this.objects.switchKind(each);
  }

  #carryOut(command: Exclude<KeyCommand, "dismiss">, typing: boolean): void {
    const { pages, session, objectActions, objects } = this;
    const windowCommand = this.#windowCommands[command];
    if (windowCommand) {
      if (this.#canRun(command as Action)) windowCommand();
      return;
    }
    switch (command) {
      case "focusTableFilter":
        pages.tableView?.focusFilter();
        break;
      case "renameTrigger":
        pages.triggerEditor?.startRename();
        break;
      case "deleteTrigger":
        pages.triggerEditor?.deleteSelected();
        break;
      case "save":
        session.save();
        break;
      case "newObject":
        if (session.map) objectActions.startNew();
        break;
      case "undo":
      case "redo":
        session.undoOrRedo(command === "redo");
        break;
      case "copy":
      case "paste":
        if (pages.zone === "details" && pages.details?.clipKey(command === "copy" ? "c" : "v")) {
          break;
        }
        if (command === "paste") objectActions.paste();
        else if (objects.current) objectActions.clip(objects.current.kind, objects.current.id);
        break;
      case "rename":
        // In the tree, the object's row takes the new name; elsewhere its name field does.
        if (pages.zone === "tree" && objects.current && !typing) {
          objectActions.renameInTree(objects.current.kind, objects.current.id);
        } else {
          objectActions.focusName();
        }
        break;
      case "filterFields":
        pages.details?.focusFilter();
        break;
      case "copyObject":
        objectActions.deleteOrCopyKey(true);
        break;
      case "fieldIds":
        objects.showIds = !objects.showIds;
        break;
      case "deleteObject":
        objectActions.deleteOrCopyKey(false);
        break;
      case "back":
      case "forward":
        this.walk(command === "back" ? -1 : 1);
        break;
      case "settings":
        this.settingsOpen = true;
        break;
      case "commandPalette":
        this.paletteOpen = true;
        break;
    }
  }
}

export const [getEditor, setEditor] = createContext<Editor>();
