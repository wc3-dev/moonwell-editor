import type { GameDataState } from "../bridge.gen.ts";
import { call } from "../bridge.ts";

export type { GameDataState } from "../bridge.gen.ts";

/** What the welcome screen or the status bar should say about the game data. */
export type GameDataView = "missing" | "loading" | "failed" | "ready";

/** Asks the app where the game data stands. */
export function gameData(): Promise<GameDataState> {
  return call("gameData");
}

/** Opens the app's folder dialog for the Warcraft III folder; the app loads it and answers with the new state. */
export function chooseGameData(): Promise<GameDataState> {
  return call("chooseGameData");
}

/**
 * The state to keep: `next`, unless it is older than `current`. A reply can be on its way while a newer event comes
 * (a "loading" answer after the "loaded" event), and must not undo it.
 */
export function newer(current: GameDataState | null, next: GameDataState): GameDataState {
  return current && next.version < current.version ? current : next;
}

/** Sorts a state into the one thing the page shows. */
export function viewOf(state: GameDataState): GameDataView {
  if (state.loaded) return "ready";
  if (state.error) return "failed";
  return state.source ? "loading" : "missing";
}
