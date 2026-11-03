/**
 * What the editor remembers on its own, kept in `state.json` in the `.moonwell` folder (Sven, 2026-11-02): the terminal
 * panel's height, the favourite fields, the tooltip editor's own colours and the Table view's columns. The file is the
 * editor's, not the user's, so a value is sent to the app as it changes and the page never edits the text. The recent
 * maps are in it too, but the app writes those itself.
 */
import type { Store } from "../objects/table.ts";
import { keepState } from "./home.ts";
import { parseObject } from "./jsonc.ts";

let memory = $state.raw<Record<string, unknown>>({});

/** Takes the text of `state.json`. `null`, or a text that is not a JSON object, holds nothing. */
export function loadState(text: string | null): void {
  memory = parseObject(text).root;
}

/** What was kept under `key`, or `fallback` when there is nothing, or what there is does not `fit`. */
export function stateOf<T>(key: string, fallback: T, fits: (value: unknown) => value is T): T {
  const value = memory[key];
  return fits(value) ? value : fallback;
}

/** Keeps `value` under `key`: here at once, and in `state.json` through the app. */
export function setState(key: string, value: unknown): void {
  memory = { ...memory, [key]: value };
  void keepState(key, value);
}

/** The state as a `Store` of JSON texts, which is how the Table view keeps its columns. */
export const stateStore: Store = {
  getItem: (key) => (memory[key] === undefined ? null : JSON.stringify(memory[key])),
  setItem(key, text) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return; // Not JSON: nothing to keep.
    }
    setState(key, value);
  },
};
