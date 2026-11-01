import {
  type BlockView,
  type FunctionKind,
  type FunctionPlace,
  type FunctionView,
  moveFunction,
  moveItem,
  type TreeItem,
} from "./api.ts";
import { type DropPlace, dropPlaceAt, treeDrop } from "./lists.ts";
import { atEnd, blockPlace, parentOf, type TriggerState } from "./triggerState.svelte.ts";

/** How long a drag rests on a closed category before it opens, in milliseconds. */
const openAfter = 600;

/** Dragging the tree's rows, and the functions on the cards. */
export class TriggerDrag {
  draggedItem = $state<TreeItem | null>(null);
  dropAt = $state<{ id: number; place: DropPlace } | null>(null);
  draggedFunction = $state.raw<{ owner: number; function_: FunctionView } | null>(null);
  /** Where the function dragged would land: next to a function, or at a place of a block or a list. */
  functionDrop = $state.raw<{
    key: string;
    owner: number;
    target?: FunctionView;
    after?: boolean;
    place?: FunctionPlace;
  } | null>(null);

  readonly #state: TriggerState;
  #opening: ReturnType<typeof setTimeout> | undefined;

  constructor(state: TriggerState) {
    this.#state = state;
  }

  startRow(row: TreeItem, event: DragEvent): void {
    this.draggedItem = row;
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", row.name);
      event.dataTransfer.effectAllowed = "move";
    }
  }

  rowOver(event: DragEvent, row: TreeItem): void {
    const dragged = this.draggedItem;
    const { tree, isOpen, toggled } = this.#state;
    if (!dragged || !tree) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const holds = row.kind === "category" || row.kind === "root";
    const place = dropPlaceAt(event.clientY - box.top, box.height, holds);
    const found = treeDrop(tree.items, dragged, row, place, isOpen);
    if (!found) {
      this.dropAt = null;
      return;
    }

    event.preventDefault();
    if (this.dropAt?.id !== row.id || this.dropAt.place !== place) {
      clearTimeout(this.#opening);
      if (place === "inside" && row.kind === "category" && !isOpen(row)) {
        this.#opening = setTimeout(() => (toggled[row.id] = true), openAfter);
      }
    }

    this.dropAt = { id: row.id, place };
  }

  rowLeft(): void {
    clearTimeout(this.#opening);
    this.dropAt = null;
  }

  rowDrop(event: DragEvent, row: TreeItem): void {
    event.preventDefault();
    const dragged = this.draggedItem;
    const place = this.dropAt?.id === row.id ? this.dropAt.place : null;
    this.end();
    const { tree, isOpen, toggled, edit } = this.#state;
    if (!dragged || !tree || !place) return;
    const found = treeDrop(tree.items, dragged, row, place, isOpen);
    if (found) {
      toggled[found.parent] = true;
      edit(() => moveItem(dragged.id, found.parent, found.index));
    }
  }

  end = (): void => {
    clearTimeout(this.#opening);
    this.draggedItem = null;
    this.dropAt = null;
    this.draggedFunction = null;
    this.functionDrop = null;
  };

  // True when the function dragged may go next to or into `path` of the card `owner`: not inside itself.
  #outsideDragged(owner: number, path: string): boolean {
    const dragged = this.draggedFunction;
    if (!dragged) return false;
    if (dragged.owner !== owner) return true;
    return path !== dragged.function_.path && !path.startsWith(`${dragged.function_.path}/`);
  }

  startFunction = (owner: number, function_: FunctionView): void => {
    this.draggedFunction = { owner, function_ };
  };

  overFunction = (event: DragEvent, owner: number, target: FunctionView): void => {
    if (
      this.draggedFunction?.function_.kind !== target.kind ||
      !this.#outsideDragged(owner, target.path)
    ) {
      return;
    }
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY - box.top > box.height / 2;
    this.functionDrop = {
      key: `${owner}:${target.path}:${after ? "after" : "before"}`,
      owner,
      target,
      after,
    };
  };

  overBlock = (event: DragEvent, owner: number, parent: FunctionView, block: BlockView): void => {
    if (
      this.draggedFunction?.function_.kind !== block.kind ||
      !this.#outsideDragged(owner, parent.path)
    ) {
      return;
    }
    event.preventDefault();
    this.functionDrop = {
      key: `${owner}:${parent.path}:block${block.branch}`,
      owner,
      place: blockPlace(parent, block),
    };
  };

  overSection = (event: DragEvent, owner: number, kind: FunctionKind): void => {
    if (this.draggedFunction?.function_.kind !== kind) return;
    event.preventDefault();
    this.functionDrop = {
      key: `${owner}:section:${kind}`,
      owner,
      place: { parent: null, branch: 0, index: atEnd },
    };
  };

  dropFunction = (event: DragEvent): void => {
    event.preventDefault();
    const dragged = this.draggedFunction;
    const at = this.functionDrop;
    this.end();
    if (!dragged || !at) return;
    let place = at.place;
    if (at.target) {
      const target = at.target;
      const siblings = this.#state
        .siblingsOf(at.owner, target)
        .filter((each) => dragged.owner !== at.owner || each.path !== dragged.function_.path);
      const index = siblings.findIndex((each) => each.path === target.path) + (at.after ? 1 : 0);
      place = { parent: parentOf(target), branch: target.branch ?? 0, index };
    }

    if (place) {
      const to = place;
      const sameCard = dragged.owner === at.owner;
      this.#state.edit(
        () => moveFunction(dragged.owner, dragged.function_.path, at.owner, to),
        sameCard ? at.owner : undefined,
      );
    }
  };
}
