// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import App from "./App.svelte";
import { loadSettings, prefs, setPref } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import { shippedThemes } from "./lib/themes/shipped.ts";
import { themeOf } from "./lib/themes.ts";
import { appTests, arena, FakeApp, gameReady, openApp, press, Refusal } from "./test/fakeApp.ts";

appTests();

describe("the game data", () => {
  test("with no folder the welcome screen asks for one", async () => {
    const app = new FakeApp({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: gameReady,
    });
    render(App);
    await screen.findByTestId("game-missing");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await waitFor(() => expect(screen.queryByTestId("game-missing")).toBeNull());
    expect(app.count("chooseGameData")).toBe(1);
  });

  test("a load that failed shows why", async () => {
    new FakeApp({
      gameData: { source: "D:/War3", loaded: false, error: "No storage here", version: 1 },
    });
    render(App);
    expect((await screen.findByTestId("game-data-error")).textContent).toContain("No storage here");
  });

  test("a choice that fails shows why on the welcome screen", async () => {
    new FakeApp({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: new Refusal("failed", "The folder is gone"),
    });
    render(App);
    await screen.findByTestId("game-missing");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await screen.findByText("The folder is gone");
  });

  test("the load's event moves the page on, and an older answer does not undo it", async () => {
    const app = new FakeApp({
      gameData: { source: "D:/War3", loaded: false, error: null, version: 2 },
    });
    render(App);
    await screen.findByText(t("welcome.loading"));
    await app.emit("gameData", { ...gameReady, version: 3 });
    await waitFor(() => expect(screen.queryByText(t("welcome.loading"))).toBeNull());
    await app.emit("gameData", { source: "D:/War3", loaded: false, error: null, version: 2 });
    expect(screen.queryByText(t("welcome.loading"))).toBeNull();
  });

  test("the choice lists and asset names are asked for once it is ready", async () => {
    const app = new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await waitFor(() => expect(app.count("assetNames")).toBe(1));
    expect(app.count("choices")).toBe(1);
  });
});

describe("starting with a map", () => {
  test("the map the app was started with opens", async () => {
    const app = new FakeApp({
      startup: { map: "C:/Maps/Arena" },
      openMap: arena,
      tree: [],
    });
    render(App);
    await waitFor(() => expect(document.title).toContain("C:/Maps/Arena"));
    expect(app.args("openMap")).toMatchObject({ path: "C:/Maps/Arena" });
  });

  test("a map that fails to open at the start shows why", async () => {
    new FakeApp({
      startup: { map: "C:/Maps/Gone" },
      openMap: new Refusal("failed", "No such map"),
    });
    render(App);
    expect((await screen.findByTestId("map-error")).textContent).toBe("No such map");
  });

  test("a page loaded again shows the map the app has open", async () => {
    const app = await openApp();
    expect(document.title).toContain("C:/Maps/Arena");
    expect(app.count("openMap")).toBe(0);
    await screen.findByRole("treeitem", { name: /Footman/ });
  });

  test("the window's title is the app's name with no map", async () => {
    new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await waitFor(() => expect(document.title).toBe("Moonwell Editor"));
  });
});

describe("the window", () => {
  test("the alpha notice opens at the start when the settings say so", async () => {
    setPref("alphaNotice", true);
    new FakeApp();
    render(App);
    const dialog = await screen.findByRole("dialog", { name: t("alpha.title") });
    await fireEvent.click(within(dialog).getByRole("button", { name: t("dialog.close") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("the window's frame takes the theme's colours", async () => {
    const app = new FakeApp();
    render(App);
    await waitFor(() => expect(app.count("frameColors")).toBe(1));
  });

  test("the UI scale is told to the window only when it is not the default", async () => {
    const scaled = new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    expect(scaled.count("uiScale")).toBe(0);
  });

  test("a chosen UI scale reaches the window", async () => {
    setPref("uiScale", 120);
    const scaled = new FakeApp();
    render(App);
    await waitFor(() => expect(scaled.args("uiScale")).toEqual({ percent: 120 }));
  });
});

describe("settings.json", () => {
  test("a boot with a theme mounts in it", async () => {
    loadSettings('{"appearance.theme": "nord", "editor.alphaNotice": false}');
    new FakeApp();
    render(App);
    expect(document.documentElement.dataset.theme).toBe("nord");
    await screen.findByTestId("welcome");
    expect(document.documentElement.dataset.theme).toBe("nord");
  });

  test("a save of the file with another theme switches the page and the window's frame", async () => {
    const app = new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await app.emit("homeChanged", {
      file: "settings.json",
      text: '{"appearance.theme": "dracula"}',
    });
    const dracula = themeOf("dracula", shippedThemes);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dracula"));
    await waitFor(() =>
      expect(app.args("frameColors")).toEqual({
        surface: dracula.colors["background.panel"],
        border: dracula.colors["border.normal"],
      }),
    );
  });

  test("a save of the file with another UI scale reaches the window", async () => {
    const app = new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await app.emit("homeChanged", { file: "settings.json", text: '{"appearance.uiScale": 80}' });
    await waitFor(() => expect(app.args("uiScale")).toEqual({ percent: 80 }));
    await app.emit("homeChanged", { file: "settings.json", text: "{}" });
    await waitFor(() => expect(app.args("uiScale")).toEqual({ percent: 100 }));
  });

  test("a folder chosen is written to the file once it has loaded", async () => {
    const app = new FakeApp({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: { source: "D:/War3", loaded: false, error: null, version: 2 },
    });
    render(App);
    await screen.findByTestId("game-missing");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await waitFor(() => expect(app.count("chooseGameData")).toBe(1));
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
    expect(prefs.gameFolder).toBeNull();
    await app.emit("gameData", {
      source: "D:/War3",
      loaded: true,
      error: null,
      version: 3,
      game: "2.0.4",
    });
    await waitFor(() => expect(app.count("writeHome")).toBe(1));
    expect(JSON.parse((app.args("writeHome") as { text: string }).text)).toMatchObject({
      "game.folder": "D:/War3",
    });
    expect(prefs.gameFolder).toBe("D:/War3");
  });

  test("a folder that fails to load is not written", async () => {
    const app = new FakeApp({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: { source: "D:/Nope", loaded: false, error: null, version: 2 },
    });
    render(App);
    await screen.findByTestId("game-missing");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await waitFor(() => expect(app.count("chooseGameData")).toBe(1));
    await app.emit("gameData", {
      source: "D:/Nope",
      loaded: false,
      error: "No storage here",
      version: 3,
    });
    await screen.findByTestId("game-data-error");
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
    expect(prefs.gameFolder).toBeNull();
  });

  test("a folder dialog that is closed with no choice writes nothing", async () => {
    const app = new FakeApp({ chooseGameData: gameReady });
    render(App);
    await waitFor(() => expect(app.count("assetNames")).toBe(1));
    await press("F10");
    await fireEvent.click(await screen.findByRole("tab", { name: t("settings.tab.data") }));
    await fireEvent.click(await screen.findByRole("button", { name: t("settings.data.change") }));
    await waitFor(() => expect(app.count("chooseGameData")).toBe(1));
    await app.emit("gameData", { ...gameReady, version: 2 });
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
  });

  test("Settings says what is wrong with the file and what could not be saved", async () => {
    loadSettings('{\n  "editor.alphaNotice": false,\n  "appearance.uiScale": 90\n}');
    const app = new FakeApp({ writeHome: new Refusal("failed", "Disk full") });
    render(App);
    await screen.findByTestId("welcome");
    await press("F10");
    const dialog = within(
      await screen.findByRole("dialog", { name: t("settings.title") }, { timeout: 5000 }),
    );
    expect(
      dialog.getByText(
        t("settings.problem.at", {
          line: 3,
          text: t("settings.problem.badValue", { key: "appearance.uiScale" }),
        }),
      ),
    ).toBeTruthy();
    expect(dialog.queryByTestId("home-notice")).toBeNull();
    await fireEvent.click(dialog.getByRole("radio", { name: "80%" }));
    expect((await dialog.findByTestId("home-notice")).textContent).toContain("Disk full");
    expect(app.count("writeHome")).toBe(1);
  });

  test("Settings' tabs and choices move with the arrow keys", async () => {
    loadSettings('{\n  "editor.alphaNotice": false,\n  "appearance.uiScale": 100\n}');
    new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await press("F10");
    const dialog = within(
      await screen.findByRole("dialog", { name: t("settings.title") }, { timeout: 5000 }),
    );
    const scale = dialog.getByRole("radio", { name: "100%" });
    scale.focus();
    await fireEvent.keyDown(scale, { key: "ArrowRight" });
    await waitFor(() => expect(prefs.uiScale).toBe(120));

    const general = dialog.getByRole("tab", { name: t("settings.tab.general") });
    general.focus();
    await fireEvent.keyDown(general, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        dialog.getByRole("tab", { name: t("settings.tab.hotkeys") }).getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });

  test("Settings says a file that can't be read as JSON is not written to", async () => {
    loadSettings("{ oops");
    new FakeApp();
    render(App);
    await screen.findByTestId("welcome");
    await press("F10");
    const dialog = within(
      await screen.findByRole("dialog", { name: t("settings.title") }, { timeout: 5000 }),
    );
    expect(
      dialog.getByText(t("settings.problem.at", { line: 1, text: t("settings.problem.notJson") })),
    ).toBeTruthy();
  });
});
