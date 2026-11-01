/**
 * Pick mode: the trigger editor asks the map for one kind of thing (a unit, a region, a point ...); the map view
 * shows, a click on that kind answers, Esc answers null. An ask that comes while another waits answers the first null.
 */
import type { Pick, PickKind } from "./picking.ts";

/** What the map is asked for: `kind` null when nothing is. */
export const picking = $state<{ kind: PickKind | null }>({ kind: null });

let waiting: ((pick: Pick | null) => void) | null = null;

/** Asks the map for a thing of `kind`; resolves with the click, or null when cancelled. */
export function pickOnMap(kind: PickKind): Promise<Pick | null> {
  answer(null);
  picking.kind = kind;
  return new Promise((resolve) => {
    waiting = resolve;
  });
}

/** Answers the ask waiting, if any: the pick, or null to cancel. */
export function answer(pick: Pick | null): void {
  const resolve = waiting;
  waiting = null;
  picking.kind = null;
  resolve?.(pick);
}
