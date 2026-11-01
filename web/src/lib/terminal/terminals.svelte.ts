import type { Notices } from "../app/notices.svelte.ts";
import { errorText } from "../errors.ts";
import { prefs } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import {
  closeTerminal,
  onTerminalExit,
  onTerminalOutput,
  type Shell,
  startTerminal,
} from "./api.ts";

/** One tab of the panel: `id` is its shell's, once that has started. */
export type TerminalTab = { key: number; shell: string; name: string; id: number | null };

type Needs = { notices: Notices };

/**
 * The terminal panel (Sven, 2026-11-01): its tabs, each a shell that keeps running while the panel is hidden. A tab
 * starts its shell once it has been measured, so the shell starts at the size it shows at.
 */
export class Terminals {
  open = $state(false);
  tabs = $state<TerminalTab[]>([]);
  /** The key of the tab shown. */
  active = $state<number | null>(null);
  /** The shells on this PC, once asked for. */
  shells = $state.raw<Shell[]>([]);
  /** Grows each time the cursor should go to the tab shown. */
  focusAsked = $state(0);

  readonly #notices: Notices;
  readonly #writers = new Map<number, (text: string) => void>();
  // What a shell printed before its tab knew its id.
  readonly #early = new Map<number, string[]>();
  #nextKey = 1;

  constructor({ notices }: Needs) {
    this.#notices = notices;
  }

  /** Follows the shells' events. Returns a function that stops. */
  listen(): () => void {
    const stops = [
      onTerminalOutput((id, text) => this.#printed(id, text)),
      onTerminalExit((id) => this.#ended(id)),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }

  toggle = (): void => {
    if (this.tabs.length === 0) {
      this.add();
      return;
    }
    this.open = !this.open;
    if (this.open) this.focusAsked++;
  };

  /** Opens a new tab; its shell is the default one unless one is named. */
  add = (shell: string = prefs.terminalShell): void => {
    const key = this.#nextKey++;
    this.tabs.push({ key, shell, name: "", id: null });
    this.active = key;
    this.open = true;
    this.focusAsked++;
  };

  show = (key: number): void => {
    this.active = key;
    this.focusAsked++;
  };

  /** Starts a tab's shell at the size its tab measured, and sends what it prints to `write`. */
  start = async (
    key: number,
    size: { columns: number; rows: number },
    write: (text: string) => void,
  ): Promise<void> => {
    const tab = this.#tab(key);
    if (!tab) return;
    try {
      const started = await startTerminal(tab.shell, size.columns, size.rows);
      tab.id = started.id;
      tab.name = started.name;
      this.#writers.set(started.id, write);
      for (const text of this.#early.get(started.id) ?? []) write(text);
      this.#early.delete(started.id);
    } catch (error) {
      this.#notices.say(t("terminal.failed", { error: errorText(error) }), { warn: true });
      this.#remove(key);
    }
  };

  /** Closes a tab and ends its shell. */
  close = (key: number): void => {
    const id = this.#tab(key)?.id ?? null;
    if (id !== null) {
      this.#writers.delete(id);
      closeTerminal(id);
    }
    this.#remove(key);
  };

  /** Another map was opened: if terminals are in use, a new one starts there; the running ones are left alone. */
  mapChanged(): void {
    if (this.tabs.length > 0) this.add();
  }

  #tab(key: number): TerminalTab | undefined {
    return this.tabs.find((each) => each.key === key);
  }

  #printed(id: number, text: string): void {
    const write = this.#writers.get(id);
    if (write) write(text);
    else this.#early.set(id, [...(this.#early.get(id) ?? []), text]);
  }

  #ended(id: number): void {
    this.#writers.delete(id);
    this.#early.delete(id);
    const tab = this.tabs.find((each) => each.id === id);
    if (tab) this.#remove(tab.key);
  }

  #remove(key: number): void {
    const at = this.tabs.findIndex((each) => each.key === key);
    if (at < 0) return;
    this.tabs.splice(at, 1);
    if (this.active === key) {
      this.active = (this.tabs[at] ?? this.tabs[at - 1])?.key ?? null;
      this.focusAsked++;
    }
    if (this.tabs.length === 0) this.open = false;
  }
}
