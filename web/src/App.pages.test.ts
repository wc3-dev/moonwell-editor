// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { answer, pickOnMap } from "./lib/map/pick.ts";
import { setPref } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import {
  appTests,
  arena,
  FakeApp,
  openApp,
  press,
  showObject,
  triggerAnswers,
} from "./test/fakeApp.ts";

vi.mock("./lib/monaco/scriptsEditor.ts", () => ({
  ScriptsEditor: {
    create: async () => ({
      setTheme() {},
      async show() {},
      async setText() {},
      async close() {},
      async dispose() {},
    }),
  },
}));

appTests();

const table = { fields: [], table: [] };
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const clickHeader = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";
const selectedRow = () =>
  screen
    .getAllByRole("treeitem")
    .find((row) => row.getAttribute("aria-selected") === "true")
    ?.textContent?.trim();

describe("the header", () => {
  test("with no map the editors are off", async () => {
    new FakeApp();
    render(App);
    await screen.findByTestId("no-map");
    for (const name of [
      t("header.objectEditor"),
      t("header.terrainEditor"),
      t("header.triggerEditor"),
      t("header.scriptEditor"),
    ]) {
      expect(screen.getByRole<HTMLButtonElement>("button", { name }).disabled).toBe(true);
    }
  });

  test("the object editor's kinds and views show only on its pages", async () => {
    await openApp();
    screen.getByRole("group", { name: t("kindBar.label") });
    screen.getByRole("group", { name: t("header.views") });
    await clickHeader(t("header.terrainEditor"));
    expect(screen.queryByRole("group", { name: t("kindBar.label") })).toBeNull();
    expect(screen.queryByRole("group", { name: t("header.views") })).toBeNull();
    expect(pressed(t("header.terrainEditor"))).toBe(true);
    expect(pressed(t("header.objectEditor"))).toBe(false);
  });

  test("the table is off until the experimental features are on", async () => {
    await openApp();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: t("header.table") }).disabled,
    ).toBe(true);
  });

  test("the Object Editor's button goes back to its page last shown", async () => {
    setPref("experimental", true);
    await openApp(table);
    await clickHeader(t("header.table"));
    await clickHeader(t("header.terrainEditor"));
    await clickHeader(t("header.objectEditor"));
    expect(pressed(t("header.table"))).toBe(true);
  });

  test("turning the experimental features off leaves the table", async () => {
    setPref("experimental", true);
    await openApp(table);
    await clickHeader(t("header.table"));
    setPref("experimental", false);
    await tick();
    await waitFor(() => expect(pressed(t("header.details"))).toBe(true));
  });

  test("the editors still to come are off", async () => {
    await openApp();
    const sound = screen.getByRole<HTMLButtonElement>("button", { name: t("header.soundEditor") });
    expect(sound.disabled).toBe(true);
    expect(sound.title).toBe(t("header.comingSoon", { name: t("header.soundEditor") }));
  });

  test("the menu's Save is off with nothing to save", async () => {
    await openApp();
    await clickHeader(t("header.menu"));
    const save = await screen.findByRole("menuitem", { name: new RegExp(t("header.save")) });
    expect(save.hasAttribute("data-disabled")).toBe(true);
  });

  test("the menu opens the settings and About", async () => {
    await openApp();
    await clickHeader(t("header.menu"));
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: new RegExp(t("header.about")) }),
    );
    await screen.findByRole("dialog", { name: t("about.title") });
  });
});

describe("the details page", () => {
  test("stays in the page while another shows, so it comes back as it was", async () => {
    await openApp();
    await showObject(/Footman/);
    const details = screen.getByRole("textbox", { name: t("details.filterLabel") });
    await fireEvent.input(details, { target: { value: "name" } });
    await clickHeader(t("header.terrainEditor"));
    await clickHeader(t("header.objectEditor"));
    expect(screen.getByRole("textbox", { name: t("details.filterLabel") })).toBe(details);
    expect((details as HTMLInputElement).value).toBe("name");
  });

  test("a row's name in the table opens it there", async () => {
    setPref("experimental", true);
    await openApp({
      fields: [],
      table: [{ id: "h000", name: "Footman", baseId: "hfoo", readOnly: null, cells: [] }],
    });
    await clickHeader(t("header.table"));
    const grid = within(screen.getByRole("main", { name: t("main.table") }));
    await fireEvent.click(await grid.findByRole("button", { name: /Footman/ }));
    await waitFor(() => expect(pressed(t("header.details"))).toBe(true));
  });
});

describe("the table page", () => {
  test("another map starts with the table's chips as they were at first", async () => {
    setPref("experimental", true);
    await openApp({ ...table, openMap: arena });
    await clickHeader(t("header.table"));
    await screen.findByTestId("table-count");
    const chip = await screen.findByRole("button", { name: t("table.changedChip") });
    await waitFor(async () => {
      await fireEvent.click(chip);
      expect(chip.getAttribute("aria-pressed")).toBe("true");
    });
    await clickHeader(t("header.menu"));
    await fireEvent.click(await screen.findByRole("menuitem", { name: t("header.openFolder") }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: t("table.changedChip") }).getAttribute("aria-pressed"),
      ).toBe("false"),
    );
  });
});

describe("the history", () => {
  async function twoShown(answers = {}) {
    const app = await openApp(answers);
    await showObject(/Footman/);
    await fireEvent.click(screen.getByRole("treeitem", { name: /Knight/ }));
    await waitFor(() => expect(selectedRow()).toContain("Knight"));
    return app;
  }

  test("Alt ← and Alt → walk it", async () => {
    await twoShown();
    await press("ArrowLeft", { altKey: true });
    await waitFor(() => expect(selectedRow()).toContain("Footman"));
    await press("ArrowRight", { altKey: true });
    await waitFor(() => expect(selectedRow()).toContain("Knight"));
  });

  test("the mouse's back and forward buttons walk it", async () => {
    await twoShown();
    await fireEvent.mouseUp(document.body, { button: 3 });
    await waitFor(() => expect(selectedRow()).toContain("Footman"));
    await fireEvent.mouseUp(document.body, { button: 4 });
    await waitFor(() => expect(selectedRow()).toContain("Knight"));
  });

  test("the title bar's buttons walk it, and show what is there", async () => {
    await twoShown();
    const back = screen.getByRole<HTMLButtonElement>("button", { name: t("titleBar.back") });
    const forward = screen.getByRole<HTMLButtonElement>("button", { name: t("titleBar.forward") });
    expect(back.disabled).toBe(false);
    expect(forward.disabled).toBe(true);
    await fireEvent.pointerDown(back, { button: 0 });
    await fireEvent.pointerUp(back, { button: 0 });
    await waitFor(() => expect(selectedRow()).toContain("Footman"));
    expect(forward.disabled).toBe(false);
  });

  test("showing the same object twice is one step", async () => {
    await openApp();
    await showObject(/Footman/);
    await fireEvent.click(screen.getByRole("treeitem", { name: /Footman/ }));
    await settled();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: t("titleBar.back") }).disabled,
    ).toBe(true);
  });

  test("walking does not add to it, and a new object cuts what lay ahead", async () => {
    await twoShown();
    const forward = screen.getByRole<HTMLButtonElement>("button", { name: t("titleBar.forward") });
    await press("ArrowLeft", { altKey: true });
    await waitFor(() => expect(forward.disabled).toBe(false));
    await fireEvent.click(screen.getByRole("treeitem", { name: /Knight/ }));
    await waitFor(() => expect(forward.disabled).toBe(true));
  });

  test("the details' scroll comes back with the place", async () => {
    await twoShown();
    const scroller = screen
      .getByRole("region", { name: t("main.details") })
      .querySelector(".overflow-auto") as HTMLElement;
    scroller.scrollTop = 120;
    await press("ArrowLeft", { altKey: true });
    await waitFor(() => expect(selectedRow()).toContain("Footman"));
    scroller.scrollTop = 0;
    await press("ArrowRight", { altKey: true });
    await waitFor(() => expect(selectedRow()).toContain("Knight"));
    await settled();
    expect(scroller.scrollTop).toBe(120);
  });

  test("another map starts it again", async () => {
    await twoShown({ openMap: arena });
    await clickHeader(t("header.menu"));
    await fireEvent.click(await screen.findByRole("menuitem", { name: t("header.openFolder") }));
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: t("titleBar.back") }).disabled,
      ).toBe(true),
    );
  });
});

describe("the trigger and script editors", () => {
  test("the trigger editor loads when first shown, and stays", async () => {
    const app = await openApp(triggerAnswers);
    expect(app.count("triggerCatalog")).toBe(0);
    await clickHeader(t("header.triggerEditor"));
    await screen.findByRole("treeitem", { name: /Start/ });
    await clickHeader(t("header.objectEditor"));
    await clickHeader(t("header.triggerEditor"));
    await settled();
    expect(app.count("triggerCatalog")).toBe(1);
  });

  test("each reads the scripts again when it shows", async () => {
    const app = await openApp(triggerAnswers);
    await clickHeader(t("header.triggerEditor"));
    await screen.findByRole("treeitem", { name: /Start/ });
    await settled();
    const asked = app.count("triggerTree");
    await clickHeader(t("header.scriptEditor"));
    await waitFor(() => expect(app.count("triggerTree")).toBeGreaterThan(asked));
    const again = app.count("triggerTree");
    await clickHeader(t("header.triggerEditor"));
    await waitFor(() => expect(app.count("triggerTree")).toBeGreaterThan(again));
  });

  test("an undo reads them again in both", async () => {
    const app = await openApp({ ...triggerAnswers, undo: true });
    await clickHeader(t("header.triggerEditor"));
    await screen.findByRole("treeitem", { name: /Start/ });
    await settled();
    const asked = app.count("triggerTree");
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(app.count("triggerTree")).toBeGreaterThanOrEqual(asked + 2));
  });

  test("a double click on a script opens it in the Script Editor", async () => {
    const tree = {
      ...triggerAnswers.triggerTree,
      items: [
        ...triggerAnswers.triggerTree.items,
        { id: 3, parent: 1, kind: "custom", name: "Spell", enabled: true, expanded: true, ref: "" },
      ],
    };
    await openApp({ ...triggerAnswers, triggerTree: tree, trigger: { code: "function x" } });
    await clickHeader(t("header.triggerEditor"));
    await fireEvent.dblClick(await screen.findByRole("treeitem", { name: /Spell/ }));
    await waitFor(() => expect(pressed(t("header.scriptEditor"))).toBe(true));
    await screen.findByTitle(/Spell/);
  });
});

describe("a pick on the map", () => {
  test("shows the map, then the page it came from", async () => {
    await openApp(triggerAnswers);
    await clickHeader(t("header.triggerEditor"));
    await screen.findByRole("treeitem", { name: /Start/ });
    const picked = pickOnMap("unit");
    await waitFor(() => expect(pressed(t("header.terrainEditor"))).toBe(true));
    answer(null);
    await expect(picked).resolves.toBeNull();
    await waitFor(() => expect(pressed(t("header.triggerEditor"))).toBe(true));
  });

  test("with no map it stays where it is", async () => {
    new FakeApp();
    render(App);
    await screen.findByTestId("no-map");
    const picked = pickOnMap("unit");
    await settled();
    await screen.findByTestId("no-map");
    answer(null);
    await picked;
  });
});
