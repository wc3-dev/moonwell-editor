// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import { t, tCount } from "./lib/text.ts";
import {
  appTests,
  field,
  footmanEntry,
  knightEntry,
  later,
  openApp,
  press,
  Refusal,
  showObject,
  unit,
} from "./test/fakeApp.ts";

appTests();

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const notice = async () => (await screen.findByTestId("notice")).textContent?.trim();
const inDialog = async () => within(await screen.findByRole("dialog"));
const idBox = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole("textbox", { name: t("dialog.new.id") }) as HTMLInputElement;

async function rowMenu(name: RegExp, item: string | RegExp): Promise<void> {
  await fireEvent.contextMenu(await screen.findByRole("treeitem", { name }));
  await screen.findByRole("textbox", { name: t("details.filterLabel") });
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

describe("a new object", () => {
  async function asked(answers = {}) {
    const app = await openApp({ nextId: "h002", ...answers });
    await showObject(/Footman/);
    await press("n", { ctrlKey: true, shiftKey: true });
    return { app, dialog: await inDialog() };
  }

  test("an id that is not four plain characters is refused as it is typed", async () => {
    const { dialog } = await asked();
    await fireEvent.input(idBox(dialog), { target: { value: "h 1" } });
    dialog.getByText(t("notice.idInvalid"));
  });

  test("an id another object has is refused as it is typed", async () => {
    const { app, dialog } = await asked({ createObject: "h001" });
    await fireEvent.input(idBox(dialog), { target: { value: "h001" } });
    dialog.getByText(t("notice.idTaken", { id: "h001", name: "Knight" }));
    await press("Enter");
    await settled();
    expect(app.count("createObject")).toBe(0);
  });

  test("Enter makes it, shows it and says so", async () => {
    const { app } = await asked({ createObject: "h002" });
    await press("Enter");
    await waitFor(() => expect(app.args("object")).toEqual({ kind: "unit", id: "h002" }));
    expect(app.args("createObject")).toEqual({ kind: "unit", baseId: "hfoo", id: "h002" });
    expect(await notice()).toBe(t("notice.made", { id: "h002", base: "hfoo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("an empty id takes the next free one", async () => {
    const { app, dialog } = await asked({ createObject: "h003" });
    await fireEvent.input(idBox(dialog), { target: { value: "" } });
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.new.make") }));
    await waitFor(() => expect(app.count("createObject")).toBe(1));
    expect(app.args("createObject")).not.toHaveProperty("id", "h002");
  });

  test("a refusal keeps the dialog and says why", async () => {
    const { dialog } = await asked({ createObject: new Refusal("failed", "No room") });
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.new.make") }));
    await dialog.findByText("No room");
  });

  test("Cancel asks for nothing", async () => {
    const { app, dialog } = await asked();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("createObject")).toBe(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a paste copies the object copied", async () => {
    const app = await openApp({ nextId: "h002", copyObject: "h002" });
    await showObject(/Footman/);
    await press("c", { ctrlKey: true });
    await press("v", { ctrlKey: true });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.new.pasteButton") }));
    await waitFor(() => expect(app.args("object")).toEqual({ kind: "unit", id: "h002" }));
    expect(app.args("copyObject")).toEqual({ kind: "unit", fromId: "h000", id: "h002" });
    await waitFor(async () =>
      expect(await notice()).toBe(
        t("notice.pasted", { name: "Footman", from: "h000", id: "h002" }),
      ),
    );
  });
});

describe("deleting an object", () => {
  test("the dialog's Delete deletes, says so and shows its base", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await press("Delete");
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.delete.button") }));
    await waitFor(() => expect(app.args("object")).toEqual({ kind: "unit", id: "hfoo" }));
    expect(app.args("deleteObject")).toEqual({ kind: "unit", id: "h000" });
    expect(await notice()).toBe(t("notice.deleted", { name: "Footman", id: "h000" }));
  });

  test("Cancel keeps it", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await press("Delete");
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("deleteObject")).toBe(0);
  });
});

describe("a read-only object", () => {
  const locked = { object: unit(footmanEntry, { readOnly: "the file is damaged" }) };
  const reason = t("notice.readOnly", { reason: "the file is damaged" });

  test("Delete says why not", async () => {
    await openApp(locked);
    await showObject(/Footman/);
    await press("Delete");
    expect(await notice()).toBe(reason);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("Ctrl Shift D says why not", async () => {
    const app = await openApp({ ...locked, copyObject: "h002" });
    await showObject(/Footman/);
    await press("d", { ctrlKey: true, shiftKey: true });
    expect(await notice()).toBe(reason);
    expect(app.count("copyObject")).toBe(0);
  });

  test("F2 in the tree says why not", async () => {
    await openApp(locked);
    await showObject(/Footman/);
    await press("F2");
    expect(await notice()).toBe(reason);
    expect(
      screen.queryByRole("textbox", { name: t("tree.renameLabel", { id: "h000" }) }),
    ).toBeNull();
  });

  test("F2 in the details says why not", async () => {
    await openApp(locked);
    await showObject(/Footman/);
    await fireEvent.pointerDown(screen.getByRole("region", { name: t("main.details") }));
    await press("F2");
    expect(await notice()).toBe(reason);
  });

  test("Reset says why not", async () => {
    const app = await openApp({ ...locked, setCells: { changed: 1 } });
    await rowMenu(/Footman/, t("menu.reset"));
    expect(await notice()).toBe(reason);
    expect(app.count("setCells")).toBe(0);
  });
});

describe("Ctrl C and Ctrl V in the details", () => {
  test("Ctrl C copies the selected field's value, not the object", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await openApp();
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" });
    await fireEvent.pointerDown(box);
    box.blur();
    await press("c", { ctrlKey: true });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Footman"));
    expect(await notice()).not.toBe(t("notice.copied", { name: "Footman", id: "h000" }));
  });

  test("with no field selected Ctrl C copies the object", async () => {
    await openApp();
    await showObject(/Footman/);
    await fireEvent.pointerDown(screen.getByRole("region", { name: t("main.details") }));
    await press("c", { ctrlKey: true });
    expect(await notice()).toBe(t("notice.copied", { name: "Footman", id: "h000" }));
  });
});

describe("the tree's context menu", () => {
  test("shows the object first", async () => {
    await openApp();
    await fireEvent.contextMenu(await screen.findByRole("treeitem", { name: /Knight/ }));
    await waitFor(() =>
      expect(screen.getByRole("treeitem", { name: /Knight/ }).getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
    await screen.findByRole("menuitem", { name: /^Copy\s*Ctrl C$/ });
  });

  test("Copy keeps it for a paste, and names it in the menu after", async () => {
    await openApp();
    await rowMenu(/Footman/, /^Copy\s*Ctrl C$/);
    expect(await notice()).toBe(t("notice.copied", { name: "Footman", id: "h000" }));
    await fireEvent.contextMenu(await screen.findByRole("treeitem", { name: /Knight/ }));
    await screen.findByRole("menuitem", { name: /^Paste Footman\s*Ctrl V$/ });
  });

  test("Copy name puts the name on the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await openApp();
    await rowMenu(/Footman/, t("menu.copyName"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Footman"));
    expect(await notice()).toBe(t("notice.copiedName", { name: "Footman" }));
  });

  test("Rename opens the row's box", async () => {
    await openApp();
    await rowMenu(/Footman/, /^Rename\s*F2$/);
    await screen.findByRole("textbox", { name: t("tree.renameLabel", { id: "h000" }) });
  });

  test("Reset puts the changed fields back as one edit", async () => {
    const changed = unit(footmanEntry, {
      fields: [
        field({ id: "unam", value: "Footman", changed: true }),
        field({ id: "uhpm", value: "900", changed: true, level: 1 }),
        field({ id: "ubld", value: "30" }),
      ],
    });
    const app = await openApp({ object: changed, setCells: { changed: 2 } });
    await rowMenu(/Footman/, t("menu.reset"));
    await waitFor(() => expect(app.count("setCells")).toBe(1));
    expect(app.args("setCells")).toEqual({
      kind: "unit",
      edits: [
        { id: "h000", field: "unam", level: 0, value: null },
        { id: "h000", field: "uhpm", level: 1, value: null },
      ],
    });
    expect(await notice()).toBe(tCount("notice.reset", 2, { name: "Footman" }));
  });

  test("Reset with no changed fields says so", async () => {
    const plain = unit(footmanEntry, { fields: [field({ id: "unam", value: "Footman" })] });
    await openApp({ object: plain });
    await rowMenu(/Footman/, t("menu.reset"));
    expect(await notice()).toBe(t("notice.noChangedFields", { name: "Footman" }));
  });

  test("Delete asks", async () => {
    await openApp();
    await rowMenu(/Footman/, /^Delete…\s*Del$/);
    await screen.findByRole("dialog", { name: t("dialog.delete.title", { name: "Footman" }) });
  });

  test("Edit tooltip opens the tooltip editor", async () => {
    await openApp();
    await rowMenu(/Footman/, t("menu.editTooltip"));
    await screen.findByRole("dialog");
  });
});

describe("editing a field", () => {
  test("is sent when the box is left, and the tree is fetched again", async () => {
    const app = await openApp({ setField: unit(footmanEntry, { name: "Squire" }) });
    await showObject(/Footman/);
    const trees = app.count("tree");
    const box = screen.getByRole("textbox", { name: "Name" });
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await fireEvent.blur(box);
    await waitFor(() => expect(app.count("setField")).toBe(1));
    await waitFor(() => expect(app.count("tree")).toBeGreaterThan(trees));
  });

  test("the app's answer replaces the object shown", async () => {
    await openApp({ setField: unit(footmanEntry, { name: "Squire" }) });
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" });
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await fireEvent.blur(box);
    await screen.findByRole("heading", { name: /Squire/ });
  });

  test("a refused value says why", async () => {
    await openApp({ setField: new Refusal("failed", "Too long") });
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" });
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await fireEvent.blur(box);
    await screen.findByText("Too long");
  });

  test("a save sends what was typed first", async () => {
    const app = await openApp({
      setField: unit(footmanEntry, { name: "Squire" }),
      save: { written: [], backup: "", note: "" },
    });
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" });
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await press("s", { ctrlKey: true });
    await waitFor(() => expect(app.count("save")).toBe(1));
    const commands = app.log.map((each) => each.command);
    expect(commands.indexOf("setField")).toBeLessThan(commands.indexOf("save"));
  });

  test("an edit asked after another waits for it", async () => {
    const first = later(unit(footmanEntry, { name: "Squire" }));
    const app = await openApp({
      setField: () => first.answer,
      save: { written: [], backup: "", note: "" },
    });
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" });
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await press("s", { ctrlKey: true });
    await waitFor(() => expect(app.count("setField")).toBe(1));
    await settled();
    expect(app.count("save")).toBe(0);
    first.release();
    await waitFor(() => expect(app.count("save")).toBe(1));
  });

  test("the answer of an older object does not replace a newer one", async () => {
    const older = later(unit(footmanEntry));
    await openApp({
      object: ({ id }: { id: string }) => (id === "h000" ? older.answer : unit(knightEntry)),
    });
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Footman/ }));
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Knight/ }));
    await screen.findByRole("textbox", { name: "Name" });
    older.release();
    await settled();
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value).toBe("Knight");
  });
});

describe("the kinds", () => {
  test("a kind's tree is asked for once", async () => {
    const app = await openApp();
    await fireEvent.click(screen.getByRole("button", { name: "Items" }));
    await waitFor(() => expect(app.args("tree")).toEqual({ kind: "item" }));
    const asked = app.count("tree");
    await fireEvent.click(screen.getByRole("button", { name: "Units" }));
    await fireEvent.click(screen.getByRole("button", { name: "Items" }));
    await settled();
    expect(app.count("tree")).toBe(asked);
  });

  test("each kind keeps the object last picked", async () => {
    const app = await openApp();
    await showObject(/Footman/);
    await fireEvent.click(screen.getByRole("button", { name: "Items" }));
    await screen.findByText(t("main.pickObject"));
    await fireEvent.click(screen.getByRole("button", { name: "Units" }));
    await waitFor(() => expect(screen.queryByText(t("main.pickObject"))).toBeNull());
    expect(app.args("object")).toEqual({ kind: "unit", id: "h000" });
  });

  test("the trees of the kinds an object's lists hold are fetched", async () => {
    const lists = unit(footmanEntry, {
      fields: [field({ id: "uabi", type: "objectList", listOf: "Ability", value: "" })],
    });
    const app = await openApp({ object: lists });
    await showObject(/Footman/);
    await waitFor(() => expect(app.log.some((each) => each.args?.kind === "ability")).toBe(true));
  });

  test("a failed tree shows why", async () => {
    await openApp({ tree: new Refusal("failed", "The tree is gone") });
    await screen.findByText("The tree is gone");
  });

  test("an object that cannot be read shows why", async () => {
    await openApp({ object: new Refusal("failed", "No such object") });
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Footman/ }));
    await screen.findByText("No such object");
  });
});
