// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeApp, later, Refusal } from "../../test/fakeApp.ts";
import { readKeymap } from "../app/keymap.ts";
import { loadSettings, prefs } from "../prefs.svelte.ts";
import { type HomeBoot, homeNotice } from "./home.ts";
import { parseObject } from "./jsonc.ts";
import { moveFromStorage, moveIfNeeded } from "./move.ts";
import { loadState, stateOf } from "./state.svelte.ts";

const storageOf = (items: Record<string, unknown>): Pick<Storage, "getItem"> => ({
  getItem: (key) => {
    const value = items[key];
    if (value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  },
});

const moved = (items: Record<string, unknown>, gameFolder: string | null = null) => {
  const result = moveFromStorage(storageOf(items), { gameFolder });
  return { ...result, root: parseObject(result.settings).root };
};

const schemaOnly = { $schema: "./schemas/settings.schema.json" };
// Scripts followed the default theme's look when the saved prefs chose no code theme and no theme was saved.
const dragon = { ...schemaOnly, "appearance.codeTheme": "kanagawa-dragon" };

describe("moveFromStorage", () => {
  test("empty storage and no legacy settings give a settings file with only its schema", () => {
    const result = moveFromStorage(storageOf({}), null);
    expect(parseObject(result.settings).root).toEqual(schemaOnly);
    expect(result.hotkeys).toBeNull();
    expect(result.state).toEqual({});
  });

  test("the saved theme is written as the id VS Code's own theme has", () => {
    expect(moved({ "moonwell-editor.theme": "gruvbox-dark" }).root["appearance.theme"]).toBe(
      "gruvbox-dark-medium",
    );
    expect(moved({ "moonwell-editor.theme": "nord" }).root["appearance.theme"]).toBe("nord");
  });

  test("a theme no file has yet is kept as it is, and the default theme is left out", () => {
    expect(moved({ "moonwell-editor.theme": "made-up" }).root["appearance.theme"]).toBe("made-up");
    expect(moved({ "moonwell-editor.theme": "kanagawa-dragon" }).root).not.toHaveProperty(
      "appearance.theme",
    );
  });

  test("a code theme of Same as the theme becomes the theme that was the interface's", () => {
    const root = moved({
      "moonwell-editor.theme": "one-dark",
      "moonwell-editor.prefs": { codeTheme: "" },
    }).root;
    expect(root["appearance.theme"]).toBe("one-dark-pro");
    expect(root["appearance.codeTheme"]).toBe("one-dark-pro");
  });

  test("no code theme saved is the same as Same as the theme", () => {
    expect(moved({ "moonwell-editor.theme": "nord" }).root["appearance.codeTheme"]).toBe("nord");
  });

  test("the default theme was the interface's when the saved theme is one no file has", () => {
    expect(moved({ "moonwell-editor.theme": "made-up" }).root["appearance.codeTheme"]).toBe(
      "kanagawa-dragon",
    );
  });

  test("with no theme saved a code theme of Same as the theme is the default theme's", () => {
    expect(moved({ "moonwell-editor.prefs": { codeTheme: "" } }).root).toEqual(dragon);
  });

  test("prefs with no code theme in them are Same as the theme too", () => {
    expect(moved({ "moonwell-editor.prefs": { uiScale: 80 } }).root).toEqual({
      ...dragon,
      "appearance.uiScale": 80,
    });
    expect(moved({ "moonwell-editor.prefs": { codeTheme: 3 } }).root).toEqual(dragon);
    expect(
      moved({ "moonwell-editor.theme": "nord", "moonwell-editor.prefs": { uiScale: 80 } }).root,
    ).toMatchObject({ "appearance.codeTheme": "nord" });
  });

  test("with neither prefs nor a theme saved no code theme is written", () => {
    expect(moved({ "moonwell-editor.graphics": "hd" }).root).not.toHaveProperty(
      "appearance.codeTheme",
    );
  });

  test("a code theme that was chosen is kept, as the id VS Code's own theme has", () => {
    const withTheme = (codeTheme: string) =>
      moved({ "moonwell-editor.theme": "one-dark", "moonwell-editor.prefs": { codeTheme } }).root[
        "appearance.codeTheme"
      ];
    expect(withTheme("nord")).toBe("nord");
    expect(withTheme("gruvbox-dark")).toBe("gruvbox-dark-medium");
  });

  test("the switches are carried over, and what is the default is left out", () => {
    const result = moved({
      "moonwell-editor.prefs": { uiScale: 120, teamColor: 2, confirm: false, terminalHeight: 300 },
    });
    expect(result.root).toEqual({
      ...dragon,
      "appearance.uiScale": 120,
      "objects.teamColor": "teal",
      "editor.confirm": false,
    });
    expect(result.state).toEqual({ terminalHeight: 300 });
  });

  test("the other switches are carried over too", () => {
    const result = moved({
      "moonwell-editor.prefs": {
        showHidden: true,
        experimental: true,
        alphaNotice: false,
        terminalShell: "pwsh",
      },
      "moonwell-editor.graphics": "hd",
    });
    expect(result.root).toEqual({
      ...dragon,
      "game.graphicsMode": "hd",
      "objects.showHidden": true,
      "editor.alphaNotice": false,
      "editor.experimental": true,
      "terminal.shell": "pwsh",
    });
  });

  test("a value the editor can't use is the default", () => {
    const result = moved({
      "moonwell-editor.prefs": { uiScale: 90, teamColor: 99, confirm: "no", terminalShell: 4 },
      "moonwell-editor.graphics": "vhd",
    });
    expect(result.root).toEqual(dragon);
  });

  test("a saved confirmReload is the old name of confirm, and confirm wins over it", () => {
    expect(
      moved({ "moonwell-editor.prefs": { confirmReload: false } }).root["editor.confirm"],
    ).toBe(false);
    expect(
      moved({ "moonwell-editor.prefs": { confirm: true, confirmReload: false } }).root,
    ).toEqual(dragon);
  });

  test("the notice's own old Don't show this again turns the alpha notice off", () => {
    expect(moved({ "moonwell-editor.alpha-understood": "yes" }).root["editor.alphaNotice"]).toBe(
      false,
    );
    expect(
      moved({
        "moonwell-editor.alpha-understood": "yes",
        "moonwell-editor.prefs": { alphaNotice: true },
      }).root,
    ).toEqual(dragon);
  });

  test("prefs that can't be read are the defaults, as the old app took them", () => {
    expect(moved({ "moonwell-editor.prefs": "{nope" }).root).toEqual(dragon);
    expect(moved({ "moonwell-editor.prefs": "[1]" }).root).toEqual(dragon);
  });

  test("storage that throws gives the defaults", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    const result = moveFromStorage(refusing, null);
    expect(parseObject(result.settings).root).toEqual(schemaOnly);
    expect(result.state).toEqual({});
  });

  test("the old settings' game folder is game.folder", () => {
    expect(moved({}, "D:/War3").root["game.folder"]).toBe("D:/War3");
    expect(moved({}, "").root).toEqual(schemaOnly);
    expect(moveFromStorage(storageOf({}), null).settings).not.toContain("game.folder");
  });

  test("the hotkeys are carried over, only the commands that differ from the defaults", () => {
    const result = moved({
      "moonwell-editor.hotkeys": {
        showTriggers: ["Ctrl+1"],
        save: ["Ctrl+S"],
        clearFilters: "no",
        madeUp: ["F1"],
      },
    });
    expect(result.hotkeys).not.toBeNull();
    expect(parseObject(result.hotkeys).root).toEqual({
      $schema: "./schemas/hotkeys.schema.json",
      showTriggers: ["Ctrl+1"],
    });
    const read = readKeymap(result.hotkeys);
    expect(read.problems).toEqual([]);
    expect(read.keymap.showTriggers).toEqual(["Ctrl+1"]);
  });

  test("hotkeys with no change from the defaults make no file", () => {
    expect(moved({ "moonwell-editor.hotkeys": {} }).hotkeys).toBeNull();
    expect(moved({ "moonwell-editor.hotkeys": { save: ["Ctrl+S"] } }).hotkeys).toBeNull();
    expect(moved({ "moonwell-editor.hotkeys": "{nope" }).hotkeys).toBeNull();
  });

  test("the favourites move from {favourites} per kind to a list per kind", () => {
    const result = moved({
      "moonwell-editor.field-filters": {
        unit: { favourites: ["unam", 3, "uhpm"] },
        item: { favourites: [] },
        ability: { favourites: ["aare"] },
        madeUp: { favourites: ["x"] },
        buff: "no",
      },
    });
    expect(result.state).toEqual({ favourites: { unit: ["unam", "uhpm"], ability: ["aare"] } });
  });

  test("favourites with none chosen make no key", () => {
    expect(moved({ "moonwell-editor.field-filters": { unit: { favourites: [] } } }).state).toEqual(
      {},
    );
    expect(moved({ "moonwell-editor.field-filters": "{nope" }).state).toEqual({});
  });

  test("each kind's table columns keep their key and become the list the text held", () => {
    const columns = [{ field: "unam", level: 0 }];
    const result = moved({
      "objectEditor.columns.unit": JSON.stringify(columns),
      "objectEditor.columns.ability": JSON.stringify([{ field: "aare", level: 1 }]),
      "objectEditor.columns.item": "{nope",
      "objectEditor.columns.buff": '{"field":"x"}',
    });
    expect(result.state).toEqual({
      "objectEditor.columns.unit": columns,
      "objectEditor.columns.ability": [{ field: "aare", level: 1 }],
    });
  });

  test("the tooltip editor's own colours are carried over", () => {
    expect(
      moved({ "moonwell-editor.tooltip-colours": ["#112233", "nope", 4, "#AABBCC"] }).state,
    ).toEqual({ tooltipColours: ["#112233", "#AABBCC"] });
    expect(moved({ "moonwell-editor.tooltip-colours": "{nope" }).state).toEqual({});
  });
});

describe("moveIfNeeded", () => {
  const boot = (overrides: Partial<HomeBoot> = {}): HomeBoot => ({
    folder: "C:/home/.moonwell",
    settings: null,
    hotkeys: null,
    state: null,
    themes: [],
    legacy: { gameFolder: "D:/War3" },
    unreadable: [],
    ...overrides,
  });

  const written = (app: FakeApp): { file: string; text: string }[] =>
    app.log.flatMap((each) =>
      each.command === "writeHome" ? [each.args as { file: string; text: string }] : [],
    );

  const remembered = (): string | null => localStorage.getItem("moonwell-editor.moved");
  const rememberedSoon = () => vi.waitFor(() => expect(remembered()).toBe("yes"));

  beforeEach(() => {
    localStorage.clear();
    homeNotice.text = "";
  });

  afterEach(async () => {
    delete window.chrome;
    localStorage.clear();
    loadSettings(null);
    loadState(null);
    homeNotice.text = "";
  });

  test("does nothing when settings.json is there", async () => {
    const app = new FakeApp();
    localStorage.setItem("moonwell-editor.theme", "nord");
    const home = boot({ settings: "{}" });
    expect(moveIfNeeded(home, localStorage)).toBe(home);
    await app.idle();
    expect(app.log).toEqual([]);
    expect(localStorage.getItem("moonwell-editor.moved")).toBeNull();
  });

  test("does nothing when it moved before", async () => {
    const app = new FakeApp();
    localStorage.setItem("moonwell-editor.theme", "nord");
    localStorage.setItem("moonwell-editor.moved", "yes");
    const home = boot();
    expect(moveIfNeeded(home, localStorage)).toBe(home);
    await app.idle();
    expect(app.log).toEqual([]);
  });

  test("does nothing when settings.json is there but could not be read", async () => {
    const app = new FakeApp();
    localStorage.setItem("moonwell-editor.theme", "nord");
    const home = boot({ unreadable: ["settings.json"] });
    expect(moveIfNeeded(home, localStorage)).toBe(home);
    await app.idle();
    expect(app.log).toEqual([]);
    expect(localStorage.getItem("moonwell-editor.moved")).toBeNull();
  });

  test("moves what the app kept when the storage can't be read", async () => {
    const app = new FakeApp();
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const result = moveIfNeeded(boot(), refusing);
    await vi.waitFor(() => expect(app.count("writeHome")).toBe(1));
    await app.idle();
    expect(parseObject(result.settings).root).toEqual({ ...schemaOnly, "game.folder": "D:/War3" });
  });

  test("writes the files, sends each state key and remembers it moved", async () => {
    const app = new FakeApp();
    localStorage.setItem("moonwell-editor.theme", "gruvbox-dark");
    localStorage.setItem(
      "moonwell-editor.prefs",
      JSON.stringify({ uiScale: 120, terminalHeight: 300 }),
    );
    localStorage.setItem("moonwell-editor.hotkeys", JSON.stringify({ showTriggers: ["Ctrl+1"] }));
    localStorage.setItem(
      "moonwell-editor.field-filters",
      JSON.stringify({ unit: { favourites: ["unam"] } }),
    );

    const result = moveIfNeeded(boot(), localStorage);
    await rememberedSoon();

    // The state's keys, then the hotkeys, then the settings, so the settings file is there only when the rest is.
    expect(app.log.map((each) => each.command)).toEqual([
      "setState",
      "setState",
      "writeHome",
      "writeHome",
    ]);
    const files = written(app);
    expect(files.map((each) => each.file)).toEqual(["hotkeys.json", "settings.json"]);
    expect(parseObject(files[1]?.text ?? "").root).toEqual({
      ...schemaOnly,
      "appearance.theme": "gruvbox-dark-medium",
      "appearance.codeTheme": "gruvbox-dark-medium",
      "appearance.uiScale": 120,
      "game.folder": "D:/War3",
    });
    expect(parseObject(files[0]?.text ?? "").root).toEqual({
      $schema: "./schemas/hotkeys.schema.json",
      showTriggers: ["Ctrl+1"],
    });
    expect(app.log.filter((each) => each.command === "setState")).toEqual([
      { command: "setState", args: { key: "terminalHeight", value: 300 } },
      { command: "setState", args: { key: "favourites", value: { unit: ["unam"] } } },
    ]);
    expect(localStorage.getItem("moonwell-editor.theme")).toBe("gruvbox-dark");

    expect(result.settings).toBe(files[1]?.text);
    expect(result.hotkeys).toBe(files[0]?.text);
    expect(JSON.parse(result.state ?? "null")).toEqual({
      terminalHeight: 300,
      favourites: { unit: ["unam"] },
    });
    expect(result.folder).toBe("C:/home/.moonwell");
    expect(result.legacy).toEqual({ gameFolder: "D:/War3" });
  });

  test("what it returns is what the page loads", async () => {
    new FakeApp();
    localStorage.setItem(
      "moonwell-editor.prefs",
      JSON.stringify({ uiScale: 120, terminalHeight: 300 }),
    );
    const result = moveIfNeeded(boot(), localStorage);
    loadSettings(result.settings);
    loadState(result.state);
    await rememberedSoon();
    expect(prefs.uiScale).toBe(120);
    expect(prefs.gameFolder).toBe("D:/War3");
    expect(
      stateOf("terminalHeight", 240, (value): value is number => typeof value === "number"),
    ).toBe(300);
  });

  test("with nothing to move it still writes a settings file and moves only once", async () => {
    const app = new FakeApp();
    const result = moveIfNeeded(boot({ legacy: null }), localStorage);
    await rememberedSoon();
    expect(app.log).toEqual([
      { command: "writeHome", args: { file: "settings.json", text: result.settings } },
    ]);
    expect(parseObject(result.settings).root).toEqual(schemaOnly);
    expect(result.hotkeys).toBeNull();
    expect(result.state).toBeNull();

    const again = boot({ legacy: null });
    expect(moveIfNeeded(again, localStorage)).toBe(again);
  });

  test("leaves a hotkeys.json that is there as it is", async () => {
    const app = new FakeApp();
    localStorage.setItem("moonwell-editor.hotkeys", JSON.stringify({ showTriggers: ["Ctrl+1"] }));
    const own = '{ // mine\n  "save": ["F5"] }';
    const result = moveIfNeeded(boot({ hotkeys: own }), localStorage);
    await rememberedSoon();
    expect(written(app).map((each) => each.file)).toEqual(["settings.json"]);
    expect(result.hotkeys).toBe(own);

    localStorage.removeItem("moonwell-editor.moved");
    const unreadable = moveIfNeeded(boot({ unreadable: ["hotkeys.json"] }), localStorage);
    await rememberedSoon();
    expect(written(app).map((each) => each.file)).toEqual(["settings.json", "settings.json"]);
    expect(unreadable.hotkeys).toBeNull();
  });

  test("a refused write of settings.json leaves it not remembered, so the next start moves again", async () => {
    const app = new FakeApp({ writeHome: new Refusal("io", "disk full") });
    localStorage.setItem("moonwell-editor.theme", "nord");
    const result = moveIfNeeded(boot(), localStorage);
    await vi.waitFor(() => expect(homeNotice.text).toContain("disk full"));
    await app.idle();
    expect(remembered()).toBeNull();
    expect(parseObject(result.settings).root["appearance.theme"]).toBe("nord");

    // The page still starts on the moved values, and the storage is as it was for the next start.
    const next = boot();
    expect(moveIfNeeded(next, localStorage)).not.toBe(next);
    await app.idle();
  });

  test("a refused state write holds back settings.json and the flag, so nothing is lost", async () => {
    const app = new FakeApp({ setState: new Refusal("failed", "state.json is held") });
    localStorage.setItem("moonwell-editor.theme", "nord");
    localStorage.setItem("moonwell-editor.prefs", JSON.stringify({ terminalHeight: 300 }));
    const result = moveIfNeeded(boot(), localStorage);
    await vi.waitFor(() => expect(homeNotice.text).toContain("state.json is held"));
    await app.idle();
    expect(app.count("setState")).toBe(1);
    expect(written(app)).toEqual([]);
    expect(remembered()).toBeNull();
    expect(parseObject(result.settings).root["appearance.theme"]).toBe("nord");

    // The next start finds no settings.json and moves again.
    const next = boot();
    expect(moveIfNeeded(next, localStorage)).not.toBe(next);
    await app.idle();
  });

  test("a refused hotkeys.json write holds back settings.json and the flag too", async () => {
    const app = new FakeApp({
      writeHome: (args: { file: string }) =>
        args.file === "hotkeys.json" ? new Refusal("io", "hotkeys.json is held") : null,
    });
    localStorage.setItem("moonwell-editor.hotkeys", JSON.stringify({ showTriggers: ["Ctrl+1"] }));
    moveIfNeeded(boot(), localStorage);
    await vi.waitFor(() => expect(homeNotice.text).toContain("hotkeys.json is held"));
    await app.idle();
    expect(written(app).map((each) => each.file)).toEqual(["hotkeys.json"]);
    expect(remembered()).toBeNull();
  });

  test("a state write that fails does not stop the others from being tried", async () => {
    const app = new FakeApp({
      setState: (args: { key: string }) =>
        args.key === "terminalHeight" ? new Refusal("failed", "held") : null,
    });
    localStorage.setItem(
      "moonwell-editor.prefs",
      JSON.stringify({ terminalHeight: 300, uiScale: 120 }),
    );
    localStorage.setItem(
      "moonwell-editor.field-filters",
      JSON.stringify({ unit: { favourites: ["unam"] } }),
    );
    moveIfNeeded(boot(), localStorage);
    await vi.waitFor(() => expect(app.count("setState")).toBe(2));
    await app.idle();
    expect(written(app)).toEqual([]);
    expect(remembered()).toBeNull();
  });

  test("a written settings.json is remembered, and only once the write is answered", async () => {
    const answer = later(null);
    const app = new FakeApp({ writeHome: () => answer.answer });
    localStorage.setItem("moonwell-editor.theme", "nord");
    moveIfNeeded(boot(), localStorage);
    await vi.waitFor(() => expect(app.count("writeHome")).toBe(1));
    await app.idle();
    expect(remembered()).toBeNull();
    answer.release();
    await rememberedSoon();
  });
});
