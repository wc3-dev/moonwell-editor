// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeApp, later, Refusal } from "../../test/fakeApp.ts";
import { fakeLayout } from "../../test/fakeLayout.ts";
import { CommandQueue } from "../app/commandQueue.ts";
import { t } from "../text.ts";
import type {
  CardView,
  FunctionView,
  TriggerTreeItem,
  TriggerTreeView,
  TriggerView,
} from "./api.ts";
import TriggerEditor from "./TriggerEditor.svelte";

const item = (
  id: number,
  parent: number,
  kind: TriggerTreeItem["kind"],
  name: string,
): TriggerTreeItem => ({
  id,
  parent,
  kind,
  name,
  enabled: true,
  expanded: true,
  ref: "",
});

const tree: TriggerTreeView = {
  items: [
    item(0, -1, "root", "Arena"),
    item(1, 0, "category", "Setup"),
    item(2, 1, "trigger", "Start"),
    item(3, 1, "custom", "Spell"),
    item(4, 1, "comment", "Note"),
    item(5, 1, "variable", "Count"),
    item(6, 0, "category", "Other"),
    item(7, 6, "trigger", "Old"),
  ],
  variables: [
    { id: 5, name: "Variable_001", type: "integer", isArray: false, size: 1, initial: "" },
  ],
  readOnly: false,
  problem: null,
  headerComment: "Top",
  headerCode: "// head",
  references: [],
  language: "jass",
};

const action = (path: string, title: string): FunctionView => ({
  path,
  name: title,
  title,
  kind: "action",
  category: "Unit",
  enabled: true,
  branch: null,
  prefix: "",
  sentence: [{ text: title, parameter: null }],
  blocks: [],
});

const trigger: TriggerView = {
  id: 2,
  kind: "trigger",
  name: "Start",
  description: "",
  enabled: true,
  initiallyOn: true,
  runOnInit: false,
  events: [],
  conditions: [],
  actions: [action("0", "Create Unit"), action("1", "Kill Unit")],
  code: null,
};

const card = (
  id: number,
  name: string,
  kind: CardView["kind"],
  view: TriggerView | null,
): CardView => ({
  id,
  kind,
  name,
  place: { x: 0, y: 0, folded: false },
  trigger: view,
  variable: null,
  count: 0,
});

const script: TriggerView = {
  ...trigger,
  id: 3,
  kind: "custom",
  name: "Spell",
  actions: [],
  code: "",
};

const cards = [card(2, "Start", "trigger", trigger), card(3, "Spell", "custom", script)];

const catalog = {
  categories: [{ key: "Unit", title: "Unit", icon: "", shown: true }],
  types: [],
  presets: [],
  functions: [
    {
      name: "CreateUnit",
      kind: "action",
      category: "Unit",
      title: "Create Unit",
      sentence: [],
      arguments: [],
      defaults: [],
      returns: null,
      inEvents: false,
      version: 0,
      hint: "",
    },
  ],
};

const answers = {
  triggerCatalog: catalog,
  triggerTree: tree,
  triggerCards: cards,
  trigger,
  triggerAdd: { id: 9 },
  triggerVariableAdd: { id: 9 },
  triggerFunctionAdd: { path: "2" },
  triggerFunctionPaste: { path: "2" },
};

const notices: [string, boolean | undefined][] = [];
const scripts: unknown[] = [];
let deleted = 0;

beforeEach(() => {
  fakeLayout();
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.setPointerCapture = () => {};
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
  notices.length = 0;
  scripts.length = 0;
  deleted = 0;
});

afterEach(async () => {
  cleanup();
  delete window.chrome;
});

async function open(more: Record<string, unknown> = {}): Promise<FakeApp> {
  const app = new FakeApp({ ...answers, ...more });
  render(TriggerEditor, {
    mode: "de",
    queued: new CommandQueue().run,
    onnotice: (text: string, warn?: boolean) => notices.push([text, warn]),
    onscript: (each: unknown) => scripts.push(each),
    ondeleted: () => deleted++,
  });
  await screen.findByRole("treeitem", { name: /Start/ });
  return app;
}

const row = (name: RegExp) => screen.findByRole("treeitem", { name });
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

async function showCards(app: FakeApp): Promise<void> {
  await fireEvent.click(await row(/Start/));
  await waitFor(() => expect(app.count("triggerCards")).toBeGreaterThan(0));
  await screen.findByTitle("Kill Unit");
}

async function chooseFromMenu(name: string | RegExp): Promise<void> {
  await fireEvent.click(await screen.findByRole("menuitem", { name }));
}

const functionOf = (title: string) => screen.getByRole("group", { name: title });

function sized(element: Element, height: number): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, height));
}

function drag(element: Element, type: string, clientY = 0): Promise<boolean> {
  return fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
}

type Point = [number, number];
type EventName =
  | "pointerDown"
  | "pointerMove"
  | "pointerUp"
  | "mouseDown"
  | "mouseMove"
  | "mouseUp";

/**
 * Sends an event with the window as its view, where a drag goes on. jsdom refuses Vitest's window in the event's
 * options, so the view is set after.
 */
function send(
  name: EventName | "click" | "contextMenu" | "dblClick" | "wheel",
  target: Element,
  options: Record<string, unknown>,
): Promise<boolean> {
  const event = createEvent[name](target, { bubbles: true, cancelable: true, ...options });
  Object.defineProperty(event, "view", { value: window });
  return fireEvent(target, event);
}

/**
 * A press of `button` at `from`, moved to `to` and let go, with the events a browser sends for it, and a moment after.
 * The mouse moves 5 pixels first, as a real one passes a drag's threshold a pixel or two at a time.
 */
async function press(
  target: Element,
  button: number,
  from: Point,
  to: Point = from,
): Promise<void> {
  const at = ([clientX, clientY]: Point, held = true) => ({
    button,
    buttons: held ? [1, 4, 2][button] : 0,
    clientX,
    clientY,
    pointerId: 1,
  });
  await send("pointerDown", target, at(from));
  await send("mouseDown", target, at(from));
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length > 0) {
    const along = (part: number): Point => [
      from[0] + (to[0] - from[0]) * part,
      from[1] + (to[1] - from[1]) * part,
    ];
    for (const point of [along(Math.min(1, 5 / length)), along(0.5), to]) {
      await send("pointerMove", target, at(point));
      await send("mouseMove", target, at(point));
    }
  }
  await send("pointerUp", target, at(to, false));
  await send("mouseUp", target, at(to, false));
  if (button === 0) await send("click", target, at(to, false));
  if (button === 2) await send("contextMenu", target, at(to, false));
  // A pan swallows clicks until its timer clears: a person's next click comes later.
  await settled();
}

const wheel = (target: Element, deltaY: number, [clientX, clientY]: Point) =>
  send("wheel", target, { deltaY, clientX, clientY });

const canvas = () => screen.getByTestId("trigger-canvas");
const emptyGrid = () => canvas().querySelector(".svelte-flow__pane") as Element;

/** Where the grid's origin is on screen, and its scale. */
function viewOf(): { x: number; y: number; scale: number } {
  for (const element of canvas().querySelectorAll<HTMLElement>("*")) {
    const found = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      element.style.transform,
    );
    if (found) return { x: Number(found[1]), y: Number(found[2]), scale: Number(found[3]) };
  }
  throw new Error("The grid shows no view.");
}

/** Where a card stands on the grid. */
function placeOf(name: string): Point {
  let element: HTMLElement | null = screen.getByRole("group", { name });
  for (; element; element = element.parentElement) {
    const found = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(element.style.transform);
    if (found) return [Number(found[1]), Number(found[2])];
  }
  throw new Error(`${name} has no place.`);
}

const titleOf = (name: string) => within(screen.getByRole("group", { name })).getByText(name);

describe("the tree", () => {
  test("the map's header is selected at first, with its script", async () => {
    await open();
    await screen.findByRole("heading", { name: t("triggers.mapHeader") });
  });

  test("selecting a trigger shows its category's cards", async () => {
    const app = await open();
    await showCards(app);
    expect(app.args("triggerCards")).toEqual({ parent: 1 });
  });

  test("selecting something in the same category asks for no new cards", async () => {
    const app = await open();
    await showCards(app);
    const asked = app.count("triggerCards");
    await fireEvent.click(await row(/Note/));
    await settled();
    expect(app.count("triggerCards")).toBe(asked);
  });

  test("a category's arrow folds it without selecting", async () => {
    await open();
    await fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Start/ })).toBeNull());
  });

  test("the filter keeps what matches", async () => {
    await open();
    await fireEvent.input(screen.getByRole("textbox", { name: t("triggers.filter") }), {
      target: { value: "Old" },
    });
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Start/ })).toBeNull());
    await row(/Old/);
  });

  test("what was selected and is gone falls back to its category", async () => {
    const app = await open();
    await showCards(app);
    app.answers.triggerTree = { ...tree, items: tree.items.filter((each) => each.id !== 2) };
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.comment") }));
    await waitFor(async () =>
      expect((await row(/Setup/)).getAttribute("aria-selected")).toBe("true"),
    );
    screen.getByTestId("trigger-canvas");
  });
});

describe("adding", () => {
  test("a new item goes in the category selected", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.trigger") }));
    await waitFor(() => expect(app.args("triggerAdd")).toEqual({ kind: "trigger", parent: 1 }));
  });

  test("with the header selected it goes at the top", async () => {
    const app = await open();
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.category") }));
    await waitFor(() => expect(app.args("triggerAdd")).toEqual({ kind: "category", parent: 0 }));
  });

  test("a new variable takes the next free number", async () => {
    const app = await open();
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.variable") }));
    await waitFor(() => expect(app.count("triggerVariableAdd")).toBe(1));
    expect(app.args("triggerVariableAdd")).toMatchObject({ name: "Variable_002", parent: 0 });
  });

  test("a refusal says why, and the tree is read again", async () => {
    const app = await open({ triggerAdd: new Refusal("failed", "No room") });
    const asked = app.count("triggerTree");
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.trigger") }));
    await waitFor(() => expect(notices).toEqual([["No room", true]]));
    await waitFor(() => expect(app.count("triggerTree")).toBeGreaterThan(asked));
  });
});

describe("renaming", () => {
  async function renameBox(name: RegExp): Promise<HTMLInputElement> {
    await fireEvent.contextMenu(await row(name));
    await chooseFromMenu(/^Rename/);
    return screen.findByRole("textbox", { name: t("triggers.name") });
  }

  test("Enter renames", async () => {
    const app = await open();
    const box = await renameBox(/Start/);
    box.value = "Begin";
    await fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(app.args("triggerRename")).toEqual({ id: 2, name: "Begin" }));
  });

  test("Esc gives up", async () => {
    const app = await open();
    const box = await renameBox(/Start/);
    await fireEvent.keyDown(box, { key: "Escape" });
    await settled();
    expect(app.count("triggerRename")).toBe(0);
  });

  test("the same name sends nothing", async () => {
    const app = await open();
    const box = await renameBox(/Start/);
    await fireEvent.keyDown(box, { key: "Enter" });
    await settled();
    expect(app.count("triggerRename")).toBe(0);
  });

  test("a variable is renamed as a variable", async () => {
    const app = await open();
    const box = await renameBox(/Count/);
    box.value = "Score";
    await fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(app.count("triggerVariableSet")).toBe(1));
    expect(app.args("triggerVariableSet")).toMatchObject({ id: 5, name: "Score", type: "integer" });
  });
});

describe("deleting", () => {
  async function askDelete(name: RegExp) {
    await fireEvent.contextMenu(await row(name));
    await chooseFromMenu(t("triggers.delete"));
    return within(await screen.findByRole("dialog"));
  }

  test("asks, then deletes", async () => {
    const app = await open();
    const dialog = await askDelete(/Start/);
    dialog.getByText(t("triggers.deleteAsk", { name: "Start" }));
    await fireEvent.click(dialog.getByRole("button", { name: t("triggers.delete") }));
    await waitFor(() => expect(app.args("triggerDelete")).toEqual({ id: 2 }));
    await waitFor(() => expect(deleted).toBe(1));
  });

  test("a delete refused says nothing went", async () => {
    await open({ triggerDelete: new Refusal("failed", "No") });
    const dialog = await askDelete(/Start/);
    await fireEvent.click(dialog.getByRole("button", { name: t("triggers.delete") }));
    await waitFor(() => expect(notices).toEqual([["No", true]]));
    await settled();
    expect(deleted).toBe(0);
  });

  test("a category says all of it goes", async () => {
    await open();
    const dialog = await askDelete(/Other/);
    dialog.getByText(t("triggers.deleteAskCategory", { name: "Other" }));
  });
});

describe("the context menus", () => {
  test("the header has no Rename or Delete", async () => {
    await open();
    await fireEvent.contextMenu(await row(new RegExp(t("triggers.mapHeader"))));
    await screen.findByRole("menuitem", { name: t("triggers.new.trigger") });
    expect(screen.queryByRole("menuitem", { name: /^Rename/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: t("triggers.delete") })).toBeNull();
  });

  test("a script opens in the Script Editor", async () => {
    await open();
    await fireEvent.contextMenu(await row(/Spell/));
    await chooseFromMenu(t("triggers.openInScriptEditor"));
    expect(scripts).toEqual([{ id: 3, kind: "custom", name: "Spell" }]);
  });

  test("a double click on a script opens it", async () => {
    await open();
    await fireEvent.dblClick(await row(/Spell/));
    expect(scripts).toEqual([{ id: 3, kind: "custom", name: "Spell" }]);
  });

  test("a trigger has no such entry", async () => {
    await open();
    await fireEvent.contextMenu(await row(/Start/));
    await screen.findByRole("menuitem", { name: t("triggers.new.trigger") });
    expect(screen.queryByRole("menuitem", { name: t("triggers.openInScriptEditor") })).toBeNull();
  });

  test("a card adds Comment, and a script Run on map initialization", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.contextMenu(screen.getByRole("group", { name: "Spell" }));
    await chooseFromMenu(t("triggers.runOnInit"));
    await waitFor(() => expect(app.args("triggerOptions")).toEqual({ id: 3, runOnInit: true }));
  });

  test("the empty grid offers what can be made there", async () => {
    const app = await open();
    await showCards(app);
    await press(emptyGrid(), 2, [600, 500]);
    await chooseFromMenu(t("triggers.new.script"));
    await waitFor(() => expect(app.args("triggerAdd")).toEqual({ kind: "script", parent: 1 }));
  });
});

describe("read only", () => {
  const locked = { ...tree, readOnly: true };

  test("nothing can be made", async () => {
    await open({ triggerTree: locked });
    const button = screen.getByRole<HTMLButtonElement>("button", {
      name: t("triggers.new.trigger"),
    });
    await waitFor(() => expect(button.disabled).toBe(true));
  });

  test("the menus are off", async () => {
    await open({ triggerTree: locked });
    await fireEvent.contextMenu(await row(/Start/));
    const rename = await screen.findByRole("menuitem", { name: /^Rename/ });
    expect(rename.hasAttribute("data-disabled")).toBe(true);
  });

  test("rows cannot be dragged", async () => {
    await open({ triggerTree: locked });
    await waitFor(async () => expect((await row(/Start/)).getAttribute("draggable")).toBe("false"));
  });
});

describe("dragging in the tree", () => {
  test("into a category moves it to the end there", async () => {
    const app = await open();
    const from = await row(/Start/);
    const onto = await row(/Other/);
    sized(onto, 26);
    await drag(from, "dragstart");
    await drag(onto, "dragover", 13);
    await drag(onto, "drop", 13);
    await waitFor(() => expect(app.count("triggerMove")).toBe(1));
    expect(app.args("triggerMove")).toEqual({ id: 2, parent: 6, index: 1 });
  });

  test("before another moves it there", async () => {
    const app = await open();
    const from = await row(/Note/);
    const onto = await row(/Start/);
    sized(onto, 26);
    await drag(from, "dragstart");
    await drag(onto, "dragover", 2);
    await drag(onto, "drop", 2);
    await waitFor(() => expect(app.count("triggerMove")).toBe(1));
    expect(app.args("triggerMove")).toEqual({ id: 4, parent: 1, index: 0 });
  });

  test("a drop into a closed category opens it", async () => {
    const app = await open();
    await fireEvent.click(screen.getByRole("button", { name: "Other" }));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Old/ })).toBeNull());
    const from = await row(/Start/);
    const onto = await row(/Other/);
    sized(onto, 26);
    await drag(from, "dragstart");
    await drag(onto, "dragover", 13);
    await drag(onto, "drop", 13);
    await waitFor(() => expect(app.count("triggerMove")).toBe(1));
    await row(/Old/);
  });

  test("the header does not take a drag", async () => {
    await open();
    expect((await row(new RegExp(t("triggers.mapHeader")))).getAttribute("draggable")).toBe(
      "false",
    );
  });

  test("a resting drag opens a closed category", async () => {
    await open();
    await fireEvent.click(screen.getByRole("button", { name: "Other" }));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Old/ })).toBeNull());
    const from = await row(/Start/);
    const onto = await row(/Other/);
    sized(onto, 26);
    await drag(from, "dragstart");
    await drag(onto, "dragover", 13);
    await row(/Old/);
  });
});

describe("the functions on a card", () => {
  test("Disable and Delete act on the function", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.contextMenu(functionOf("Kill Unit"));
    await chooseFromMenu(t("triggers.disable"));
    await waitFor(() =>
      expect(app.args("triggerFunctionEnable")).toEqual({ id: 2, path: "1", enabled: false }),
    );
    await fireEvent.contextMenu(functionOf("Kill Unit"));
    await chooseFromMenu(t("triggers.delete"));
    await waitFor(() => expect(app.args("triggerFunctionDelete")).toEqual({ id: 2, path: "1" }));
  });

  test("Paste waits for a copy, and lands after the function", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.contextMenu(functionOf("Create Unit"));
    const paste = await screen.findByRole("menuitem", { name: t("triggers.paste") });
    expect(paste.hasAttribute("data-disabled")).toBe(true);
    await chooseFromMenu(t("triggers.copy"));
    await waitFor(() => expect(app.args("triggerFunctionCopy")).toEqual({ id: 2, path: "0" }));
    await settled();
    await fireEvent.contextMenu(functionOf("Create Unit"));
    await chooseFromMenu(t("triggers.paste"));
    await waitFor(() =>
      expect(app.args("triggerFunctionPaste")).toEqual({
        id: 2,
        parent: null,
        branch: 0,
        index: 1,
      }),
    );
  });

  test("an edit asks again for that card only", async () => {
    const app = await open();
    await showCards(app);
    const cardsAsked = app.count("triggerCards");
    await fireEvent.contextMenu(functionOf("Kill Unit"));
    await chooseFromMenu(t("triggers.delete"));
    await waitFor(() => expect(app.args("trigger")).toEqual({ id: 2 }));
    expect(app.count("triggerCards")).toBe(cardsAsked);
  });

  test("the card's add button asks for a function, and adds it at the end", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.click(
      screen.getAllByRole("button", { name: t("triggers.addAction") })[0] as Element,
    );
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(await dialog.findByRole("option", { name: /Create Unit/ }));
    await fireEvent.click(dialog.getByRole("button", { name: t("triggers.add") }));
    await waitFor(() => expect(app.count("triggerFunctionAdd")).toBe(1));
    expect(app.args("triggerFunctionAdd")).toEqual({
      id: 2,
      parent: null,
      branch: 0,
      index: 2147483647,
      kind: "action",
      name: "CreateUnit",
    });
  });

  test("Change asks for a function and replaces it", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.contextMenu(functionOf("Kill Unit"));
    await chooseFromMenu(t("triggers.changeFunction"));
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(await dialog.findByRole("option", { name: /Create Unit/ }));
    await fireEvent.click(dialog.getByRole("button", { name: t("triggers.add") }));
    await waitFor(() =>
      expect(app.args("triggerFunctionChange")).toEqual({ id: 2, path: "1", name: "CreateUnit" }),
    );
  });

  test("a drag next to another moves it there", async () => {
    const app = await open();
    await showCards(app);
    const moved = screen.getByTitle("Kill Unit");
    const target = functionOf("Create Unit");
    sized(target, 40);
    await drag(moved, "dragstart");
    await drag(target, "dragover", 5);
    await drag(target, "drop", 5);
    await waitFor(() => expect(app.count("triggerFunctionMove")).toBe(1));
    expect(app.args("triggerFunctionMove")).toEqual({
      from: 2,
      path: "1",
      id: 2,
      parent: null,
      branch: 0,
      index: 0,
    });
  });

  test("a drag down counts the list without the function moved", async () => {
    const app = await open();
    await showCards(app);
    const moved = screen.getByTitle("Create Unit");
    const target = functionOf("Kill Unit");
    sized(target, 40);
    await drag(moved, "dragstart");
    await drag(target, "dragover", 35);
    await drag(target, "drop", 35);
    await waitFor(() => expect(app.count("triggerFunctionMove")).toBe(1));
    expect(app.args("triggerFunctionMove")).toMatchObject({ path: "0", index: 1 });
  });

  test("a function does not drop on itself", async () => {
    const app = await open();
    await showCards(app);
    const moved = screen.getByTitle("Kill Unit");
    const target = functionOf("Kill Unit");
    await drag(moved, "dragstart");
    await drag(target, "dragover", 5);
    await drag(target, "drop", 5);
    await settled();
    expect(app.count("triggerFunctionMove")).toBe(0);
  });
});

describe("the cards", () => {
  test("a card's switches set its options", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.click(
      screen.getAllByRole("button", { name: new RegExp(t("triggers.enabled")) })[0] as Element,
    );
    await waitFor(() => expect(app.count("triggerOptions")).toBe(1));
    expect(app.args("triggerOptions")).toMatchObject({ id: 2, enabled: false });
  });

  test("a card's open button opens a script", async () => {
    const app = await open();
    await showCards(app);
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.openInScriptEditor") }));
    expect(scripts).toEqual([{ id: 3, kind: "custom", name: "Spell" }]);
  });
});

describe("the grid", () => {
  const placed = [
    { ...card(2, "Start", "trigger", trigger), place: { x: 0, y: 0, folded: false } },
    { ...card(3, "Spell", "custom", script), place: { x: 380, y: 40, folded: false } },
  ];

  async function openGrid(shown: CardView[] = placed): Promise<FakeApp> {
    const app = await open({ triggerCards: shown });
    await showCards(app);
    // Start, picked in the tree, comes to the top middle.
    await waitFor(() => expect(viewOf()).toEqual({ x: 230, y: 20, scale: 1 }));
    return app;
  }

  test("a card stands at its place", async () => {
    await openGrid();
    expect(placeOf("Spell")).toEqual([380, 40]);
  });

  test("cards never placed stand in a column, each below the one before", async () => {
    await openGrid(placed.map((each) => ({ ...each, place: null })));
    expect(placeOf("Start")).toEqual([0, 0]);
    expect(placeOf("Spell")).toEqual([0, 120]);
  });

  test("a card dragged by its title bar lands on the grid's lines, and every card keeps its place", async () => {
    const app = await openGrid();
    await press(titleOf("Spell"), 0, [700, 70], [745, 106]);
    await waitFor(() => expect(app.count("triggerPlaces")).toBe(1));
    expect(app.args("triggerPlaces")).toEqual({
      places: [
        { id: 2, x: 0, y: 0 },
        { id: 3, x: 420, y: 80 },
      ],
    });
    expect(placeOf("Spell")).toEqual([420, 80]);
  });

  test("a press that moves a few pixels does not move the card", async () => {
    const app = await openGrid();
    await press(titleOf("Spell"), 0, [700, 70], [702, 71]);
    await settled();
    expect(app.count("triggerPlaces")).toBe(0);
  });

  test("a drag from a card's body moves neither the card nor the grid", async () => {
    const app = await openGrid();
    const actions = within(screen.getByRole("group", { name: "Start" })).getByText(
      t("triggers.actions"),
    );
    await press(actions, 0, [300, 200], [347, 233]);
    await settled();
    expect(app.count("triggerPlaces")).toBe(0);
    expect(viewOf()).toEqual({ x: 230, y: 20, scale: 1 });
  });

  test("a left drag on the empty grid pans it, and selects nothing", async () => {
    await openGrid();
    await press(emptyGrid(), 0, [600, 500], [650, 530]);
    expect(viewOf()).toEqual({ x: 280, y: 50, scale: 1 });
    await settled();
    expect((await row(/Start/)).getAttribute("aria-selected")).toBe("true");
  });

  test("a click on the empty grid selects its category", async () => {
    await openGrid();
    await press(emptyGrid(), 0, [600, 500]);
    await waitFor(async () =>
      expect((await row(/Setup/)).getAttribute("aria-selected")).toBe("true"),
    );
  });

  test("a middle drag pans, even on a card", async () => {
    const app = await openGrid();
    await press(titleOf("Spell"), 1, [700, 70], [740, 70]);
    expect(viewOf()).toEqual({ x: 270, y: 20, scale: 1 });
    await settled();
    expect(app.count("triggerPlaces")).toBe(0);
  });

  test("a right drag on the empty grid pans it, and opens no menu", async () => {
    await openGrid();
    await press(emptyGrid(), 2, [600, 500], [660, 520]);
    expect(viewOf()).toEqual({ x: 290, y: 40, scale: 1 });
    await settled();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  test("a right drag let go over a card opens no menu either", async () => {
    await openGrid();
    const at = (clientX: number, clientY: number) => ({ button: 2, buttons: 2, clientX, clientY });
    await send("pointerDown", emptyGrid(), at(600, 500));
    await send("mouseDown", emptyGrid(), at(600, 500));
    await send("mouseMove", emptyGrid(), at(605, 500));
    await send("mouseMove", emptyGrid(), at(660, 500));
    await send("mouseUp", titleOf("Spell"), at(660, 500));
    await send("contextMenu", titleOf("Spell"), at(660, 500));
    await settled();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  test("the wheel zooms about the mouse", async () => {
    await openGrid();
    await wheel(emptyGrid(), -100, [430, 70]);
    const { x, y, scale } = viewOf();
    expect(scale).toBeGreaterThan(1);
    expect(x).toBeCloseTo(430 - 200 * scale);
    expect(y).toBeCloseTo(70 - 50 * scale);
  });

  test("the wheel over a box being typed in scrolls the box", async () => {
    const note = {
      ...card(4, "Note", "comment", { ...trigger, id: 4, kind: "comment", description: "Hello" }),
      place: { x: 0, y: 200, folded: false },
    };
    await openGrid([...placed, note]);
    const box = within(screen.getByRole("group", { name: "Note" })).getByRole("textbox");
    box.focus();
    await wheel(box, -100, [300, 260]);
    expect(viewOf().scale).toBe(1);
  });

  test("Fit shows every card", async () => {
    await openGrid();
    await press(emptyGrid(), 0, [600, 500], [650, 530]);
    await fireEvent.click(within(canvas()).getByRole("button", { name: t("triggers.fit") }));
    await waitFor(() => expect(viewOf()).toEqual({ x: 20, y: 20, scale: 1 }));
  });

  test("far out, a card shows its name large", async () => {
    await openGrid();
    for (let notch = 0; notch < 10; notch++) {
      await wheel(emptyGrid(), 100, [400, 300]);
    }
    expect(viewOf().scale).toBeLessThan(0.45);
    expect(within(canvas()).getAllByText("Spell")).toHaveLength(2);
  });

  test("a double click on a title bar opens the card, and does not zoom", async () => {
    await openGrid();
    await send("dblClick", titleOf("Spell"), { clientX: 700, clientY: 70 });
    expect(scripts).toEqual([{ id: 3, kind: "custom", name: "Spell" }]);
    expect(viewOf().scale).toBe(1);
  });

  test("Backspace on a card leaves it be", async () => {
    const app = await openGrid();
    await press(titleOf("Start"), 0, [300, 30]);
    await fireEvent.keyDown(document.body, { key: "Backspace", code: "Backspace" });
    await settled();
    screen.getByRole("group", { name: "Start" });
    expect(app.count("triggerDelete")).toBe(0);
  });

  test("a function dragged over a section's title lights it", async () => {
    await openGrid();
    const actions = screen.getByRole("region", { name: t("triggers.actions") });
    await drag(screen.getByTitle("Kill Unit"), "dragstart");
    await drag(actions, "dragover", 5);
    expect(actions.firstElementChild?.className).toMatch(/\btext-normal\b/);
  });

  test("a card picked in the tree is brought into view", async () => {
    await openGrid();
    await fireEvent.click(await row(/Spell/));
    await waitFor(() => expect(viewOf()).toEqual({ x: -150, y: -20, scale: 1 }));
  });

  test("a category's grid comes back as it was left", async () => {
    await openGrid();
    await press(emptyGrid(), 0, [600, 500], [650, 530]);
    await fireEvent.click(await row(/Old/));
    await waitFor(() => expect(viewOf()).toEqual({ x: 20, y: 20, scale: 1 }));
    await fireEvent.click(await row(/Setup/));
    await waitFor(() => expect(viewOf()).toEqual({ x: 280, y: 50, scale: 1 }));
  });
});

describe("the header", () => {
  test("its comment goes with its code", async () => {
    const app = await open();
    const comment = await screen.findByRole("textbox", { name: t("triggers.comment") });
    comment.focus();
    await fireEvent.input(comment, { target: { value: "New top" } });
    await fireEvent.change(comment);
    await waitFor(() =>
      expect(app.args("triggerHeader")).toEqual({ comment: "New top", code: "// head" }),
    );
  });

  test("code sent before the comment's answer keeps the comment", async () => {
    const first = later(null);
    let asked = 0;
    const app = await open({ triggerHeader: () => (++asked === 1 ? first.answer : null) });
    const comment = await screen.findByRole("textbox", { name: t("triggers.comment") });
    comment.focus();
    await fireEvent.input(comment, { target: { value: "New top" } });
    await fireEvent.change(comment);
    const code = screen.getByRole("textbox", { name: t("triggers.code") });
    const view = EditorView.findFromDOM(code);
    view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "// new" } });
    await fireEvent.blur(code);
    first.release();
    await waitFor(() => expect(asked).toBe(2));
    expect(app.args("triggerHeader")).toEqual({ comment: "New top", code: "// new" });
  });

  test("it opens in the Script Editor", async () => {
    await open();
    await fireEvent.click(
      await screen.findByRole("button", { name: t("triggers.openInScriptEditor") }),
    );
    expect(scripts).toEqual([{ id: 0, kind: "root", name: t("triggers.mapHeader") }]);
  });
});

describe("what the map's triggers say", () => {
  test("a failed load shows why", async () => {
    new FakeApp({ ...answers, triggerCatalog: new Refusal("failed", "No catalog") });
    render(TriggerEditor, {
      mode: "de",
      queued: new CommandQueue().run,
      onnotice: () => {},
      onscript: () => {},
      ondeleted: () => {},
    });
    await screen.findByText("No catalog");
  });

  test("the app's refresh reads the tree and the cards again", async () => {
    const app = await open();
    await showCards(app);
    const asked = app.count("triggerCards");
    await fireEvent.click(screen.getByRole("button", { name: t("triggers.new.comment") }));
    await waitFor(() => expect(app.count("triggerCards")).toBeGreaterThan(asked));
  });
});
