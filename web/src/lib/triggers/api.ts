/**
 * The trigger editor's commands. The types of what they take and answer are generated from the C# records into
 * `bridge.gen.ts`; the ones other files use are passed on from here.
 */

import type {
  CardMove,
  CardView,
  FunctionKind,
  FunctionPasteArgs,
  ParameterKind,
  TriggerCatalogView,
  TriggerItemKind,
  TriggerOptionsArgs,
  TriggerTreeView,
  TriggerView,
  VariableSetArgs,
} from "../bridge.gen.ts";
import { call } from "../bridge.ts";

export type {
  BlockView,
  CardMove,
  CardPlace,
  CardView,
  CatalogCategory,
  CatalogFunction,
  CatalogPreset,
  CatalogType,
  FunctionKind,
  FunctionView,
  MapReference,
  ParameterKind,
  ParameterView,
  SentencePart,
  TextPart,
  TriggerCatalogView,
  TriggerTreeItem,
  TriggerTreeView,
  TriggerView,
  VariableView,
} from "../bridge.gen.ts";

/** What an item of the trigger tree is. */
export type TreeKind = TriggerItemKind;

/** The fields of a new or changed variable. */
export type VariableInput = Required<Omit<VariableSetArgs, "id">>;

/** A trigger's options to change; each left out stays as it is. */
export type TriggerOptions = Omit<TriggerOptionsArgs, "id">;

/** Where a new or copied function goes: a trigger's list, or a block of the function at `parent`. */
export type FunctionSlot = Omit<FunctionPasteArgs, "id">;

export function triggerCatalog(): Promise<TriggerCatalogView> {
  return call("triggerCatalog");
}

export function triggerTree(): Promise<TriggerTreeView> {
  return call("triggerTree");
}

export function trigger(id: number): Promise<TriggerView> {
  return call("trigger", { id });
}

/** Adds an item to a category; its id. */
export async function addItem(kind: TreeKind, parent: number): Promise<number> {
  return (await call("triggerAdd", { kind, parent })).id;
}

export async function renameItem(id: number, name: string): Promise<void> {
  await call("triggerRename", { id, name });
}

export async function setOptions(id: number, options: TriggerOptions): Promise<void> {
  await call("triggerOptions", { id, ...options });
}

export async function setCode(id: number, code: string): Promise<void> {
  await call("triggerCode", { id, code });
}

export async function setHeader(comment: string, code: string): Promise<void> {
  await call("triggerHeader", { comment, code });
}

export async function deleteItem(id: number): Promise<void> {
  await call("triggerDelete", { id });
}

export async function moveItem(id: number, parent: number, index: number): Promise<void> {
  await call("triggerMove", { id, parent, index });
}

/** Adds a variable to a category; its id. */
export async function addVariable(variable: VariableInput, parent: number): Promise<number> {
  return (await call("triggerVariableAdd", { ...variable, parent })).id;
}

export async function setVariable(id: number, variable: VariableInput): Promise<void> {
  await call("triggerVariableSet", { id, ...variable });
}

export async function addFunction(
  id: number,
  place: FunctionSlot,
  kind: FunctionKind,
  name: string,
): Promise<string> {
  return (await call("triggerFunctionAdd", { id, ...place, kind, name })).path;
}

/** Keeps a copy of a function in the app, for `pasteFunction`. */
export async function copyFunction(id: number, path: string): Promise<void> {
  await call("triggerFunctionCopy", { id, path });
}

export async function pasteFunction(id: number, place: FunctionSlot): Promise<string> {
  return (await call("triggerFunctionPaste", { id, ...place })).path;
}

export async function changeFunction(id: number, path: string, name: string): Promise<void> {
  await call("triggerFunctionChange", { id, path, name });
}

export async function deleteFunction(id: number, path: string): Promise<void> {
  await call("triggerFunctionDelete", { id, path });
}

export async function enableFunction(id: number, path: string, enabled: boolean): Promise<void> {
  await call("triggerFunctionEnable", { id, path, enabled });
}

/** Moves a function to a place of the same or another trigger, counted with it taken out. */
export async function moveFunction(
  from: number,
  path: string,
  id: number,
  place: FunctionSlot,
): Promise<void> {
  await call("triggerFunctionMove", { from, path, id, ...place });
}

export function triggerCards(parent: number): Promise<CardView[]> {
  return call("triggerCards", { parent });
}

export async function setPlaces(places: CardMove[]): Promise<void> {
  await call("triggerPlaces", { places });
}

/** Folds or unfolds a card, keeping `places` for the whole grid. */
export async function setFolded(id: number, folded: boolean, places: CardMove[]): Promise<void> {
  await call("triggerFolded", { id, folded, places });
}

export async function setParameter(
  id: number,
  path: string,
  kind: ParameterKind,
  value: string,
): Promise<void> {
  await call("triggerParameter", { id, path, kind, value });
}
