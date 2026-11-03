/**
 * The user's own themes (Sven, 2026-11-02): the `.json` files in `.moonwell\themes\`, read when the page starts and again
 * whenever one is saved or deleted. A user theme with a shipped theme's id is shown in its place. A save that can't be
 * loaded (a half-written file) keeps the last version of that theme that loaded, and the problem is shown in Settings.
 */
import { onHomeChanged, openHome, writeHome } from "../home/home.ts";
import type { Problem } from "../home/jsonc.ts";
import { setPref } from "../prefs.svelte.ts";
import { parseTheme, type Theme, themeText } from "./format.ts";
import { shippedThemes } from "./shipped.ts";

/** What Settings shows of a theme file. */
export type ThemeFile = {
  /** `themes/<name>.json`, the file's place in the `.moonwell` folder. */
  file: string;
  id: string;
  /** True when the text could not be loaded as a theme: the last version that did load, if any, is still used. */
  refused: boolean;
  /** True when the file's theme is in use in place of the shipped theme with its id. */
  replaces: boolean;
  /** Why the file was refused, or what is wrong with a theme that loaded. */
  problems: Problem[];
};

type Entry = {
  file: string;
  id: string;
  /** The text last read; null for a file the app could not read. */
  text: string | null;
  /** The last version that loaded. */
  theme: Theme | null;
  refused: boolean;
  problems: Problem[];
};

const shippedIds = new Set(shippedThemes.map((each) => each.id));

// Windows names files without regard to case, so a file is told from another by its lower-case place.
const keyOf = (file: string): string => file.toLowerCase();

/** The theme id of a place in the folder: the file's name without `.json`. Undefined for any other place. */
function idOf(file: string): string | undefined {
  return /^themes\/([^/\\]+)\.json$/i.exec(file)?.[1];
}

let entries = $state.raw<Entry[]>([]);

/** The user's theme files, by id, for Settings. The list is the same one as it changes. */
export const themeFiles = $state<ThemeFile[]>([]);

function publish(next: Entry[]): void {
  entries = next.toSorted((a, b) => a.id.localeCompare(b.id));
  themeFiles.splice(
    0,
    themeFiles.length,
    ...entries.map((each) => ({
      file: each.file,
      id: each.id,
      refused: each.refused,
      replaces: each.theme !== null && shippedIds.has(each.id),
      problems: each.problems,
    })),
  );
}

function read(file: string, id: string, text: string, earlier: Theme | null): Entry {
  const { theme, problems } = parseTheme(id, text, "user");
  return theme === null
    ? { file, id, text, theme: earlier, refused: true, problems }
    : { file, id, text, theme, refused: false, problems };
}

/**
 * Takes the theme files the app read when the page started, as `homeBoot().themes`, and the places it could not read
 * (`unreadable`, any file of the folder). Whatever was loaded before goes.
 */
export function loadUserThemes(
  files: { file: string; text: string }[],
  unreadable: string[] = [],
): void {
  const next: Entry[] = [];
  for (const { file, text } of files) {
    const id = idOf(file);
    if (id !== undefined) next.push(read(file, id, text, null));
  }
  for (const file of unreadable) {
    const id = idOf(file);
    if (id === undefined) continue;
    next.push({
      file,
      id,
      text: null,
      theme: null,
      refused: true,
      problems: [{ code: "unreadable" }],
    });
  }
  publish(next);
}

/** Takes a theme file saved (`text`) or deleted (`null`) while the editor runs. Any other file is not a theme. */
export function themeChanged(file: string, text: string | null): void {
  const id = idOf(file);
  if (id === undefined) return;
  const earlier = entries.find((each) => keyOf(each.file) === keyOf(file));
  const others = entries.filter((each) => each !== earlier);
  if (text === null) {
    if (earlier) publish(others);
    return;
  }
  // The editor's own write comes back with the same text.
  if (earlier?.text === text) return;
  publish([...others, read(file, id, text, earlier?.id === id ? earlier.theme : null)]);
}

/** Follows the themes folder as theme files are saved or deleted. Gives the way to stop. */
export function watchThemes(): () => void {
  return onHomeChanged((change) => themeChanged(change.file, change.text));
}

/**
 * Every theme to choose from: the shipped ones, a user theme with the same id in the place of each, then the other user
 * themes. A file that could not be loaded gives none, unless an earlier version of it did. Follows the files' changes.
 */
export function allThemes(): Theme[] {
  const user = new Map<string, Theme>();
  for (const each of entries) if (each.theme) user.set(each.id, each.theme);
  return [
    ...shippedThemes.map((each) => user.get(each.id) ?? each),
    ...[...user.values()].filter((each) => !shippedIds.has(each.id)),
  ];
}

// The copies being written, so a second ask in the meantime doesn't take the same name.
const copying = new Set<string>();

/** A file name the folder takes: `[A-Za-z0-9][A-Za-z0-9 ._-]*`. */
const fileSafe = (id: string): string =>
  id.replace(/[^A-Za-z0-9 ._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "theme";

/**
 * Writes `theme` with every colour as a new file in the themes folder, `<id>-copy.json` (`-copy-2` and on while the name
 * is taken), named `<name> (copy)` (`<name> (copy 2)` and on, so no two copies share a name in the picker). Once it is
 * written the copy is a theme, is chosen and its file is opened. Gives the copy's id, or "" when it could not be written
 * (Settings says so, as it does when the file can't be opened).
 */
export async function copyTheme(theme: Theme): Promise<string> {
  const base = `${fileSafe(theme.id)}-copy`;
  const taken = new Set(
    [...entries.map((each) => each.id), ...shippedIds, ...copying].map((each) =>
      each.toLowerCase(),
    ),
  );
  let id = base;
  let number = 1;
  while (taken.has(id.toLowerCase())) id = `${base}-${++number}`;

  const file = `themes/${id}.json`;
  const name = number === 1 ? `${theme.name} (copy)` : `${theme.name} (copy ${number})`;
  const text = themeText({ name, type: theme.type, colors: theme.colors });
  copying.add(id);
  try {
    if (!(await writeHome(file, text))) return "";
  } finally {
    copying.delete(id);
  }
  themeChanged(file, text);
  setPref("theme", id);
  void openHome(file);
  return id;
}
