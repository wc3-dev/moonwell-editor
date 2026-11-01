// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import { setPref } from "./lib/prefs.svelte.ts";
import { t, tCount } from "./lib/text.ts";
import {
  appTests,
  arena,
  footmanEntry,
  openApp,
  openSpell,
  press,
  Refusal,
  scriptAnswers,
  showObject,
  triggerAnswers,
  unit,
} from "./test/fakeApp.ts";

vi.mock("./lib/scripts/monaco/scriptsEditor.ts", () => ({
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

const standard = { ...footmanEntry, id: "hfoo", baseId: null, name: "Peasant" };

const clickHeader = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const notice = async () => (await screen.findByTestId("notice")).textContent?.trim();
const treeFilter = () => screen.getByRole("textbox", { name: t("tree.filterLabel") });
const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("on the details page", () => {
  test("Ctrl S saves and says what it wrote", async () => {
    const app = await openApp({ save: { written: ["war3map.w3u"], backup: "", note: "" } });
    await press("s", { ctrlKey: true });
    await waitFor(() => expect(app.count("save")).toBe(1));
    expect(await notice()).toBe(tCount("save.saved", 1));
  });

  test("a save that fails says why", async () => {
    await openApp({ save: new Refusal("failed", "The disk is full") });
    await press("s", { ctrlKey: true });
    await waitFor(async () =>
      expect(await notice()).toBe(t("notice.notSaved", { error: "The disk is full" })),
    );
  });

  test("Ctrl Z undoes and fetches the tree and the object again", async () => {
    const app = await openApp({ undo: true });
    await showObject(/Footman/);
    const trees = app.count("tree");
    const objects = app.count("object");
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(app.count("undo")).toBe(1));
    expect(await notice()).toBe(t("notice.undone"));
    expect(app.count("tree")).toBeGreaterThan(trees);
    expect(app.count("object")).toBe(objects + 1);
  });

  test("Ctrl Z with nothing to undo says so", async () => {
    await openApp({ undo: false });
    await press("z", { ctrlKey: true });
    expect(await notice()).toBe(t("notice.nothingToUndo"));
  });

  test("Ctrl Y and Ctrl Shift Z redo", async () => {
    const app = await openApp({ redo: true });
    await press("y", { ctrlKey: true });
    await waitFor(() => expect(app.count("redo")).toBe(1));
    expect(await notice()).toBe(t("notice.redone"));
    await press("z", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(app.count("redo")).toBe(2));
  });

  test("Ctrl Z in a box is the box's own", async () => {
    const app = await openApp({ undo: true });
    treeFilter().focus();
    await press("z", { ctrlKey: true });
    await settled();
    expect(app.count("undo")).toBe(0);
  });

  test("Ctrl Shift N asks for an id, based on the object shown", async () => {
    const app = await openApp({ nextId: "h002" });
    await showObject(/Footman/);
    await press("n", { ctrlKey: true, shiftKey: true });
    await screen.findByRole("dialog", { name: /^New hfoo/ });
    expect(app.args("nextId")).toEqual({ kind: "unit", baseId: "hfoo" });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: t("dialog.new.id") }).value).toBe(
      "h002",
    );
  });

  test("Ctrl Shift N with nothing shown asks for an object", async () => {
    await openApp();
    await press("n", { ctrlKey: true, shiftKey: true });
    expect(await notice()).toBe(t("notice.pickBase"));
  });

  test("Ctrl Shift N on a read-only object says why not", async () => {
    await openApp({ object: unit(footmanEntry, { readOnly: "the file is damaged" }) });
    await showObject(/Footman/);
    await press("n", { ctrlKey: true, shiftKey: true });
    expect(await notice()).toBe(t("notice.readOnly", { reason: "the file is damaged" }));
  });

  test("F2 in the tree renames in the row, and Enter sets the name", async () => {
    const app = await openApp({ setField: unit(footmanEntry, { name: "Squire" }) });
    await showObject(/Footman/);
    await press("F2");
    const box = await screen.findByRole<HTMLInputElement>("textbox", {
      name: t("tree.renameLabel", { id: "h000" }),
    });
    box.value = "Squire";
    await press("Enter");
    await waitFor(() => expect(app.count("setField")).toBe(1));
    expect(app.args("setField")).toMatchObject({ id: "h000", field: "unam", value: "Squire" });
  });

  test("Esc gives up a rename in the row", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await press("F2");
    await screen.findByRole("textbox", { name: t("tree.renameLabel", { id: "h000" }) });
    await press("Escape");
    await settled();
    expect(app.count("setField")).toBe(0);
    expect(
      screen.queryByRole("textbox", { name: t("tree.renameLabel", { id: "h000" }) }),
    ).toBeNull();
  });

  test("F2 in the details goes to the name field", async () => {
    await openApp();
    await showObject(/Footman/);
    await fireEvent.pointerDown(screen.getByRole("region", { name: t("main.details") }));
    await press("F2");
    await waitFor(() => expect(document.activeElement?.tagName).toMatch(/INPUT|TEXTAREA/));
    expect((document.activeElement as HTMLInputElement).value).toBe("Footman");
  });

  test("Delete asks about the custom object shown", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await press("Delete");
    await screen.findByRole("dialog", { name: t("dialog.delete.title", { name: "Footman" }) });
    expect(app.count("deleteObject")).toBe(0);
  });

  test("Delete with the questions turned off deletes at once", async () => {
    setPref("confirm", false);
    const app = await openApp();
    await showObject(/Footman/);
    await press("Delete");
    await waitFor(() => expect(app.count("deleteObject")).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Delete on a standard object says only custom ones can go", async () => {
    await openApp({ tree: [standard], object: unit(standard) });
    await fireEvent.input(treeFilter(), { target: { value: "Peas" } });
    await showObject(/Peasant/);
    await press("Delete");
    expect(await notice()).toBe(t("notice.onlyCustomDelete"));
  });

  test("Delete in a box is the box's own", async () => {
    await openApp();
    await showObject(/Footman/);
    treeFilter().focus();
    await press("Delete");
    await settled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Ctrl Shift D copies the custom object and shows the copy", async () => {
    const app = await openApp({ copyObject: "h002" });
    await showObject(/Footman/);
    await press("d", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(app.args("object")).toEqual({ kind: "unit", id: "h002" }));
    expect(await notice()).toBe(
      t("notice.copiedTo", { name: "Footman", from: "h000", id: "h002" }),
    );
  });

  test("Ctrl C keeps the object and Ctrl V asks for the copy's id", async () => {
    const app = await openApp({ nextId: "h002" });
    await showObject(/Footman/);
    await press("c", { ctrlKey: true });
    expect(await notice()).toBe(t("notice.copied", { name: "Footman", id: "h000" }));
    await press("v", { ctrlKey: true });
    await screen.findByRole("dialog", { name: /^Paste Footman/ });
    expect(app.args("nextId")).toEqual({ kind: "unit", baseId: "hfoo" });
  });

  test("Ctrl C with text selected leaves the object alone", async () => {
    await openApp();
    await showObject(/Footman/);
    const selection = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "Footman" } as Selection);
    await press("c", { ctrlKey: true });
    await settled();
    selection.mockRestore();
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  test("Ctrl V with nothing copied says so", async () => {
    await openApp();
    await press("v", { ctrlKey: true });
    expect(await notice()).toBe(t("notice.nothingCopied"));
  });

  test("Ctrl F goes to the filter of the fields", async () => {
    await openApp();
    await showObject(/Footman/);
    await press("f", { ctrlKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: t("details.filterLabel") }),
    );
  });

  test("Ctrl D shows the fields' ids", async () => {
    await openApp();
    await showObject(/Footman/);
    expect(screen.queryByText("unam")).toBeNull();
    await press("d", { ctrlKey: true });
    await screen.findByText("unam");
    await press("d", { ctrlKey: true });
    await waitFor(() => expect(screen.queryByText("unam")).toBeNull());
  });

  test("F10 opens the settings", async () => {
    await openApp();
    await press("F10");
    await screen.findByRole("dialog", { name: t("header.settings") });
  });

  test("Esc closes the problems and lets go of a button", async () => {
    await openApp(
      {},
      {
        map: { ...arena, problems: ["A file is damaged"] },
        session: { dirty: false, changedObjects: 0 },
      },
    );
    await screen.findByText("A file is damaged");
    const button = screen.getByRole("button", { name: t("header.objectEditor") });
    button.focus();
    await press("Escape");
    await waitFor(() => expect(screen.queryByText("A file is damaged")).toBeNull());
    expect(document.activeElement).not.toBe(button);
  });

  test("a dialog keeps the window's keys", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await press("Delete");
    await screen.findByRole("dialog");
    await press("s", { ctrlKey: true });
    await settled();
    expect(app.count("save")).toBe(0);
  });
});

describe("on the table page", () => {
  const table = { fields: [], table: [] };

  test("Ctrl F goes to the table's filter", async () => {
    setPref("experimental", true);
    await openApp(table);
    await clickHeader(t("header.table"));
    await press("f", { ctrlKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: t("table.filterLabel") }),
    );
  });

  test("the keys for the object shown do nothing", async () => {
    setPref("experimental", true);
    const app = await openApp({ ...table, copyObject: "h002", nextId: "h002" });
    await showObject(/Footman/);
    await clickHeader(t("header.table"));
    await press("Delete");
    await press("F2");
    await press("n", { ctrlKey: true, shiftKey: true });
    await press("d", { ctrlKey: true, shiftKey: true });
    await settled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(app.count("nextId") + app.count("copyObject")).toBe(0);
  });

  test("Ctrl S and Ctrl Z still work", async () => {
    setPref("experimental", true);
    const app = await openApp({
      ...table,
      undo: true,
      save: { written: [], backup: "", note: "" },
    });
    await clickHeader(t("header.table"));
    await press("s", { ctrlKey: true });
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(app.count("save") + app.count("undo")).toBe(2));
  });
});

describe("on the map page", () => {
  test("only Save and Settings are the window's", async () => {
    const app = await openApp({ undo: true, save: { written: [], backup: "", note: "" } });
    await clickHeader(t("header.terrainEditor"));
    await press("z", { ctrlKey: true });
    await settled();
    expect(app.count("undo")).toBe(0);
    await press("s", { ctrlKey: true });
    await waitFor(() => expect(app.count("save")).toBe(1));
    await press("F10");
    await screen.findByRole("dialog", { name: t("header.settings") });
  });
});

describe("in the trigger editor", () => {
  async function openTriggers(answers = {}) {
    const app = await openApp({ ...triggerAnswers, ...answers });
    await clickHeader(t("header.triggerEditor"));
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Start/ }));
    return app;
  }

  test("F2 renames what is selected", async () => {
    await openTriggers();
    await press("F2");
    await waitFor(() => expect(document.activeElement?.tagName).toBe("INPUT"));
    expect((document.activeElement as HTMLInputElement).value).toBe("Start");
  });

  test("Delete asks about what is selected", async () => {
    await openTriggers();
    await press("Delete");
    await screen.findByRole("dialog");
  });

  test("Delete in a box is the box's own", async () => {
    await openTriggers();
    screen.getByRole("textbox", { name: t("triggers.filter") }).focus();
    await press("Delete");
    await settled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Ctrl S, Ctrl Z and F10 work, and the object editor's keys do not", async () => {
    const app = await openTriggers({
      undo: true,
      nextId: "h002",
      save: { written: [], backup: "", note: "" },
    });
    await press("n", { ctrlKey: true, shiftKey: true });
    await press("d", { ctrlKey: true });
    await settled();
    expect(app.count("nextId")).toBe(0);
    await press("s", { ctrlKey: true });
    await press("z", { ctrlKey: true });
    await waitFor(() => expect(app.count("save") + app.count("undo")).toBe(2));
    await press("F10");
    await screen.findByRole("dialog", { name: t("header.settings") });
  });
});

describe("in the script editor", () => {
  function monacoBox(): HTMLTextAreaElement {
    const editor = document.createElement("div");
    editor.className = "monaco-editor";
    const box = document.createElement("textarea");
    editor.append(box);
    editor.addEventListener("keydown", (event) => event.stopPropagation());
    document.body.append(editor);
    box.focus();
    return box;
  }

  test("Save and Settings reach the window past Monaco", async () => {
    const app = await openApp({ ...scriptAnswers, save: { written: [], backup: "", note: "" } });
    await openSpell();
    const box = monacoBox();
    await press("s", { ctrlKey: true });
    await waitFor(() => expect(app.count("save")).toBe(1));
    await press("F10");
    await screen.findByRole("dialog", { name: t("header.settings") });
    box.parentElement?.remove();
  });

  test("Monaco keeps its other keys", async () => {
    const app = await openApp({ ...scriptAnswers, undo: true });
    await openSpell();
    const box = monacoBox();
    await press("z", { ctrlKey: true });
    await settled();
    box.parentElement?.remove();
    expect(app.count("undo")).toBe(0);
  });

  test("the object editor's keys do nothing", async () => {
    const app = await openApp({ ...scriptAnswers, nextId: "h002" });
    await showObject(/Footman/);
    await openSpell();
    await press("n", { ctrlKey: true, shiftKey: true });
    await settled();
    expect(app.count("nextId")).toBe(0);
  });
});

describe("the context menu", () => {
  test("the browser's is off, but for boxes", async () => {
    await openApp();
    expect(await fireEvent.contextMenu(document.body)).toBe(false);
    expect(await fireEvent.contextMenu(treeFilter())).toBe(true);
  });
});
