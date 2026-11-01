import {
  type CloseRequest,
  closeAsking,
  closeWindow,
  currentMap,
  type MapInfo,
  redo,
  reload,
  type SessionState,
  save,
  undo,
} from "../api.ts";
import { BridgeError } from "../bridge.ts";
import { errorText } from "../errors.ts";
import { savedText } from "../objects/values.ts";
import { prefs } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import { hasTyped, sendTyped } from "../typing.ts";
import type { CommandQueue } from "./commandQueue.ts";
import type { Notices } from "./notices.svelte.ts";
import type { Objects } from "./objects.svelte.ts";
import { type OpenEntry, openFrom } from "./openMenu.ts";
import type { Pages } from "./pages.svelte.ts";
import { type Choice, dropUnsaved, type Settling, settleUnsaved } from "./settle.ts";

/** The unsaved-changes dialog: its question, whether Save is offered, and how it answers. */
type Unsaved = { question: string; canSave: boolean; answer: (choice: Choice) => void };

type Needs = { queue: CommandQueue; notices: Notices; objects: Objects; pages: Pages };

/** The open map: opening, reloading and saving it, and what to do with its unsaved edits. */
export class MapSession {
  map = $state.raw<MapInfo | null>(null);
  state = $state.raw<SessionState | null>(null);
  problem = $state("");
  problemsOpen = $state(false);
  opening = $state(false);
  saving = $state(false);
  unsaved = $state.raw<Unsaved | null>(null);
  /** The message of a save refused because the map changed on disk; "" when there is none to show. */
  diskChanged = $state("");
  confirmingReload = $state(false);

  readonly #queue: CommandQueue;
  readonly #notices: Notices;
  readonly #objects: Objects;
  readonly #pages: Pages;
  #closing = false;

  constructor({ queue, notices, objects, pages }: Needs) {
    this.#queue = queue;
    this.#notices = notices;
    this.#objects = objects;
    this.#pages = pages;
  }

  /**
   * How to ask what to do with the unsaved edits before an action (`question` names it), once a value still being
   * typed and every edit on its way have been answered (see `settle.ts`). With nothing unsaved it does not ask, unless
   * `always` (the window saw the map dirty, or a box holds a typed value).
   */
  #settling(question: string, canSave = true, always = false): Settling {
    return {
      flush: async () => {
        sendTyped(); // puts what was typed on the queue before the queue is waited for
        await this.#queue.idle();
      },
      dirty: () => this.state?.dirty === true,
      ask: () => {
        if (!prefs.confirm) return Promise.resolve("discard");
        if (this.unsaved) return Promise.resolve("cancel");
        return new Promise<Choice>((answer) => {
          this.unsaved = {
            question,
            canSave,
            answer: (choice) => {
              this.unsaved = null;
              answer(choice);
            },
          };
        });
      },
      save: this.save,
      always,
    };
  }

  /**
   * Runs an action that drops the unsaved edits (opening another map, reloading) once they are settled; `act` tells
   * the app to discard them only when the user chose to. When the app holds edits the page did not know of (the page
   * was loaded again), it refuses, and the page asks after all. True when it acted.
   */
  #dropping(
    question: string,
    canSave: boolean,
    act: (discard: boolean) => Promise<unknown>,
  ): Promise<boolean> {
    return dropUnsaved({
      ...this.#settling(question, canSave),
      act,
      refresh: async () => {
        const open = await currentMap();
        if (open) this.state = open.session;
      },
    });
  }

  /** "Open map…" › Folder… or Archive…: asks about unsaved edits first, then the entry's dialog picks the map. */
  openAnother = async (entry: OpenEntry): Promise<void> => {
    try {
      await this.#dropping(t("ask.beforeOpen"), true, (discard) =>
        this.openWith(() => openFrom(entry, discard)),
      );
    } catch (error) {
      this.problem = errorText(error);
    }
  };

  /**
   * Opens a map (a folder or an archive) with `open`, which asks the app (null when the user cancelled its dialog). An
   * `unsaved` refusal is passed on (the open did not say to discard); every other failure is shown.
   */
  async openWith(open: () => Promise<MapInfo | null>): Promise<void> {
    this.problem = "";
    this.opening = true;
    try {
      const started = performance.now();
      const info = await open();
      if (!info) return;
      console.info(`[timing] openMap ${info.name}: ${Math.round(performance.now() - started)} ms`);
      await this.show(info);
    } catch (error) {
      if (error instanceof BridgeError && error.code === "unsaved") throw error;
      this.problem = errorText(error);
    } finally {
      this.opening = false;
    }
  }

  /** Shows a map that was opened (or that the app had open when the page loaded): its tree, no object picked yet. */
  async show(info: MapInfo): Promise<void> {
    this.#setMap(info);
    this.#objects.startOver();
    await this.#objects.ensureTree(this.#objects.kind);
  }

  #setMap(info: MapInfo): void {
    this.map = info;
    this.#pages.mapChanged();
    this.problemsOpen = info.problems.length > 0;
  }

  /** Saves the map (Ctrl S). A value still being typed is sent first. True when it saved. */
  save = async (): Promise<boolean> => {
    if (!this.map || this.saving) return false;
    sendTyped(); // what was typed goes on the queue before the save
    this.saving = true;
    try {
      const report = await this.#queue.run(save);
      const files = report.written.join(", ");
      this.#notices.say(savedText(report), {
        title: report.backup
          ? t("notice.savedTitleBackup", { files, backup: report.backup })
          : files || undefined,
        warn: report.note !== "",
      });
      return true;
    } catch (error) {
      if (error instanceof BridgeError && error.code === "changedOnDisk") {
        this.diskChanged = error.message;
      } else {
        this.#notices.say(t("notice.notSaved", { error: errorText(error) }), { warn: true });
      }
      return false;
    } finally {
      this.saving = false;
    }
  };

  async undoOrRedo(again: boolean): Promise<void> {
    if (!this.map) return;
    try {
      const done = await this.#queue.run(again ? redo : undo);
      if (!done) {
        this.#notices.say(again ? t("notice.nothingToRedo") : t("notice.nothingToUndo"));
        return;
      }
      this.#notices.say(again ? t("notice.redone") : t("notice.undone"));
      await Promise.all([
        this.#objects.refreshTrees(),
        this.#objects.refreshObject(),
        this.#pages.refreshEditors(),
      ]);
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  }

  /**
   * The reload button: one question, "Are you sure...?", which says so when there are unsaved
   * changes. With the settings' questions off it reloads at once and drops them.
   */
  askReload = (): void => {
    if (!prefs.confirm) this.reloadFromDisk(true);
    else this.confirmingReload = true;
  };

  /** Reads the map again from disk; with `discard`, unsaved edits are dropped. */
  async reloadFromDisk(discard: boolean): Promise<void> {
    if (!this.map) return;
    try {
      this.#setMap(await this.#queue.run(() => reload(discard)));
      await this.#afterReload();
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  }

  /** Reads the map again from disk after a refused save, asking about unsaved edits, with no Save. */
  async reloadAfterDiskChange(): Promise<void> {
    if (!this.map) return;
    try {
      const done = await this.#dropping(t("ask.reloadDrops"), false, async (discard) => {
        this.#setMap(await this.#queue.run(() => reload(discard)));
      });
      if (done) await this.#afterReload();
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  }

  async #afterReload(): Promise<void> {
    await Promise.all([this.#objects.refreshTrees(), this.#objects.refreshObject()]);
    this.#notices.say(t("notice.reloaded"));
  }

  closeRequested = async (request: CloseRequest): Promise<void> => {
    // At once, so the window does not ask on its own; then, if needed, the dialog, and close only on its answer.
    closeAsking().catch(() => {});
    if (this.#closing) return;
    this.#closing = true;
    try {
      // It asks when the window saw the map dirty (the page may not have heard yet) or a box holds a typed value
      // (even one the app may refuse); otherwise it closes at once, once what was typed has been sent.
      const always = request.dirty || hasTyped();
      const settled = await settleUnsaved(this.#settling(t("ask.beforeClose"), true, always));
      if (settled !== "stopped") await closeWindow();
    } finally {
      this.#closing = false;
    }
  };
}
