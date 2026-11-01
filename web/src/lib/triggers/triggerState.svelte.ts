import { errorText } from "../errors.ts";
import type { OpenScript } from "../scripts/openScripts.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import {
  addFunction,
  addItem,
  addVariable,
  type BlockView,
  type CardMove,
  type CardView,
  type Catalog,
  changeFunction,
  copyFunction,
  deleteItem,
  type FunctionKind,
  type FunctionPlace,
  type FunctionView,
  type ParameterKind,
  type ParameterView,
  pasteFunction,
  renameItem,
  setFolded,
  setOptions,
  setParameter,
  setPlaces,
  setVariable,
  type TreeItem,
  type TreeKind,
  type TriggerOptions,
  type TriggerTree,
  type TriggerView,
  triggerCards,
  triggerCatalog,
  trigger as triggerOf,
  triggerTree,
} from "./api.ts";
import { actedOn, findParameter, type TriggerZone, treeRows } from "./lists.ts";

type Needs = {
  /** Puts a command on the app's queue, so it runs after what is being sent. */
  queued: <T>(run: () => Promise<T>) => Promise<T>;
  onnotice: (text: string, warn?: boolean) => void;
  /** Opens a script in the Script Editor. */
  onscript: (script: OpenScript) => void;
  /** Says something was deleted, which may be a script open in the Script Editor. */
  ondeleted: () => void;
};

/** A place after everything in a list. */
export const atEnd = 2147483647;

export function blockPlace(parent: FunctionView, block: BlockView): FunctionPlace {
  return { parent: parent.path, branch: block.branch, index: atEnd };
}

/** The path of the function a function is in; null for one in a trigger's own list. */
export function parentOf(function_: FunctionView): string | null {
  const parts = function_.path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
}

/**
 * The map's triggers as the trigger editor shows them. The app keeps the triggers and works out their sentences; this
 * asks again after each edit.
 */
export class TriggerState {
  catalog = $state.raw<Catalog | null>(null);
  tree = $state.raw<TriggerTree | null>(null);
  problem = $state("");
  selected = $state<number | null>(null);
  /** Where the user is. There is one selection: it shows strong there and faintly on the other side, and F2 and Delete act there. */
  zone = $state<TriggerZone>("tree");
  /** The category on the grid with its cards, which come after the selection moved: the grid takes the two at once. */
  shown = $state.raw<{ parent: number; cards: CardView[] } | null>(null);
  flyTo = $state<{ id: number; count: number } | null>(null);
  commenting = $state<Record<number, boolean>>({});
  filter = $state("");
  toggled = $state<Record<number, boolean>>({});
  menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  /** The kind of function copied: the app keeps the copy. */
  clipboard = $state<FunctionKind | null>(null);
  adding = $state<{
    owner: number;
    title: string;
    kind: FunctionKind;
    place: FunctionPlace;
  } | null>(null);
  changing = $state<{ owner: number; function_: FunctionView } | null>(null);
  /** The parameters open, each inside the one before it, of the card `owner`. */
  parameters = $state<{ owner: number; paths: string[] }>({ owner: -1, paths: [] });
  picking = $state(false);
  deleting = $state<TreeItem | null>(null);
  editingVariable = $state<CardView | null>(null);
  /** The tree item being renamed, in its row or on its card: where the user was, which clicking away does not change. */
  renaming = $state<{ id: number; where: TriggerZone } | null>(null);

  isOpen = (each: TreeItem): boolean => this.toggled[each.id] ?? each.expanded;

  readonly readOnly = $derived(this.tree?.readOnly ?? true);
  readonly item = $derived(this.tree?.items.find((each) => each.id === this.selected) ?? null);
  /** The category whose grid shows: the one selected, or the one what is selected is in. */
  readonly gridParent = $derived(
    !this.item || this.item.kind === "root"
      ? null
      : this.item.kind === "category"
        ? this.item.id
        : this.item.parent,
  );
  readonly rows = $derived(this.tree ? treeRows(this.tree.items, this.isOpen, this.filter) : []);
  readonly openParameter = $derived.by<ParameterView | null>(() => {
    const path = this.parameters.paths.at(-1);
    const trigger = this.triggerIn(this.parameters.owner);
    return path && trigger ? findParameter(trigger, path) : null;
  });

  readonly #queued: Needs["queued"];
  readonly notice: Needs["onnotice"];
  readonly openScriptOf: Needs["onscript"];
  readonly #deleted: Needs["ondeleted"];
  #flights = 0;

  constructor({ queued, onnotice, onscript, ondeleted }: Needs) {
    this.#queued = queued;
    this.notice = onnotice;
    this.openScriptOf = onscript;
    this.#deleted = ondeleted;
  }

  itemOf(id: number | null | undefined): TreeItem | undefined {
    return this.tree?.items.find((each) => each.id === id);
  }

  triggerIn(id: number): TriggerView | null {
    return this.shown?.cards.find((card) => card.id === id)?.trigger ?? null;
  }

  async load(): Promise<void> {
    try {
      this.catalog = await this.#queued(triggerCatalog);
      await this.refresh();
      const root = this.tree?.items.find((each) => each.kind === "root");
      if (root && this.selected === null) await this.select(root.id, false);
    } catch (error) {
      this.problem = errorText(error);
    }
  }

  /** Asks for the tree and the grid again: after an edit, an undo, a save. */
  refresh = async (): Promise<void> => {
    try {
      this.tree = await this.#queued(triggerTree);
      // What was selected is gone: its category stays on the grid, if it is still there.
      if (this.selected !== null && !this.itemOf(this.selected)) {
        const parent = this.shown?.parent;
        this.selected = this.itemOf(parent) ? (parent ?? null) : null;
      }

      await this.#loadCards();
      this.problem = "";
    } catch (error) {
      this.problem = errorText(error);
    }
  };

  async #loadCards(): Promise<void> {
    const parent = this.gridParent;
    this.shown =
      parent === null ? null : { parent, cards: await this.#queued(() => triggerCards(parent)) };
  }

  // Asks again for the one card an edit changed, which on a large grid is much less than all of them.
  async #reloadCard(id: number): Promise<void> {
    const fresh = await this.#queued(() => triggerOf(id));
    if (this.shown) {
      const cards = this.shown.cards.map((card) =>
        card.id === id ? { ...card, name: fresh.name, trigger: fresh } : card,
      );
      this.shown = { parent: this.shown.parent, cards };
    }
  }

  // Opens the categories an item is in, so its row shows.
  #reveal(id: number): void {
    let at = this.itemOf(id);
    while (at && at.parent >= 0) {
      const up = at.parent;
      this.toggled[up] = true;
      at = this.itemOf(up);
    }
  }

  select = async (id: number, fly: boolean): Promise<void> => {
    const before = this.gridParent;
    this.selected = id;
    this.#reveal(id);
    try {
      if (this.gridParent !== before) await this.#loadCards();
      if (fly && this.gridParent !== id) this.flyTo = { id, count: ++this.#flights };
    } catch (error) {
      this.notice(errorText(error), true);
    }
  };

  /** Makes an edit, then shows the triggers as the app has them: only the card `owner` when it is given. True when it worked. */
  edit = async (change: () => Promise<unknown>, owner?: number): Promise<boolean> => {
    try {
      await this.#queued(change);
      if (owner === undefined) await this.refresh();
      else await this.#reloadCard(owner);
      return true;
    } catch (error) {
      this.notice(errorText(error), true);
      await this.refresh();
      return false;
    }
  };

  #targetCategory(): number {
    const tree = this.tree;
    if (!tree) return -1;
    const at = this.itemOf(this.selected);
    if (at?.kind === "category" || at?.kind === "root") return at.id;
    return at?.parent ?? tree.items.find((each) => each.kind === "root")?.id ?? -1;
  }

  add = async (kind: TreeKind): Promise<void> => {
    const parent = this.#targetCategory();
    let made = -1;
    if (await this.edit(async () => (made = await addItem(kind, parent)))) {
      await this.select(made, true);
    }
  };

  addNewVariable = async (): Promise<void> => {
    const parent = this.#targetCategory();
    const taken = new Set(this.tree?.variables.map((each) => each.name.toLowerCase()));
    let number = 1;
    while (taken.has(`variable_${String(number).padStart(3, "0")}`)) number++;
    const name = `Variable_${String(number).padStart(3, "0")}`;
    let made = -1;
    const input = { name, type: "integer", isArray: false, size: 1, initial: "" };
    if (await this.edit(async () => (made = await addVariable(input, parent)))) {
      await this.select(made, true);
    }
  };

  confirmDelete = async (): Promise<void> => {
    const each = this.deleting;
    this.deleting = null;
    if (each && (await this.edit(() => deleteItem(each.id)))) this.#deleted();
  };

  /** Starts renaming what is selected, where the user is: in its row, or on its card (F2). */
  startRename = (): void => {
    const each = actedOn(this.item, this.zone, this.gridParent);
    if (each && !this.readOnly) this.beginRename(each);
  };

  /** Asks to delete what is selected, where the user is (Delete). */
  deleteSelected = (): void => {
    const each = actedOn(this.item, this.zone, this.gridParent);
    if (each && !this.readOnly) this.deleting = each;
  };

  beginRename(each: TreeItem): void {
    if (this.zone === "tree") this.#reveal(each.id);
    this.renaming = { id: each.id, where: this.zone };
  }

  /** Enter or leaving the rename box renames, Esc gives up. */
  finishRename = (each: TreeItem, name: string | null): void => {
    if (this.renaming?.id !== each.id) return;
    this.renaming = null;
    const typed = name?.trim();
    if (!typed || typed === each.name) return;
    const variable = this.tree?.variables.find((other) => other.id === each.id);
    if (each.kind === "variable" && variable) {
      const { id, ...fields } = variable;
      this.edit(() => setVariable(id, { ...fields, name: typed }));
    } else {
      this.edit(() => renameItem(each.id, typed));
    }
  };

  openScript = (each: TreeItem): void => {
    this.openScriptOf({
      id: each.id,
      kind: each.kind,
      name: each.kind === "root" ? t("triggers.mapHeader") : each.name,
    });
  };

  addTo = (owner: number, kind: FunctionKind, place: FunctionPlace): void => {
    const title =
      kind === "event"
        ? t("triggers.addEvent")
        : kind === "condition"
          ? t("triggers.addCondition")
          : t("triggers.addAction");
    this.adding = { owner, title, kind, place };
  };

  pickedFunction = async (name: string): Promise<void> => {
    const asked = this.adding;
    const changed = this.changing;
    this.adding = null;
    this.changing = null;
    if (asked) {
      await this.edit(() => addFunction(asked.owner, asked.place, asked.kind, name), asked.owner);
    } else if (changed) {
      const { owner, function_ } = changed;
      await this.edit(() => changeFunction(owner, function_.path, name), owner);
    }
  };

  /** The functions next to a function in its list: a trigger's of its kind, or a block's. */
  siblingsOf(owner: number, function_: FunctionView): FunctionView[] {
    const trigger = this.triggerIn(owner);
    if (!trigger) return [];
    const search = (lists: FunctionView[][]): FunctionView[] | null => {
      for (const list of lists) {
        if (list.some((each) => each.path === function_.path)) return list;
        for (const each of list) {
          const found = search(each.blocks.map((block) => block.functions));
          if (found) return found;
        }
      }
      return null;
    };
    return search([trigger.events, trigger.conditions, trigger.actions]) ?? [];
  }

  async copy(owner: number, function_: FunctionView): Promise<void> {
    try {
      await this.#queued(() => copyFunction(owner, function_.path));
      this.clipboard = function_.kind;
    } catch (error) {
      this.notice(errorText(error), true);
    }
  }

  paste(owner: number, near: FunctionView, index: number): void {
    const place = { parent: parentOf(near), branch: near.branch ?? 0, index };
    this.edit(() => pasteFunction(owner, place), owner);
  }

  pasteInto(owner: number, kind: FunctionKind, place: FunctionPlace): void {
    if (this.clipboard === kind) this.edit(() => pasteFunction(owner, place), owner);
  }

  setParameterValue = async (path: string, kind: ParameterKind, value: string): Promise<void> => {
    const owner = this.parameters.owner;
    await this.#queued(() => setParameter(owner, path, kind, value));
    await this.#reloadCard(owner);
  };

  setPoint = async (path: string, x: number, y: number): Promise<void> => {
    const owner = this.parameters.owner;
    await this.#queued(async () => {
      await setParameter(owner, path, "function", "Location");
      await setParameter(owner, `${path}/p0`, "value", x.toFixed(1));
      await setParameter(owner, `${path}/p1`, "value", y.toFixed(1));
    });
    await this.#reloadCard(owner);
  };

  options = (id: number, change: TriggerOptions): void => {
    this.edit(() => setOptions(id, change));
  };

  inEvent(path: string): boolean {
    const first = Number(path.split("/")[0]);
    const trigger = this.triggerIn(this.parameters.owner);
    return trigger?.events.some((each) => Number(each.path) === first) ?? false;
  }

  // Shows where the cards now stand, then tells the app: on a large grid it takes a moment, and nothing else changes.
  async #place(
    places: CardMove[],
    change: () => Promise<unknown>,
    fold?: { id: number; folded: boolean },
  ): Promise<void> {
    if (this.shown) {
      const cards = this.shown.cards.map((card) => {
        const at = places.find((each) => each.id === card.id);
        const folded = card.id === fold?.id ? fold.folded : (card.place?.folded ?? false);
        return at ? { ...card, place: { x: at.x, y: at.y, folded } } : card;
      });
      this.shown = { parent: this.shown.parent, cards };
    }

    try {
      await this.#queued(change);
    } catch (error) {
      this.notice(errorText(error), true);
      await this.refresh();
    }
  }

  /** An empty click lets go of the card: the category on show stays selected. */
  emptyClicked = (): void => {
    if (this.shown) this.selected = this.shown.parent;
  };

  moved = (places: CardMove[]): void => {
    this.#place(places, () => setPlaces(places));
  };

  folded = (id: number, value: boolean, places: CardMove[]): void => {
    this.#place(places, () => setFolded(id, value, places), { id, folded: value });
  };
}
