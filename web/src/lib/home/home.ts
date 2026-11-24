/**
 * The page's side of the `.moonwell` folder (Sven, 2026-11-02). The page cannot touch the disk: the app reads the files
 * for it before it paints (`https://game.moonwelleditor/home.js` sets `window.moonwellHome`), writes what it sends, and
 * says when a file changed.
 */

import type { HomeBoot, HomeChange } from "../bridge.gen.ts";
import { call, on } from "../bridge.ts";
import { errorText } from "../errors.ts";
import { t } from "../text.ts";
import { failed, homeNotice, succeeded } from "./notice.svelte.ts";

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

/** Tells Settings about a write of `file` that failed. */
function notSaved(file: string, error: unknown): void {
  failed(`write:${file}`, t("home.notSaved", { error: errorText(error) }));
}

/** The folder, or one of its files or folders, as a notice names it. */
const placeOf = (file: string | undefined) =>
  file === undefined ? ".moonwell" : `.moonwell/${file}`;

/** Tells Settings about a file or folder that could not be opened. */
function notOpened(file: string | undefined, error: unknown): void {
  const where = placeOf(file);
  failed(`open:${where}`, t("home.notOpened", { where, error: errorText(error) }));
}

/**
 * Writes one of the files the page owns: `settings.json`, `hotkeys.json`, `themes/<name>.json` or
 * `schemas/<name>.schema.json`. A write that fails sets `homeNotice` and still answers, `false`: the page goes on with
 * what it has. A write that went through answers `true`, and takes away the notice of that file's failed write.
 */
export async function writeHome(file: string, text: string): Promise<boolean> {
  try {
    await call("writeHome", { file, text });
    succeeded(`write:${file}`);
    return true;
  } catch (error) {
    notSaved(file, error);
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
    succeeded("write:state.json");
    return true;
  } catch (error) {
    notSaved("state.json", error);
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
    succeeded(`open:${placeOf(file)}`);
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
