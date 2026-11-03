/**
 * The page's side of the `.moonwell` folder (Sven, 2026-11-02). The page cannot touch the disk: the app reads the files
 * for it before it paints (`https://game.moonwelleditor/home.js` sets `window.moonwellHome`), writes what it sends, and
 * says when a file changed.
 */

import type { HomeBoot, HomeChange } from "../bridge.gen.ts";
import { call, on } from "../bridge.ts";
import { errorText } from "../errors.ts";
import { t } from "../text.ts";
import { homeNotice } from "./notice.svelte.ts";

export type { HomeBoot } from "../bridge.gen.ts";
export { homeNotice };

declare global {
  interface Window {
    moonwellHome?: HomeBoot;
  }
}

const emptyBoot: HomeBoot = {
  folder: "",
  settings: null,
  hotkeys: null,
  state: null,
  themes: [],
  legacy: null,
  unreadable: [],
};

/** What the app read from the folder, or an empty folder when the page is not in the app's window. */
export function homeBoot(): HomeBoot {
  return globalThis.window?.moonwellHome ?? emptyBoot;
}

/** Tells Settings about a write that failed, the first time. */
function notSaved(error: unknown): void {
  if (homeNotice.text === "") homeNotice.text = t("home.notSaved", { error: errorText(error) });
}

/** Tells Settings about a file or folder that could not be opened, the first time. */
function notOpened(file: string | undefined, error: unknown): void {
  if (homeNotice.text !== "") return;
  const where = file === undefined ? ".moonwell" : `.moonwell/${file}`;
  homeNotice.text = t("home.notOpened", { where, error: errorText(error) });
}

/**
 * Writes one of the files the page owns: `settings.json`, `hotkeys.json`, `themes/<name>.json` or
 * `schemas/<name>.schema.json`. A write that fails sets `homeNotice` and still answers, `false`: the page goes on with
 * what it has. A write that went through answers `true`.
 */
export async function writeHome(file: string, text: string): Promise<boolean> {
  try {
    await call("writeHome", { file, text });
    return true;
  } catch (error) {
    notSaved(error);
    return false;
  }
}

/**
 * Keeps one value of `state.json`, which is the editor's own. As `writeHome` does, it answers `false` after a failure
 * (a `homeNotice` then) and `true` when it went through, and never rejects.
 */
export async function keepState(key: string, value: unknown): Promise<boolean> {
  try {
    await call("setState", { key, value });
    return true;
  } catch (error) {
    notSaved(error);
    return false;
  }
}

/**
 * Opens the folder, or one of its files or folders (`themes`), in the shell. As `writeHome` does, it answers `false`
 * after a failure (a `homeNotice` then; there may be no program for a `.json` file) and `true` when it went through, and
 * never rejects.
 */
export async function openHome(file?: string): Promise<boolean> {
  try {
    await call("openHome", file === undefined ? {} : { file });
    return true;
  } catch (error) {
    notOpened(file, error);
    return false;
  }
}

/**
 * Listens to `homeChanged`: a file was saved or deleted (`text` is null then), by the editor itself or another program.
 * The editor's own writes come back too. Returns a function that stops listening.
 */
export function onHomeChanged(handler: (change: HomeChange) => void): () => void {
  return on("homeChanged", handler);
}

const schemas = import.meta.glob<string>("./schemas/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Writes the schemas of the page's files into the folder's `schemas`, so they match this version. */
export function writeSchemas(): void {
  for (const [path, text] of Object.entries(schemas)) {
    void writeHome(`schemas/${path.slice(path.lastIndexOf("/") + 1)}`, text);
  }
}
