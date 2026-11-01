// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { setPref } from "./lib/prefs.svelte.ts";
import { t, tCount } from "./lib/text.ts";
import {
  appTests,
  arena,
  FakeApp,
  footmanEntry,
  knightEntry,
  later,
  openApp,
  press,
  Refusal,
  showObject,
} from "./test/fakeApp.ts";

appTests();

const dirty = { map: arena, session: { dirty: true, changedObjects: 2 } };
const nothingWritten = { written: [], backup: "", note: "" };
const other = { ...arena, name: "Other", path: "C:/Maps/Other" };

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const notice = async () => (await screen.findByTestId("notice")).textContent?.trim();
const inDialog = async () => within(await screen.findByRole("dialog"));

async function pickFromMenu(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: t("header.menu") }));
  await fireEvent.click(await screen.findByRole("menuitem", { name }));
}

describe("opening a map", () => {
  test("from the start screen", async () => {
    const app = new FakeApp({ openMap: other, tree: [footmanEntry] });
    render(App);
    await fireEvent.click(await screen.findByRole("button", { name: t("noMap.open") }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: t("openMenu.folder") }));
    await screen.findByRole("treeitem", { name: /Footman/ });
    expect(document.title).toContain("C:/Maps/Other");
    expect(app.args("openMap")).toEqual({});
  });

  test("an archive is asked for as one", async () => {
    const app = await openApp({ openMap: other });
    await pickFromMenu(t("header.openArchive"));
    await waitFor(() => expect(app.args("openMap")).toEqual({ archive: true }));
  });

  test("a tree answered after another map opened is dropped", async () => {
    const first = later([footmanEntry]);
    let asks = 0;
    await openApp({
      tree: ({ kind }: { kind: string }) => (kind === "unit" && ++asks === 1 ? first.answer : []),
      openMap: other,
    });
    await pickFromMenu(t("header.openFolder"));
    await waitFor(() => expect(document.title).toContain("C:/Maps/Other"));
    await settled();
    first.release();
    await settled();
    expect(screen.queryByRole("treeitem", { name: /Footman/ })).toBeNull();
  });

  test("a dialog cancelled changes nothing", async () => {
    const app = await openApp({ openMap: null });
    await pickFromMenu(t("header.openFolder"));
    await waitFor(() => expect(app.count("openMap")).toBe(1));
    await settled();
    expect(document.title).toContain("C:/Maps/Arena");
  });

  test("another map starts with nothing picked and the problems open", async () => {
    await openApp({ openMap: { ...other, problems: ["Its units file is damaged"] } });
    await showObject(/Footman/);
    await pickFromMenu(t("header.openArchive"));
    await screen.findByText("Its units file is damaged");
    await screen.findByText(t("main.pickObject"));
  });

  test("another map brings its own trees", async () => {
    const app = await openApp({ openMap: other });
    await screen.findByRole("treeitem", { name: /Footman/ });
    app.answers.tree = [knightEntry];
    await pickFromMenu(t("header.openFolder"));
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: /Footman/ })).toBeNull());
    await screen.findByRole("treeitem", { name: /Knight/ });
  });

  test("a failure shows why", async () => {
    await openApp({ openMap: new Refusal("failed", "No such map") });
    await pickFromMenu(t("header.openFolder"));
    expect((await screen.findAllByTestId("map-error"))[0]?.textContent).toBe("No such map");
  });

  test("with unsaved changes it asks first, and Cancel stops", async () => {
    const app = await openApp({ openMap: other }, dirty);
    await pickFromMenu(t("header.openFolder"));
    const dialog = await inDialog();
    dialog.getByText(tCount("dialog.unsaved.textCount", 2, { question: t("ask.beforeOpen") }));
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("openMap")).toBe(0);
  });

  test("Discard opens and tells the app to drop the edits", async () => {
    const app = await openApp({ openMap: other }, dirty);
    await pickFromMenu(t("header.openFolder"));
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.discard") }));
    await waitFor(() => expect(app.args("openMap")).toMatchObject({ discard: true }));
  });

  test("Save saves first", async () => {
    const app = await openApp({ openMap: other, save: nothingWritten }, dirty);
    await pickFromMenu(t("header.openFolder"));
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.save") }));
    await waitFor(() => expect(app.count("openMap")).toBe(1));
    const commands = app.log.map((each) => each.command);
    expect(commands.indexOf("save")).toBeLessThan(commands.indexOf("openMap"));
  });

  test("with the questions off it drops the edits without asking", async () => {
    setPref("confirm", false);
    const app = await openApp({ openMap: other }, dirty);
    await pickFromMenu(t("header.openFolder"));
    await waitFor(() => expect(app.args("openMap")).toMatchObject({ discard: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("edits the page did not know of are asked about after all", async () => {
    let asks = 0;
    const app = await openApp({
      openMap: () => (++asks === 1 ? new Refusal("unsaved", "Unsaved") : other),
    });
    app.answers.currentMap = dirty;
    await pickFromMenu(t("header.openFolder"));
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.discard") }));
    await waitFor(() => expect(document.title).toContain("C:/Maps/Other"));
  });
});

describe("reloading", () => {
  test("asks, and with no changes keeps nothing to drop", async () => {
    const app = await openApp({ reload: arena });
    await pickFromMenu(t("header.reload"));
    const dialog = await inDialog();
    expect(dialog.queryByTestId("reload-unsaved")).toBeNull();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.reload.button") }));
    await waitFor(() => expect(app.count("reload")).toBe(1));
    expect(app.args("reload")).toEqual({});
    expect(await notice()).toBe(t("notice.reloaded"));
  });

  test("says what unsaved changes it drops, and drops them", async () => {
    const app = await openApp({ reload: arena }, dirty);
    await pickFromMenu(t("header.reload"));
    const dialog = await inDialog();
    dialog.getByText(tCount("dialog.reload.unsaved", 2));
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.reload.button") }));
    await waitFor(() => expect(app.args("reload")).toEqual({ discard: true }));
  });

  test("Cancel leaves the map", async () => {
    const app = await openApp({ reload: arena });
    await pickFromMenu(t("header.reload"));
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("reload")).toBe(0);
  });

  test("with the questions off it reloads at once", async () => {
    setPref("confirm", false);
    const app = await openApp({ reload: arena }, dirty);
    await pickFromMenu(t("header.reload"));
    await waitFor(() => expect(app.args("reload")).toEqual({ discard: true }));
  });

  test("fetches the object shown and the trees again", async () => {
    const app = await openApp({ reload: arena }, dirty);
    await showObject(/Footman/);
    const objects = app.count("object");
    const trees = app.count("tree");
    await pickFromMenu(t("header.reload"));
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.reload.button") }));
    await waitFor(() => expect(app.count("object")).toBe(objects + 1));
    expect(app.count("tree")).toBeGreaterThan(trees);
  });
});

describe("a save refused because the map changed on disk", () => {
  const refused = { save: new Refusal("changedOnDisk", "The map changed on disk."), reload: arena };

  test("shows the message and offers a reload", async () => {
    const app = await openApp(refused);
    await press("s", { ctrlKey: true });
    const dialog = await inDialog();
    dialog.getByText("The map changed on disk.");
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.diskChanged.reload") }));
    await waitFor(() => expect(app.count("reload")).toBe(1));
  });

  test("with unsaved changes asks again, without a Save", async () => {
    const app = await openApp(refused, dirty);
    await press("s", { ctrlKey: true });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.diskChanged.reload") }));
    const again = await inDialog();
    await again.findByText(
      tCount("dialog.unsaved.textCount", 2, { question: t("ask.reloadDrops") }),
    );
    expect(again.queryByRole("button", { name: t("dialog.unsaved.save") })).toBeNull();
    await fireEvent.click(again.getByRole("button", { name: t("dialog.unsaved.discard") }));
    await waitFor(() => expect(app.args("reload")).toEqual({ discard: true }));
  });

  test("Cancel keeps the map as it is", async () => {
    const app = await openApp(refused);
    await press("s", { ctrlKey: true });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("reload")).toBe(0);
  });
});

describe("closing the window", () => {
  test("with nothing unsaved it closes at once", async () => {
    const app = await openApp();
    await app.emit("closeRequested", { dirty: false });
    await waitFor(() => expect(app.count("closeWindow")).toBe(1));
    expect(app.count("closeAsking")).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("with unsaved changes it asks, and Cancel keeps it open", async () => {
    const app = await openApp({}, dirty);
    await app.emit("closeRequested", { dirty: true });
    const dialog = await inDialog();
    dialog.getByText(tCount("dialog.unsaved.textCount", 2, { question: t("ask.beforeClose") }));
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await settled();
    expect(app.count("closeWindow")).toBe(0);
  });

  test("it asks when the window saw changes the page did not hear of", async () => {
    const app = await openApp();
    await app.emit("closeRequested", { dirty: true });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.discard") }));
    await waitFor(() => expect(app.count("closeWindow")).toBe(1));
  });

  test("a save that fails keeps it open", async () => {
    const app = await openApp({ save: new Refusal("failed", "The disk is full") }, dirty);
    await app.emit("closeRequested", { dirty: true });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.save") }));
    await waitFor(() => expect(app.count("save")).toBe(1));
    await settled();
    expect(app.count("closeWindow")).toBe(0);
  });

  test("a second request while it asks does not ask twice", async () => {
    const app = await openApp({}, dirty);
    await app.emit("closeRequested", { dirty: true });
    await screen.findByRole("dialog");
    await app.emit("closeRequested", { dirty: true });
    await settled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(app.count("closeAsking")).toBe(2);
  });

  test("a request while another question is open stops at Cancel", async () => {
    const app = await openApp({ openMap: other }, dirty);
    await pickFromMenu(t("header.openFolder"));
    await screen.findByRole("dialog");
    await app.emit("closeRequested", { dirty: true });
    await settled();
    expect(app.count("closeWindow")).toBe(0);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  test("a value being typed is sent before it closes", async () => {
    const app = await openApp({ setField: () => ({}) });
    await showObject(/Footman/);
    const box = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    box.focus();
    await fireEvent.input(box, { target: { value: "Squire" } });
    await app.emit("closeRequested", { dirty: false });
    const dialog = await inDialog();
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.unsaved.discard") }));
    await waitFor(() => expect(app.count("closeWindow")).toBe(1));
    expect(app.args("setField")).toMatchObject({ field: "unam", value: "Squire" });
  });
});

describe("the status bar", () => {
  test("follows the app's session", async () => {
    const app = await openApp();
    expect(screen.getByTestId("dirty").textContent?.trim()).toBe(t("status.noChanges"));
    await app.emit("sessionChanged", { dirty: true, changedObjects: 3 });
    await waitFor(() =>
      expect(screen.getByTestId("dirty").textContent?.trim()).toBe(tCount("status.changed", 3)),
    );
  });

  test("a notice goes after six seconds", async () => {
    await openApp({ undo: false });
    vi.useFakeTimers();
    await press("z", { ctrlKey: true });
    await vi.advanceTimersByTimeAsync(5999);
    expect(screen.queryByTestId("notice")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.queryByTestId("notice")).toBeNull();
    vi.useRealTimers();
  });

  test("a warning stays for ten", async () => {
    await openApp({ undo: new Refusal("failed", "The undo failed") });
    vi.useFakeTimers();
    await press("z", { ctrlKey: true });
    await vi.advanceTimersByTimeAsync(9999);
    expect(screen.queryByTestId("notice")).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.queryByTestId("notice")).toBeNull();
    vi.useRealTimers();
  });
});
