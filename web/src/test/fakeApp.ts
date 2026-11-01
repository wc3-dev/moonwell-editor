import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect } from "vitest";
import App from "../App.svelte";
import type { CurrentMap, FieldView, MapInfo, ObjectView, TreeEntry } from "../lib/api.ts";
import type { GameDataState } from "../lib/app/gameData.ts";
import { prefs, setPref } from "../lib/prefs.svelte.ts";
import { t } from "../lib/text.ts";

type Args = Record<string, unknown>;
type Listener = (event: { data: unknown }) => void;

/** An answer that makes the command fail, as the app's error replies do. */
export class Refusal {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

export const gameReady: GameDataState = {
  source: "C:/Warcraft III",
  loaded: true,
  error: null,
  version: 1,
  game: "2.0.4",
};

export const arena: MapInfo = {
  name: "Arena",
  path: "C:/Maps/Arena",
  archive: false,
  problems: [],
  counts: { unit: 1, item: 0, destructable: 0, doodad: 0, ability: 0, buff: 0, upgrade: 0 },
  options: null,
};

export const footmanEntry: TreeEntry = {
  id: "h000",
  baseId: "hfoo",
  name: "Footman",
  suffix: "",
  path: ["Custom"],
  changed: true,
};

export const knightEntry: TreeEntry = {
  id: "h001",
  baseId: "hkni",
  name: "Knight",
  suffix: "",
  path: ["Custom"],
  changed: false,
};

export function field(overrides: Partial<FieldView> & { id: string }): FieldView {
  return {
    label: overrides.id,
    category: "Text",
    sort: overrides.id,
    type: "string",
    choice: null,
    listOf: null,
    level: 0,
    value: "",
    base: "",
    changed: false,
    skin: false,
    warning: null,
    modes: null,
    ...overrides,
  };
}

export function unit(entry: TreeEntry, overrides: Partial<ObjectView> = {}): ObjectView {
  return {
    kind: "unit",
    id: entry.id,
    baseId: entry.baseId,
    name: entry.name,
    chain: [],
    levels: 0,
    readOnly: null,
    fields: [field({ id: "unam", label: "Name", value: entry.name, changed: entry.changed })],
    ...overrides,
  };
}

export const triggerAnswers = {
  triggerCatalog: { categories: [], types: [], presets: [], functions: [] },
  triggerTree: {
    readOnly: false,
    problem: null,
    headerComment: "",
    headerCode: "",
    references: [],
    language: "jass",
    variables: [],
    items: [
      { id: 0, parent: -1, kind: "root", name: "Arena", enabled: true, expanded: true, ref: "" },
      { id: 1, parent: 0, kind: "category", name: "Setup", enabled: true, expanded: true, ref: "" },
      { id: 2, parent: 1, kind: "trigger", name: "Start", enabled: true, expanded: true, ref: "" },
    ],
  },
  triggerCards: [],
};

export const scriptAnswers = {
  ...triggerAnswers,
  triggerTree: {
    ...triggerAnswers.triggerTree,
    items: [
      ...triggerAnswers.triggerTree.items,
      { id: 3, parent: 1, kind: "custom", name: "Spell", enabled: true, expanded: true, ref: "" },
    ],
  },
  trigger: { code: "function x" },
};

const started = {
  ping: "pong",
  windowState: { maximized: false },
  gameData: gameReady,
  choices: {},
  assetNames: {},
  startup: { map: null },
  about: { version: "1.2.3", moonwell: "0.4.0", dotNet: "10.0", webView2: null },
  currentMap: null,
};

let latest: FakeApp | undefined;

/** The C# side of the bridge: it answers each command from `answers` and keeps what was asked. */
export class FakeApp {
  readonly log: { command: string; args: Args }[] = [];
  readonly #listeners = new Set<Listener>();
  readonly answers: Record<string, unknown>;

  constructor(answers: Record<string, unknown> = {}) {
    this.answers = { ...started, ...answers };
    latest = this;
    window.chrome = {
      webview: {
        postMessage: (text) => this.#receive(text),
        addEventListener: (_, listener) => this.#listeners.add(listener),
        removeEventListener: (_, listener) => this.#listeners.delete(listener),
      },
    };
  }

  /** How often a command was asked for. */
  count(command: string): number {
    return this.log.filter((each) => each.command === command).length;
  }

  /** The arguments of the last ask of a command. */
  args(command: string): Args | undefined {
    return this.log.findLast((each) => each.command === command)?.args;
  }

  /** Waits until nothing has been asked for a moment, so a page taken away is done before the next test starts. */
  async idle(): Promise<void> {
    let seen = -1;
    while (seen !== this.log.length) {
      seen = this.log.length;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  /** Sends an event, as the app does. */
  async emit(event: string, payload: unknown = null): Promise<void> {
    this.#send({ event, payload });
    await tick();
  }

  #receive(text: string): void {
    const { id, command, args } = JSON.parse(text);
    this.log.push({ command, args });
    const found = this.answers[command];
    const answer = typeof found === "function" ? found(args) : found;
    setTimeout(async () => {
      const settled = await answer;
      this.#send(
        settled instanceof Refusal
          ? { id, ok: false, error: { code: settled.code, message: settled.message } }
          : { id, ok: true, result: settled ?? null },
      );
    });
  }

  #send(message: unknown): void {
    for (const listener of this.#listeners) listener({ data: JSON.stringify(message) });
  }
}

class NoResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Prepares the tests of a file for mounting `App`, in what the test browser lacks and a clean set of switches. */
export function appTests(): void {
  const pristine = { ...prefs };

  beforeEach(() => {
    globalThis.ResizeObserver = NoResizeObserver;
    Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 600,
    });
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    localStorage.clear();
    setPref("alphaNotice", false);
  });

  afterEach(async () => {
    cleanup();
    await latest?.idle();
    delete window.chrome;
    for (const [key, value] of Object.entries(pristine)) {
      setPref(key as keyof typeof pristine, value as never);
    }
  });
}

/** An answer that comes when the test says so. */
export function later<T>(value: T): { answer: Promise<T>; release: () => void } {
  let release = () => {};
  const answer = new Promise<T>((resolve) => {
    release = () => resolve(value);
  });
  return { answer, release };
}

/** Mounts the page against an app that has a map open, on the Object Editor. */
export async function openApp(
  answers: Record<string, unknown> = {},
  current: CurrentMap = { map: arena, session: { dirty: false, changedObjects: 0 } },
): Promise<FakeApp> {
  const app = new FakeApp({
    currentMap: current,
    tree: ({ kind }: Args) => (kind === "unit" ? [footmanEntry, knightEntry] : []),
    object: ({ id }: Args) => unit(id === knightEntry.id ? knightEntry : footmanEntry),
    ...answers,
  });
  render(App);
  await waitFor(() => expect(app.count("tree")).toBeGreaterThan(0));
  await fireEvent.click(screen.getByRole("button", { name: t("header.objectEditor") }));
  return app;
}

/** Clicks an object's row in the tree and waits for its details. */
export async function showObject(name: string | RegExp): Promise<void> {
  await fireEvent.click(await screen.findByRole("treeitem", { name }));
  await screen.findByRole("textbox", { name: t("details.filterLabel") });
}

/** Opens the script in `scriptAnswers` from the Trigger Editor, which is how the Script Editor is reached. */
export async function openSpell(): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: t("header.triggerEditor") }));
  await fireEvent.dblClick(await screen.findByRole("treeitem", { name: /Spell/ }));
  await screen.findByRole("button", { name: t("scripts.close", { name: "Spell" }) });
}

/** Presses a key on what has the focus, as the window sees it. */
export function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): Promise<boolean> {
  return fireEvent.keyDown(document.activeElement ?? document.body, { key, ...modifiers });
}
