/** What a card asks of the trigger editor, what it reads from its grid, and how a card looks. */
import { createContext } from "svelte";
import type {
  BlockView,
  CardView,
  FunctionKind,
  FunctionView,
  ParameterView,
  TriggerCatalogView,
  TriggerOptions,
} from "./api.ts";
import type { ScriptLanguage } from "./scriptLanguages.ts";

/** What the cards on a grid can ask for; `owner` is the card a function is in. */
export type CardActions = {
  parameter(owner: number, parameter: ParameterView): void;
  change(owner: number, function_: FunctionView): void;
  functionMenu(owner: number, function_: FunctionView, x: number, y: number): void;
  add(owner: number, kind: FunctionKind): void;
  addToBlock(owner: number, parent: FunctionView, block: BlockView): void;
  blockMenu(owner: number, parent: FunctionView, block: BlockView, x: number, y: number): void;
  dragFunction(owner: number, function_: FunctionView): void;
  overFunction(event: DragEvent, owner: number, function_: FunctionView): void;
  overBlock(event: DragEvent, owner: number, parent: FunctionView, block: BlockView): void;
  overSection(event: DragEvent, owner: number, kind: FunctionKind): void;
  dropFunction(event: DragEvent): void;
  dragEnd(): void;
  select(id: number): void;
  open(id: number): void;
  /** The new name typed on a card, or null when the rename was given up (Esc). */
  rename(id: number, name: string | null): void;
  cardMenu(card: CardView, x: number, y: number): void;
  options(id: number, change: TriggerOptions): void;
  code(id: number, text: string): void;
  variable(card: CardView): void;
};

/** What every card on a grid is shown with. */
export type Shared = {
  catalog: TriggerCatalogView;
  mode: string;
  /** What the map's scripts are in. */
  language: ScriptLanguage;
  readOnly: boolean;
  selected: number | null;
  /** True while the grid is where the user is. */
  active: boolean;
  /** The card whose name is being typed on it; null for none. */
  renaming: number | null;
  commenting: Record<number, boolean>;
  dropKey: string | null;
  actions: CardActions;
};

/** What a card on the grid reads from it: Svelte Flow hands a card only its own data. */
export type Grid = {
  readonly shared: Shared;
  readonly zoom: number;
  fold(id: number, folded: boolean): void;
};

export const [getGrid, setGrid] = createContext<Grid>();

/** A rename box takes the cursor with its name selected, without scrolling what is around it. */
export function focusRename(input: HTMLInputElement): void {
  input.focus({ preventScroll: true });
  input.select();
}

/** A function card's title bar: flow is what holds other cards. */
export function toneOf(function_: FunctionView): string {
  if (function_.blocks.length > 0) return "bg-[#4c4c4c]";
  switch (function_.kind) {
    case "event":
      return "bg-[#8a2a2a]";
    case "condition":
      return "bg-[#2e6b3e]";
    default:
      return "bg-[#7a5a20]";
  }
}

/** A top card's title bar. */
export function cardTone(kind: CardView["kind"]): string {
  switch (kind) {
    case "comment":
      return "bg-[#6a5f2e]";
    case "variable":
      return "bg-[#5a4378]";
    case "script":
    case "custom":
      return "bg-[#2e6b6b]";
    case "category":
      return "bg-[#3a3a3a]";
    default:
      return "bg-[#3c4450]";
  }
}

/** True when a function's sentence says something a card does not show otherwise. */
export function showsSentence(function_: FunctionView): boolean {
  return function_.blocks.length === 0 || function_.sentence.some((part) => part.parameter);
}
