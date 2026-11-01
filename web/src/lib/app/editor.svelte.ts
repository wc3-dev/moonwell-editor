import { createContext, tick } from "svelte";
import type { Kind } from "../api.ts";
import { prefs } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import { Appearance } from "./appearance.svelte.ts";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { actionOf, loadKeymap, shownKey } from "./keymap.ts";
import { MapSession } from "./mapSession.svelte.ts";
import { Notices } from "./notices.svelte.ts";
import { ObjectActions } from "./objectActions.svelte.ts";
import { Objects } from "./objects.svelte.ts";
import { openEntries } from "./openMenu.ts";
import { Pages } from "./pages.svelte.ts";
import { Startup } from "./startup.svelte.ts";
import { answerKey, inMonaco, inPopup, typingIn } from "./windowKeys.ts";

type Menu = { x: number; y: number; items: MenuItem[] };

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

  // Monaco keeps the keys it knows from the window, and Save and Settings stay the window's there too.
  onkeydowncapture = (event: KeyboardEvent): void => {
    if (!inMonaco(event.target)) return;
    const action = actionOf(event, this.keymap);
    if (action !== "save" && action !== "settings") return;
    event.stopPropagation();
    this.onkeydown(event);
  };

  onkeydown = (event: KeyboardEvent): void => {
    const { pages, session, objectActions, objects } = this;
    const typing = typingIn(event.target);
    const { command, prevent } = answerKey(actionOf(event, this.keymap), event.key === "Escape", {
      page: pages.page,
      dialogOpen: this.#dialogOpen,
      mapOpen: session.map !== null,
      typing,
      inPopup: inPopup(event.target),
      textSelected: (window.getSelection()?.toString() ?? "") !== "",
    });
    if (prevent) event.preventDefault();
    switch (command) {
      case "dismiss":
        // An Esc that closed a list or a menu is spent (Bits UI marks it). Otherwise it also lets go of a button clicked
        // last (a kind, a view), which would show its focus ring.
        if (!event.defaultPrevented) {
          session.problemsOpen = false;
          if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        }
        break;
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
    }
  };
}

export const [getEditor, setEditor] = createContext<Editor>();
