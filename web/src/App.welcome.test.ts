// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import App from "./App.svelte";
import { prefs } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import { appTests, arena, FakeApp, footmanEntry, Refusal } from "./test/fakeApp.ts";

appTests();

const arenaMap = { path: "D:\\Maps\\Arena", found: true };
const troll = { path: "D:\\Maps\\Troll Valley.w3x", found: true };
const gone = { path: "D:\\Old\\Gone", found: false };

async function welcome(answers: Record<string, unknown> = {}): Promise<FakeApp> {
  const app = new FakeApp(answers);
  render(App);
  await screen.findByTestId("welcome");
  return app;
}

const disabled = (element: HTMLElement): boolean => (element as HTMLButtonElement).disabled;

/** The button of a section's entry, once the game data is ready and it can be clicked. */
async function ready(name: string): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(disabled(button)).toBe(false));
  return button;
}

describe("the welcome screen", () => {
  test("names the editor and its version", async () => {
    await welcome();
    expect(screen.getByRole("heading", { level: 1, name: t("welcome.title") })).toBeTruthy();
    await screen.findByText(/1\.2\.3/);
  });

  test("opens a map folder or a map archive", async () => {
    const app = await welcome({ openMap: null });
    await fireEvent.click(await ready(t("welcome.openFolder")));
    await waitFor(() => expect(app.args("openMap")).toEqual({}));
    await fireEvent.click(await ready(t("welcome.openArchive")));
    await waitFor(() => expect(app.args("openMap")).toEqual({ archive: true }));
  });

  test("opens Settings and the command palette, and shows their keys", async () => {
    await welcome();
    const settings = await ready(t("welcome.settings"));
    expect(settings.textContent).toContain("F10");
    await fireEvent.click(settings);
    await screen.findByRole("dialog", { name: t("settings.title") }, { timeout: 5000 });
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const commands = await ready(t("welcome.commands"));
    expect(commands.textContent).toContain("Ctrl Shift P");
    await fireEvent.click(commands);
    await screen.findByPlaceholderText(t("palette.placeholder"));
  });

  test("Learn lists what is coming, and none of it can be clicked", async () => {
    await welcome();
    for (const title of ["start", "theme", "keys", "new"] as const) {
      expect(screen.getByText(t(`welcome.learn.${title}`))).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: new RegExp(t(`welcome.learn.${title}`)) }),
      ).toBeNull();
    }
  });

  test("the Warcraft III folder is asked for when the game is not found, and maps wait for it", async () => {
    const app = await welcome({
      gameData: { source: null, loaded: false, error: null, version: 1 },
      chooseGameData: { source: "D:/War3", loaded: true, error: null, version: 2, game: "2.0.4" },
      recentMaps: [arenaMap],
    });
    const missing = await screen.findByTestId("game-missing");
    expect(disabled(screen.getByRole("button", { name: t("welcome.openFolder") }))).toBe(true);
    expect(disabled(await screen.findByRole("button", { name: "Arena" }))).toBe(true);
    await fireEvent.click(within(missing).getByRole("button", { name: t("welcome.choose") }));
    await waitFor(() => expect(screen.queryByTestId("game-missing")).toBeNull());
    expect(app.count("chooseGameData")).toBe(1);
    await ready(t("welcome.openFolder"));
  });

  test("while the game data loads it says so, and maps wait for it", async () => {
    const app = await welcome({
      gameData: { source: "D:/War3", loaded: false, error: null, version: 2 },
    });
    await screen.findByText(t("welcome.loading"));
    expect(disabled(screen.getByRole("button", { name: t("welcome.openFolder") }))).toBe(true);
    await app.emit("gameData", {
      source: "D:/War3",
      loaded: true,
      error: null,
      version: 3,
      game: "2.0.4",
    });
    await ready(t("welcome.openFolder"));
    expect(screen.queryByText(t("welcome.loading"))).toBeNull();
  });
});

describe("Recent", () => {
  test("lists the kept maps, newest first, each by its name with its folder beside it", async () => {
    await welcome({ recentMaps: [arenaMap, troll] });
    const list = await screen.findByRole("list", { name: t("welcome.recent") });
    const names = within(list)
      .getAllByRole("listitem")
      .map((each) => within(each).getAllByRole("button")[0]?.textContent?.trim());
    expect(names).toEqual(["Arena", "Troll Valley.w3x"]);
    expect(within(list).getAllByText("D:\\Maps")).toHaveLength(2);
  });

  test("with none kept it says where they will show", async () => {
    await welcome({ recentMaps: [] });
    await screen.findByText(t("welcome.noRecent"));
  });

  test("a map opens when clicked", async () => {
    const app = await welcome({ recentMaps: [arenaMap], openMap: arena, tree: [footmanEntry] });
    await fireEvent.click(await ready("Arena"));
    await waitFor(() => expect(app.args("openMap")).toEqual({ path: "D:\\Maps\\Arena" }));
    await screen.findByRole("treeitem", { name: /Footman/ });
  });

  test("a map that fails to open says why", async () => {
    await welcome({ recentMaps: [arenaMap], openMap: new Refusal("failed", "No such map") });
    await fireEvent.click(await ready("Arena"));
    expect((await screen.findByTestId("map-error")).textContent).toBe("No such map");
  });

  test("the cross takes a map off the list", async () => {
    const app = await welcome({ recentMaps: [arenaMap, troll], forgetMap: [troll] });
    await fireEvent.click(
      await screen.findByRole("button", { name: t("welcome.forget", { name: "Arena" }) }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Arena" })).toBeNull());
    expect(app.args("forgetMap")).toEqual({ path: "D:\\Maps\\Arena" });
    expect(screen.getByRole("button", { name: "Troll Valley.w3x" })).toBeTruthy();
  });

  test("a map that is gone says so, and clicking it offers to take it off the list", async () => {
    const app = await welcome({ recentMaps: [gone, arenaMap], forgetMap: [arenaMap] });
    const button = await ready("Gone");
    expect(button.title).toBe(t("welcome.gone", { path: gone.path }));
    await fireEvent.click(button);
    const dialog = within(await screen.findByRole("dialog", { name: t("welcome.gone.title") }));
    dialog.getByText(t("welcome.gone.text", { path: gone.path }));
    expect(app.count("openMap")).toBe(0);
    await fireEvent.click(dialog.getByRole("button", { name: t("welcome.gone.remove") }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Gone" })).toBeNull());
    expect(app.args("forgetMap")).toEqual({ path: gone.path });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a gone map kept from the dialog stays on the list", async () => {
    const app = await welcome({ recentMaps: [gone] });
    await fireEvent.click(await ready("Gone"));
    const dialog = within(await screen.findByRole("dialog", { name: t("welcome.gone.title") }));
    await fireEvent.click(dialog.getByRole("button", { name: t("dialog.cancel") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(app.count("forgetMap")).toBe(0);
    expect(screen.getByRole("button", { name: "Gone" })).toBeTruthy();
  });
});

describe("reopening the last map", () => {
  const writtenSettings = (app: FakeApp): string | undefined =>
    app.log.findLast((each) => each.command === "writeHome" && each.args.file === "settings.json")
      ?.args.text as string | undefined;

  test("the checkbox turns it on in settings.json", async () => {
    const app = await welcome();
    const box = screen.getByRole("checkbox", { name: t("welcome.reopen") }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await fireEvent.click(box);
    expect(prefs.reopenLastMap).toBe(true);
    await waitFor(() =>
      expect(JSON.parse(writtenSettings(app) ?? "{}")).toMatchObject({
        "editor.reopenLastMap": true,
      }),
    );
  });

  test("Settings has the same switch", async () => {
    await welcome();
    await fireEvent.click(await ready(t("welcome.settings")));
    const dialog = within(
      await screen.findByRole("dialog", { name: t("settings.title") }, { timeout: 5000 }),
    );
    await fireEvent.click(dialog.getByRole("checkbox", { name: t("settings.reopenLastMap") }));
    expect(prefs.reopenLastMap).toBe(true);
  });
});
