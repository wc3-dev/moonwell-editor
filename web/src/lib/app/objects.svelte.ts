import {
  type CellEdit,
  type FieldRef,
  type FieldView,
  type Kind,
  type ObjectView,
  object,
  resetField,
  setCells,
  setField,
  type TreeEntry,
  tree,
} from "../api.ts";
import { errorText } from "../errors.ts";
import { graphics, viewInMode } from "../graphics.svelte.ts";
import { FieldFilters } from "../objects/fieldFilters.svelte.ts";
import { type Lookup, listKinds } from "../objects/fields.ts";
import type { EditResult } from "../objects/TableView.svelte";
import { newTableState, type TableState } from "../objects/table.ts";
import { t } from "../text.ts";
import type { CommandQueue } from "./commandQueue.ts";
import type { History } from "./history.svelte.ts";

type Needs = {
  queue: CommandQueue;
  history: History;
  /** Where the details panel is scrolled to, once it shows. */
  scrollPosition: () => number | undefined;
};

/** The open map's objects: each kind's tree, the object shown, and the edits to it. */
export class Objects {
  kind = $state<Kind>("unit");
  /** Each kind's tree, fetched when first needed; also where the names of a list's objects come from. */
  trees = $state.raw<Partial<Record<Kind, TreeEntry[]>>>({});
  treeErrors = $state<Partial<Record<Kind, string>>>({});
  /** The object last picked in each kind. */
  picked = $state<Partial<Record<Kind, string>>>({});
  current = $state.raw<ObjectView | null>(null);
  error = $state("");
  /** The tree's filter text; the table filters its rows by it too. */
  filter = $state("");
  tableState = $state<TableState>(newTableState());
  fieldFilter = $state("");
  changedOnly = $state(false);
  favouritesOnly = $state(false);
  /** The categories the filter bar shows, by kind, as each kind has its own. */
  chosenCategories = $state<Partial<Record<Kind, string[]>>>({});
  showIds = $state(false);
  readonly fieldFilters = new FieldFilters();

  /** The object as the graphics mode shows it (the values the game keeps per mode are the mode's). */
  readonly shown = $derived(this.current ? viewInMode(this.current, graphics.mode) : null);

  /** The icons the shown kind's objects use, in the tree's order (each once), for the icon picker's order. */
  readonly iconsOfKind = $derived([
    ...new Set(
      (this.current ? (this.trees[this.current.kind] ?? []) : [])
        .map((entry) => entry.iconModes?.[graphics.mode] ?? entry.icon ?? "")
        .filter(Boolean),
    ),
  ]);

  readonly names = $derived.by(() =>
    this.#byKind((entry) => (entry.suffix ? `${entry.name} ${entry.suffix}` : entry.name)),
  );
  readonly #bareNames = $derived.by(() => this.#byKind((entry) => entry.name));

  readonly #queue: CommandQueue;
  readonly #history: History;
  readonly #scrollPosition: () => number | undefined;
  // Answers that come back after a newer request (another map, another object) are dropped.
  #generation = 0;
  #objectAsked = 0;
  readonly #treesAsked = new Set<Kind>();

  constructor({ queue, history, scrollPosition }: Needs) {
    this.#queue = queue;
    this.#history = history;
    this.#scrollPosition = scrollPosition;
  }

  #byKind(nameOf: (entry: TreeEntry) => string): Partial<Record<Kind, Map<string, string>>> {
    const result: Partial<Record<Kind, Map<string, string>>> = {};
    for (const [each, entries] of Object.entries(this.trees) as [Kind, TreeEntry[]][]) {
      result[each] = new Map(entries.map((entry) => [entry.id, nameOf(entry)]));
    }
    return result;
  }

  lookup: Lookup = (listOf, id) => {
    for (const each of listKinds(listOf)) {
      const name = this.names[each]?.get(id);
      if (name !== undefined) return { kind: each, name, bare: this.#bareNames[each]?.get(id) };
    }
    return undefined;
  };

  entryOf(each: Kind, id: string): TreeEntry | undefined {
    return this.trees[each]?.find((entry) => entry.id === id);
  }

  /** Forgets everything of the last map; answers still on their way are dropped. */
  startOver(): void {
    this.#generation++;
    this.trees = {};
    this.treeErrors = {};
    this.#treesAsked.clear();
    this.picked = {};
    this.#objectAsked++;
    this.current = null;
    this.error = "";
    this.#history.clear();
    this.tableState = newTableState();
  }

  ensureTree = async (each: Kind): Promise<void> => {
    if (this.#treesAsked.has(each)) return;
    this.#treesAsked.add(each);
    const generation = this.#generation;
    const started = performance.now();
    try {
      const entries = await tree(each);
      if (generation !== this.#generation) return;
      console.info(
        `[timing] tree ${each} (${entries.length}): ${Math.round(performance.now() - started)} ms`,
      );
      this.trees = { ...this.trees, [each]: entries };
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#treesAsked.delete(each);
      this.treeErrors[each] = errorText(error);
    }
  };

  /** Fetches the trees already loaded again (or one kind's), for new, deleted and renamed objects. */
  async refreshTrees(only?: Kind): Promise<void> {
    const generation = this.#generation;
    const loaded = (Object.keys(this.trees) as Kind[]).filter((each) => !only || each === only);
    await Promise.all(
      loaded.map(async (each) => {
        try {
          const entries = await tree(each);
          if (generation === this.#generation) this.trees = { ...this.trees, [each]: entries };
        } catch {
          // The tree as it was stays.
        }
      }),
    );
  }

  /** Fetches the object shown again (after an undo, a redo or a reload). */
  async refreshObject(): Promise<void> {
    const asked = this.current;
    if (!asked) return;
    const mine = ++this.#objectAsked;
    try {
      const found = await object(asked.kind, asked.id);
      if (mine === this.#objectAsked) this.#setCurrent(found);
    } catch (error) {
      if (mine !== this.#objectAsked) return;
      this.current = null;
      this.error = errorText(error);
    }
  }

  /** Shows an object, and remembers it in the history unless the history is being walked. */
  show = async (each: Kind, id: string, remember = true): Promise<void> => {
    if (remember) this.#history.visit({ kind: each, id }, this.#scrollPosition());
    this.kind = each;
    this.picked[each] = id;
    this.ensureTree(each);
    const mine = ++this.#objectAsked;
    this.error = "";
    const started = performance.now();
    try {
      const found = await object(each, id);
      if (mine !== this.#objectAsked) return;
      console.info(`[timing] object ${each} ${id}: ${Math.round(performance.now() - started)} ms`);
      this.#setCurrent(found);
    } catch (error) {
      if (mine !== this.#objectAsked) return;
      this.current = null;
      this.error = errorText(error);
    }
  };

  switchKind = (each: Kind): void => {
    const id = this.picked[each];
    if (id) {
      this.show(each, id);
      return;
    }
    this.kind = each;
    this.ensureTree(each);
    this.#objectAsked++;
    this.current = null;
    this.error = "";
  };

  /**
   * Sets a field of the object shown (or, with null, puts it back to the standard value). The object shown and its
   * tree are updated from the answer; answers with why the app refused the value, or null.
   */
  edit = async (field: FieldView, value: string | null): Promise<string | null> => {
    const asked = this.current;
    if (!asked) return t("notice.noObject");
    const target: FieldRef = {
      kind: asked.kind,
      id: asked.id,
      field: field.id,
      level: field.level,
    };
    try {
      const view = await this.#queue.run(() =>
        value === null ? resetField(target) : setField(target, value),
      );
      if (this.current?.kind === view.kind && this.current.id === view.id) this.#setCurrent(view);
      this.refreshTrees(view.kind);
      return null;
    } catch (error) {
      return errorText(error);
    }
  };

  /** Changes several fields of the object shown as one edit (the command card's X and Y); null when it was taken. */
  editFields = async (edits: { field: FieldView; value: string }[]): Promise<string | null> => {
    const asked = this.current;
    if (!asked) return t("notice.noObject");
    const result = await this.editCells(
      asked.kind,
      edits.map(({ field, value }) => ({
        id: asked.id,
        field: field.id,
        level: field.level,
        value,
      })),
    );
    return "error" in result ? result.error : null;
  };

  /**
   * Changes cells of the table as one edit, after the edits asked before it (it goes on the queue at once, so a save
   * asked after it waits for it). The table fetches its rows again on the `sessionChanged` that follows; the trees and
   * the object shown are fetched here, as an edit there may rename or change them.
   */
  editCells = async (each: Kind, edits: CellEdit[]): Promise<EditResult> => {
    try {
      const result = await this.#queue.run(() => setCells(each, edits));
      if (result.changed > 0) {
        this.refreshTrees(each);
        this.refreshObject();
      }
      return result;
    } catch (error) {
      return { error: errorText(error) };
    }
  };

  #setCurrent(view: ObjectView): void {
    this.current = view;
    for (const field of view.fields) {
      for (const each of listKinds(field.listOf)) this.ensureTree(each);
    }
  }
}
