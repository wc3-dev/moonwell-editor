import {
  copyObject,
  createObject,
  deleteObject,
  type Kind,
  nextId,
  type ObjectView,
  object,
  setCells,
} from "../api.ts";
import type { MenuItem } from "../ContextMenu.svelte";
import { errorText } from "../errors.ts";
import { isTypedId } from "../fields.ts";
import { prefs } from "../prefs.svelte.ts";
import { t, tCount } from "../text.ts";
import { nameField } from "../values.ts";
import type { CommandQueue } from "./commandQueue.ts";
import type { MapSession } from "./mapSession.svelte.ts";
import type { Notices } from "./notices.svelte.ts";
import type { Objects } from "./objects.svelte.ts";
import type { Pages } from "./pages.svelte.ts";

/**
 * An object copied, for Ctrl V to paste as a new custom object. There is no cut (Sven, 2026-10-29): a paste never
 * deletes the object it came from.
 */
type Clip = { kind: Kind; id: string; name: string; baseId: string };

/** The new-object dialog: the base, the id typed (the next free one to start with), and why it failed. */
type Creating = {
  kind: Kind;
  baseId: string;
  baseName: string;
  id: string;
  error: string;
  busy: boolean;
  /** For a paste: the object copied; absent for a new object. */
  from?: Clip;
};

type Deleting = { kind: Kind; id: string; name: string; baseId: string | null };

type Needs = {
  queue: CommandQueue;
  notices: Notices;
  objects: Objects;
  pages: Pages;
  session: MapSession;
};

export function hasTooltip(each: Kind): boolean {
  return each !== "destructable" && each !== "doodad";
}

/** What the user does to the objects themselves: making, copying, deleting, resetting and renaming them. */
export class ObjectActions {
  creating = $state<Creating | null>(null);
  deleting = $state.raw<Deleting | null>(null);
  clipboard = $state.raw<Clip | null>(null);
  /** The object renamed in its tree row, by id. */
  renaming = $state<string | null>(null);
  editingTooltip = $state(false);

  readonly #queue: CommandQueue;
  readonly #notices: Notices;
  readonly #objects: Objects;
  readonly #pages: Pages;
  readonly #session: MapSession;

  constructor({ queue, notices, objects, pages, session }: Needs) {
    this.#queue = queue;
    this.#notices = notices;
    this.#objects = objects;
    this.#pages = pages;
    this.#session = session;
  }

  #refused(view: ObjectView): boolean {
    if (view.readOnly)
      this.#notices.say(t("notice.readOnly", { reason: view.readOnly }), { warn: true });
    return view.readOnly !== null;
  }

  async #askId(asked: Pick<Creating, "kind" | "baseId" | "baseName" | "from">): Promise<void> {
    let id = "";
    let error = "";
    try {
      id = await nextId(asked.kind, asked.baseId);
    } catch (problem) {
      error = errorText(problem);
    }
    this.creating = { ...asked, id, error, busy: false };
  }

  /** The new-object dialog, based on the object shown (or its base), with the next free id. */
  startNew = async (): Promise<void> => {
    const shown = this.#objects.current;
    if (!shown) {
      this.#notices.say(t("notice.pickBase"));
      return;
    }
    if (this.#refused(shown)) return;
    const baseId = shown.baseId ?? shown.id;
    const baseName = shown.baseId
      ? (this.#objects.names[shown.kind]?.get(baseId) ?? baseId)
      : shown.name;
    await this.#askId({ kind: shown.kind, baseId, baseName });
  };

  /**
   * Why an id typed for a new object cannot be used, as it is typed: not four characters from ! to ~ without a comma,
   * or another object of the kind has it; null when it can (or is empty, which takes the next free id).
   */
  idProblem(each: Kind, typed: string): string | null {
    const id = typed.trim();
    if (id === "") return null;
    if (!isTypedId(id)) return t("notice.idInvalid");
    const taken = this.#objects.entryOf(each, id);
    return taken ? t("notice.idTaken", { id, name: taken.name || id }) : null;
  }

  async create(): Promise<void> {
    const asked = this.creating;
    if (!asked || asked.busy) return;
    asked.busy = true;
    asked.error = "";
    const { kind: each, baseId, baseName, from } = asked;
    const typed = asked.id.trim();
    const wanted = typed === "" ? undefined : typed;
    try {
      const id = await this.#queue.run(() =>
        from ? copyObject(each, from.id, wanted) : createObject(each, baseId, wanted),
      );
      this.creating = null;
      await this.#objects.refreshTrees(each);
      await this.#objects.show(each, id);
      this.#notices.say(
        from
          ? t("notice.pasted", { name: from.name, from: from.id, id })
          : t("notice.made", { id, base: baseName }),
      );
    } catch (error) {
      asked.error = errorText(error);
      asked.busy = false;
    }
  }

  /** Keeps the object for Ctrl V. */
  clip(each: Kind, id: string): void {
    const entry = this.#objects.entryOf(each, id);
    if (!entry) return;
    this.clipboard = { kind: each, id, name: entry.name, baseId: entry.baseId ?? id };
    this.#notices.say(t("notice.copied", { name: entry.name, id }));
  }

  /** The id dialog for a copy of the object copied, with the next free id. */
  paste = async (): Promise<void> => {
    const from = this.clipboard;
    if (!from || !this.#session.map) {
      this.#notices.say(t("notice.nothingCopied"));
      return;
    }
    const baseName = this.#objects.names[from.kind]?.get(from.baseId) ?? from.baseId;
    await this.#askId({ kind: from.kind, baseId: from.baseId, baseName, from });
  };

  /** Puts every field the map changes on the object back to its standard (or base) value, as one edit. */
  async #reset(each: Kind, id: string): Promise<void> {
    try {
      const current = this.#objects.current;
      const view = current?.kind === each && current.id === id ? current : await object(each, id);
      if (this.#refused(view)) return;
      const edits = view.fields
        .filter((field) => field.changed)
        .map((field) => ({ id, field: field.id, level: field.level, value: null }));
      if (edits.length === 0) {
        this.#notices.say(t("notice.noChangedFields", { name: view.name }));
        return;
      }
      await this.#queue.run(() => setCells(each, edits));
      await Promise.all([this.#objects.refreshTrees(each), this.#objects.refreshObject()]);
      this.#notices.say(tCount("notice.reset", edits.length, { name: view.name }));
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  }

  /** The context menu of an object in the tree; null when its tree does not hold it. */
  menuItems(each: Kind, id: string): MenuItem[] | null {
    const entry = this.#objects.entryOf(each, id);
    if (!entry) return null;
    const custom = entry.baseId !== null;
    const clipboard = this.clipboard;
    return [
      { label: t("menu.copy"), shortcut: "Ctrl C", run: () => this.clip(each, id) },
      { label: t("menu.copyName"), run: () => this.#copyName(entry.name) },
      {
        label: clipboard ? t("menu.pasteObject", { name: clipboard.name }) : t("menu.paste"),
        shortcut: "Ctrl V",
        disabled: !clipboard || clipboard.kind !== each,
        run: this.paste,
      },
      { separator: true },
      { label: t("menu.rename"), shortcut: "F2", run: () => this.renameInTree(each, id) },
      {
        label: t("menu.reset"),
        disabled: !entry.changed && !custom,
        run: () => this.#reset(each, id),
      },
      {
        label: t("menu.editTooltip"),
        disabled: !hasTooltip(each),
        run: () => (this.editingTooltip = true),
      },
      { separator: true },
      { label: t("menu.newBased"), shortcut: "Ctrl Shift N", run: this.startNew },
      {
        label: t("menu.delete"),
        shortcut: "Del",
        disabled: !custom,
        danger: true,
        run: this.askDelete,
      },
    ];
  }

  /** Copies the custom object shown, with the next free id, and shows the copy. */
  copyShown = async (): Promise<void> => {
    const shown = this.#objects.current;
    if (!shown?.baseId) return;
    try {
      const id = await this.#queue.run(() => copyObject(shown.kind, shown.id));
      await this.#objects.refreshTrees(shown.kind);
      await this.#objects.show(shown.kind, id);
      this.#notices.say(t("notice.copiedTo", { name: shown.name, from: shown.id, id }));
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  };

  askDelete = (): void => {
    const shown = this.#objects.current;
    if (!shown?.baseId) return;
    this.deleting = { kind: shown.kind, id: shown.id, name: shown.name, baseId: shown.baseId };
    if (!prefs.confirm) this.deleteAsked(); // the settings turned every question off; Ctrl Z brings it back
  };

  /** The Delete key (Ctrl Shift D with `copy`): deletes (asking first) or copies the custom object shown. */
  deleteOrCopyKey(copy: boolean): void {
    const shown = this.#objects.current;
    if (!shown) return;
    if (!shown.baseId) {
      this.#notices.say(copy ? t("notice.onlyCustomCopy") : t("notice.onlyCustomDelete"));
      return;
    }
    if (this.#refused(shown)) return;
    if (copy) this.copyShown();
    else this.askDelete();
  }

  deleteAsked = async (): Promise<void> => {
    const asked = this.deleting;
    this.deleting = null;
    if (!asked) return;
    try {
      await this.#queue.run(() => deleteObject(asked.kind, asked.id));
      this.#notices.say(t("notice.deleted", { name: asked.name, id: asked.id }));
      await this.#objects.refreshTrees(asked.kind);
      const current = this.#objects.current;
      if (current?.kind === asked.kind && current.id === asked.id && asked.baseId) {
        await this.#objects.show(asked.kind, asked.baseId);
      }
    } catch (error) {
      this.#notices.say(errorText(error), { warn: true });
    }
  };

  /** The cursor in the name field of the object shown. */
  async focusName(): Promise<void> {
    const shown = this.#objects.current;
    if (!shown || this.#refused(shown)) return;
    const field = nameField(shown);
    if (field) await this.#pages.details?.focusField(field);
  }

  /** Renames the object shown in its tree row, when it is the one asked for and can be edited. */
  renameInTree(each: Kind, id: string): void {
    const shown = this.#objects.current;
    if (!shown || shown.kind !== each || shown.id !== id || this.#refused(shown)) return;
    if (nameField(shown)) this.renaming = id;
  }

  /** Sets the name typed in the tree row (null when the rename was given up). */
  renamed = async (id: string, name: string | null): Promise<void> => {
    this.renaming = null;
    const shown = this.#objects.current;
    const field = shown && shown.id === id ? nameField(shown) : undefined;
    if (name === null || !field || name === field.value) return;
    const error = await this.#objects.edit(field, name);
    if (error) this.#notices.say(error, { warn: true });
  };

  #copyName(name: string): void {
    navigator.clipboard?.writeText(name).then(
      () => this.#notices.say(t("notice.copiedName", { name })),
      () => this.#notices.say(t("notice.notCopied"), { warn: true }),
    );
  }
}
