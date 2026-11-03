import { writeHome } from "./home.ts";
import { type Problem, parseObject } from "./jsonc.ts";

/** What `HomeFile.take` made of a text. */
export type Taken =
  /** The page's own write coming back: there is nothing new in it. */
  | { kind: "own" }
  /** A file that can't be read: what the page has stays as it is, and the file is not written to. */
  | { kind: "broken"; problems: Problem[] }
  /** The file's object, empty for a file that is not there or has nothing in it. */
  | { kind: "read"; root: Record<string, unknown> };

/**
 * A file in the `.moonwell` folder that people edit by hand, as `settings.json` and `hotkeys.json` are (Sven,
 * 2026-11-02), and the rules the page follows for it. It keeps the file's latest text, which a change made in the page is
 * edited into (so the file's comments and order stay) and written. It does not write to a file it could not read, so a
 * person's half-saved edit is never written over, until a text that reads arrives. The page's own writes coming back from
 * the app's watcher, however late, are told apart from a change made elsewhere.
 */
export class HomeFile {
  /** What is wrong with the file, shown in Settings while it is. A list that stays the same one. */
  readonly problems = $state<Problem[]>([]);

  readonly #file: string;
  readonly #starter: string;
  // The latest text, null while there is no file; whether it may be written to; the texts the page wrote and has not
  // heard come back yet, oldest first.
  #text: string | null = null;
  #writable = true;
  #ours: string[] = [];

  /** `file` is the file's place in the folder; `starter` the text a new file begins with. */
  constructor(file: string, starter: string) {
    this.#file = file;
    this.#starter = starter;
  }

  /** The latest text of the file; null while there is none. */
  get text(): string | null {
    return this.#text;
  }

  /** Shows `problems` for the file. */
  show(problems: Problem[]): void {
    this.problems.splice(0, this.problems.length, ...problems);
  }

  /**
   * Takes a text that came at start or in `homeChanged`. `null` is a file that is not there, and `unreadable` one the app
   * could not read. A broken file shows its problems, and no write is made until a text that reads is taken; one that
   * reads is the latest text, and its problems are the caller's to `show`.
   */
  take(text: string | null, unreadable = false): Taken {
    const echo = unreadable || text === null ? -1 : this.#ours.indexOf(text);
    if (echo >= 0) {
      // The write's echo, or a later one that came first when the watcher joined the writes before it.
      this.#ours.splice(0, echo + 1);
      return { kind: "own" };
    }
    this.#ours = [];
    if (unreadable) return this.#broken([{ code: "unreadable" }]);

    const { root, problems } = parseObject(text);
    if (problems.length > 0) return this.#broken(problems);
    this.#text = text;
    this.#writable = true;
    return { kind: "read", root };
  }

  /**
   * Changes the latest text (the starter text while there is no file) with `change`, and writes it. Nothing is written
   * when the file can't be read or `change` leaves the text as it is. A write that fails is still the latest text.
   */
  edit(change: (text: string) => string): void {
    if (!this.#writable) return;
    const base = this.#text ?? this.#starter;
    const next = change(base);
    if (next === base) return;
    this.#text = next;
    this.#ours.push(next);
    void writeHome(this.#file, next);
  }

  #broken(problems: Problem[]): Taken {
    this.#writable = false;
    this.show(problems);
    return { kind: "broken", problems };
  }
}
