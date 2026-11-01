// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import App from "./App.svelte";
import { setPref } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import {
  appTests,
  FakeApp,
  gameReady,
  openApp,
  openSpell,
  press,
  scriptAnswers,
  showObject,
  triggerAnswers,
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

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));
const clickHeader = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";
const paletteBox = () => screen.queryByPlaceholderText(t("palette.placeholder"));
const treeFilter = () => screen.getByRole("textbox", { name: t("tree.filterLabel") });
const fieldFilter = () => screen.getByRole("textbox", { name: t("details.filterLabel") });
const listed = () => screen.queryAllByRole("option").map((row) => row.textContent ?? "");
const isListed = (name: string) => listed().some((row) => row.includes(name));

async function openPalette(): Promise<HTMLElement> {
  await press("p", { ctrlKey: true, shiftKey: true });
  return await screen.findByPlaceholderText(t("palette.placeholder"));
}

/** Opens the palette and clicks a command in it. */
async function choose(name: string): Promise<void> {
  await openPalette();
  await fireEvent.click(await screen.findByRole("option", { name: (text) => text.includes(name) }));
  await waitFor(() => expect(paletteBox()).toBeNull());
}

describe("opening and closing", () => {
  test("Ctrl Shift P opens it with the cursor in its box", async () => {
    await openApp();
    const box = await openPalette();
    expect(document.activeElement).toBe(box);
  });

  test("it lists the commands with their keys", async () => {
    await openApp();
    await openPalette();
    expect(listed()).toContainEqual(expect.stringMatching(/Save the map.*Ctrl S/));
    expect(listed()).toContainEqual(expect.stringMatching(/Undo.*Ctrl Z/));
  });

  test("Esc closes it and gives the focus back", async () => {
    await openApp();
    treeFilter().focus();
    const box = await openPalette();
    await fireEvent.keyDown(box, { key: "Escape" });
    expect(paletteBox()).toBeNull();
    expect(document.activeElement).toBe(treeFilter());
  });

  test("its key closes it again", async () => {
    await openApp();
    await openPalette();
    await press("p", { ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(paletteBox()).toBeNull());
  });

  test("a click beside it closes it", async () => {
    await openApp();
    await openPalette();
    await fireEvent.click(screen.getByTestId("palette-veil"));
    expect(paletteBox()).toBeNull();
  });

  test("Tab stays in it", async () => {
    await openApp();
    const box = await openPalette();
    expect(await fireEvent.keyDown(box, { key: "Tab" })).toBe(false);
  });

  test("the main menu opens it and shows its key", async () => {
    await openApp();
    await clickHeader(t("header.menu"));
    const entry = await screen.findByRole("menuitem", { name: /Command Palette/ });
    expect(entry.textContent).toContain("Ctrl Shift P");
    await fireEvent.click(entry);
    await screen.findByPlaceholderText(t("palette.placeholder"));
  });
});

describe("searching", () => {
  test("typing narrows the list, and says when nothing is left", async () => {
    await openApp();
    const box = await openPalette();
    await fireEvent.input(box, { target: { value: "trigger editor" } });
    await waitFor(() => expect(listed()).toHaveLength(1));
    expect(isListed(t("hotkey.showTriggers"))).toBe(true);
    await fireEvent.input(box, { target: { value: "zzzz" } });
    await screen.findByText(t("palette.none"));
    expect(listed()).toHaveLength(0);
  });

  test("the letters of a command match without being next to each other", async () => {
    await openApp();
    const box = await openPalette();
    await fireEvent.input(box, { target: { value: "shtrig" } });
    await waitFor(() => expect(isListed(t("hotkey.showTriggers"))).toBe(true));
    expect(isListed(t("hotkey.save"))).toBe(false);
  });
});

describe("running a command", () => {
  test("Enter runs the first one left", async () => {
    await openApp(triggerAnswers);
    const box = await openPalette();
    await fireEvent.input(box, { target: { value: "trigger editor" } });
    await waitFor(() => expect(listed()).toHaveLength(1));
    await fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(pressed(t("header.triggerEditor"))).toBe(true));
    expect(paletteBox()).toBeNull();
  });

  test("the arrow keys pick another", async () => {
    const app = await openApp({ undo: true });
    const box = await openPalette();
    await fireEvent.keyDown(box, { key: "ArrowDown" });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: new RegExp(t("hotkey.undo")) }).ariaSelected).toBe(
        "true",
      ),
    );
    await fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(app.count("undo")).toBe(1));
  });

  test("a command that moves the focus keeps it", async () => {
    await openApp();
    await showObject(/Footman/);
    treeFilter().focus();
    await choose(t("hotkey.filterFields"));
    expect(document.activeElement).toBe(fieldFilter());
  });

  test("a hotkey's command does what its key does", async () => {
    const app = await openApp({ save: { written: [], backup: "", note: "" } });
    await choose(t("hotkey.save"));
    await waitFor(() => expect(app.count("save")).toBe(1));
  });

  test("the editors show from anywhere", async () => {
    await openApp(triggerAnswers);
    await choose(t("hotkey.showTriggers"));
    await waitFor(() => expect(pressed(t("header.triggerEditor"))).toBe(true));
    await choose(t("hotkey.showTerrain"));
    await waitFor(() => expect(pressed(t("header.terrainEditor"))).toBe(true));
    await choose(t("hotkey.showObjects"));
    await waitFor(() => expect(pressed(t("header.objectEditor"))).toBe(true));
  });

  test("a kind's command goes to that kind in the Object Editor", async () => {
    await openApp();
    await clickHeader(t("header.terrainEditor"));
    await choose(t("hotkey.kindAbility"));
    await waitFor(() => expect(pressed(t("kind.ability"))).toBe(true));
    expect(pressed(t("header.objectEditor"))).toBe(true);
  });

  test("Changed only and the categories' commands act on the details", async () => {
    await openApp();
    await showObject(/Footman/);
    await choose(t("hotkey.changedOnly"));
    expect(pressed(t("details.changedOnly"))).toBe(true);
    await choose(t("hotkey.changedOnly"));
    expect(pressed(t("details.changedOnly"))).toBe(false);

    const category = screen.getByRole("button", { name: /^Text/ });
    await choose(t("hotkey.collapseAll"));
    expect(category.getAttribute("aria-expanded")).toBe("false");
    await choose(t("hotkey.expandAll"));
    expect(category.getAttribute("aria-expanded")).toBe("true");
  });

  test("the About command opens the About page", async () => {
    await openApp();
    await choose(t("hotkey.about"));
    await screen.findByRole("dialog", { name: t("header.about") });
  });

  test("the reload command asks first", async () => {
    await openApp();
    await choose(t("hotkey.reload"));
    await screen.findByRole("dialog", { name: t("dialog.reload.title") });
  });

  test("the open commands ask for an archive or a folder", async () => {
    const app = await openApp({ openMap: null });
    await choose(t("hotkey.openArchive"));
    await waitFor(() => expect(app.args("openMap")).toEqual({ archive: true }));
    await waitFor(() => expect(app.count("openMap")).toBe(1));
    await settled();
    await choose(t("hotkey.openFolder"));
    await waitFor(() => expect(app.args("openMap")).toEqual({}));
  });
});

describe("what it lists", () => {
  test("only what can run where the user is", async () => {
    await openApp();
    await clickHeader(t("header.terrainEditor"));
    await openPalette();
    expect(isListed(t("hotkey.settings"))).toBe(true);
    expect(isListed(t("hotkey.showObjects"))).toBe(true);
    expect(isListed(t("hotkey.fieldIds"))).toBe(false);
    expect(isListed(t("hotkey.changedOnly"))).toBe(false);
  });

  test("not the page that already shows", async () => {
    await openApp();
    await clickHeader(t("header.terrainEditor"));
    await openPalette();
    expect(isListed(t("hotkey.showTerrain"))).toBe(false);
  });

  test("not itself", async () => {
    await openApp();
    await openPalette();
    expect(isListed(t("hotkey.commandPalette"))).toBe(false);
  });

  test("the commands on an object only while one shows", async () => {
    await openApp();
    await openPalette();
    expect(isListed(t("hotkey.changedOnly"))).toBe(false);
    expect(isListed(t("hotkey.newObject"))).toBe(false);
    await press("Escape");
    await showObject(/Footman/);
    await openPalette();
    expect(isListed(t("hotkey.changedOnly"))).toBe(true);
    expect(isListed(t("hotkey.newObject"))).toBe(true);
  });

  test("Back only with somewhere to go back to", async () => {
    await openApp();
    await showObject(/Footman/);
    await openPalette();
    expect(isListed(t("hotkey.back"))).toBe(false);
    await fireEvent.keyDown(paletteBox() as HTMLElement, { key: "Escape" });
    await showObject(/Knight/);
    await openPalette();
    expect(isListed(t("hotkey.back"))).toBe(true);
  });

  test("the object commands not in the trigger editor, where the keys act on triggers", async () => {
    await openApp(triggerAnswers);
    await showObject(/Footman/);
    await clickHeader(t("header.triggerEditor"));
    await openPalette();
    expect(isListed(t("hotkey.deleteObject"))).toBe(false);
    expect(isListed(t("hotkey.rename"))).toBe(false);
  });

  test("the Script Editor only with a script open", async () => {
    await openApp(scriptAnswers);
    await openPalette();
    expect(isListed(t("hotkey.showScripts"))).toBe(false);
    await fireEvent.keyDown(paletteBox() as HTMLElement, { key: "Escape" });
    await openSpell();
    await clickHeader(t("header.objectEditor"));
    await openPalette();
    expect(isListed(t("hotkey.showScripts"))).toBe(true);
  });

  test("the table only with the experimental features on", async () => {
    await openApp();
    await openPalette();
    expect(isListed(t("hotkey.showTable"))).toBe(false);
    await fireEvent.keyDown(paletteBox() as HTMLElement, { key: "Escape" });
    setPref("experimental", true);
    await openPalette();
    expect(isListed(t("hotkey.showTable"))).toBe(true);
  });

  test("with no map, what needs none", async () => {
    new FakeApp({ gameData: gameReady, currentMap: null });
    render(App);
    await screen.findByText(t("noMap.text"));
    await openPalette();
    expect(isListed(t("hotkey.settings"))).toBe(true);
    expect(isListed(t("hotkey.openFolder"))).toBe(true);
    expect(isListed(t("hotkey.save"))).toBe(false);
    expect(isListed(t("hotkey.showTerrain"))).toBe(false);
    expect(isListed(t("hotkey.kindUnit"))).toBe(false);
  });
});

describe("keys set in the settings", () => {
  test("a command's key runs it and shows in the list", async () => {
    localStorage.setItem("moonwell-editor.hotkeys", JSON.stringify({ showTriggers: ["Ctrl+1"] }));
    await openApp(triggerAnswers);
    await openPalette();
    expect(listed()).toContainEqual(expect.stringMatching(/Show the Trigger Editor.*Ctrl 1/));
    await fireEvent.keyDown(paletteBox() as HTMLElement, { key: "Escape" });
    await press("1", { ctrlKey: true });
    await waitFor(() => expect(pressed(t("header.triggerEditor"))).toBe(true));
  });

  test("a key for a page that cannot show does nothing", async () => {
    localStorage.setItem("moonwell-editor.hotkeys", JSON.stringify({ showScripts: ["Ctrl+1"] }));
    await openApp(scriptAnswers);
    await press("1", { ctrlKey: true });
    expect(pressed(t("header.objectEditor"))).toBe(true);
  });

  test("the Hotkeys tab offers a key for every command", async () => {
    await openApp();
    await press("F10");
    await fireEvent.click(await screen.findByRole("tab", { name: t("settings.tab.hotkeys") }));
    await screen.findByText(t("hotkey.commandPalette"));
    await screen.findByText(t("hotkey.showTerrain"));
    await screen.findByText(t("hotkey.kindUnit"));
    expect(
      screen
        .getByRole("button", { name: t("settings.resetLabel", { action: t("hotkey.kindUnit") }) })
        .getAttribute("title"),
    ).toBe(t("settings.resetTitle", { keys: t("settings.noKeys") }));
  });
});

test("the palette opens past Monaco", async () => {
  await openApp(scriptAnswers);
  await openSpell();
  const editor = document.createElement("div");
  editor.className = "monaco-editor";
  const box = document.createElement("textarea");
  editor.append(box);
  editor.addEventListener("keydown", (event) => event.stopPropagation());
  document.body.append(editor);
  box.focus();
  await press("p", { ctrlKey: true, shiftKey: true });
  await screen.findByPlaceholderText(t("palette.placeholder"));
  await fireEvent.keyDown(paletteBox() as HTMLElement, { key: "Escape" });
  expect(document.activeElement).toBe(box);
  editor.remove();
});
