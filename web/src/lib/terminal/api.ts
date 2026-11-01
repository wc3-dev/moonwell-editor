/** The app's side of the terminal panel: the shells on this PC, and the running ones by id. */
import { call, on, tell } from "../bridge.ts";

/** A shell the panel can run. */
export type Shell = { id: string; name: string; path: string; arguments: string };

/** A shell that started: its id, which shell it is and its name. */
export type StartedTerminal = { id: number; shell: string; name: string };

/** The shells on this PC, the default first. */
export function terminalShells(): Promise<Shell[]> {
  return call<Shell[]>("terminalShells");
}

/** Starts a shell in the map's folder; a `shell` no longer on this PC, or "", runs the default. */
export function startTerminal(
  shell: string,
  columns: number,
  rows: number,
): Promise<StartedTerminal> {
  return call<StartedTerminal>("terminalStart", { shell, columns, rows });
}

/** Sends what was typed to a shell. It has no answer, so a stream of keys never shows as the app working. */
export function writeTerminal(id: number, text: string): void {
  tell("terminalWrite", { id, text });
}

/** Tells a shell its new size. */
export function resizeTerminal(id: number, columns: number, rows: number): void {
  tell("terminalResize", { id, columns, rows });
}

/** Ends a shell. */
export function closeTerminal(id: number): void {
  tell("terminalClose", { id });
}

/** Listens for what shells print. Returns a function that stops listening. */
export function onTerminalOutput(handler: (id: number, text: string) => void): () => void {
  return on("terminalOutput", (payload) => {
    const { id, text } = payload as { id: number; text: string };
    handler(id, text);
  });
}

/** Listens for shells that end. Returns a function that stops listening. */
export function onTerminalExit(handler: (id: number) => void): () => void {
  return on("terminalExit", (payload) => handler((payload as { id: number }).id));
}
