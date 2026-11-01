// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import App from "./App.svelte";
import { setPref } from "./lib/prefs.svelte.ts";
import { appTests, arena, FakeApp, gameReady, openApp, Refusal } from "./test/fakeApp.ts";

appTests();

describe("the game data", () => {
  test("with no folder the welcome screen asks for one", async () => {
    const app = new FakeApp({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: gameReady,
    });
    render(App);
    await screen.findByTestId("first-start");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await screen.findByTestId("no-map");
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
    await screen.findByTestId("first-start");
    await fireEvent.click(screen.getByRole("button", { name: /Choose the Warcraft III folder/ }));
    await screen.findByText("The folder is gone");
  });

  test("the load's event moves the page on, and an older answer does not undo it", async () => {
    const app = new FakeApp({
      gameData: { source: "D:/War3", loaded: false, error: null, version: 2 },
    });
    render(App);
    await screen.findAllByText(/Loading/);
    await app.emit("gameData", { ...gameReady, version: 3 });
    await screen.findByText("Open a Warcraft III: Reforged map as a folder or archive.");
    await app.emit("gameData", { source: "D:/War3", loaded: false, error: null, version: 2 });
    expect(
      screen.queryByText("Open a Warcraft III: Reforged map as a folder or archive."),
    ).toBeTruthy();
  });

  test("the choice lists and asset names are asked for once it is ready", async () => {
    const app = new FakeApp();
    render(App);
    await screen.findByTestId("no-map");
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
    await screen.findByTestId("no-map");
    await waitFor(() => expect(document.title).toBe("Moonwell Editor"));
  });
});

describe("the window", () => {
  test("the alpha notice opens at the start when the settings say so", async () => {
    setPref("alphaNotice", true);
    new FakeApp();
    render(App);
    await fireEvent.click(await screen.findByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Got it" })).toBeNull());
  });

  test("the window's frame takes the theme's colours", async () => {
    const app = new FakeApp();
    render(App);
    await waitFor(() => expect(app.count("frameColors")).toBe(1));
  });

  test("the UI scale is told to the window only when it is not the default", async () => {
    const scaled = new FakeApp();
    render(App);
    await screen.findByTestId("no-map");
    expect(scaled.count("uiScale")).toBe(0);
  });

  test("a chosen UI scale reaches the window", async () => {
    setPref("uiScale", 120);
    const scaled = new FakeApp();
    render(App);
    await waitFor(() => expect(scaled.args("uiScale")).toEqual({ percent: 120 }));
  });
});
