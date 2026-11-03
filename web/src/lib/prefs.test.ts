// @vitest-environment jsdom
import { waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeApp, Refusal } from "../test/fakeApp.ts";
import { codeThemes } from "./codeThemes.ts";
import { homeNotice } from "./home/notice.svelte.ts";
import schema from "./home/schemas/settings.schema.json";
import {
  emptySettings,
  loadSettings,
  prefs,
  setPref,
  settingsDefaults,
  settingsProblems,
  uiScales,
  watchSettings,
} from "./prefs.svelte.ts";
import { teamColorIds } from "./teamColors.ts";

const defaults = {
  theme: "kanagawa-dragon",
  codeTheme: "",
  uiScale: 100,
  gameFolder: null,
  graphicsMode: "de",
  teamColor: 0,
  showHidden: false,
  confirm: true,
  alphaNotice: true,
  experimental: false,
  reopenLastMap: false,
  terminalShell: "",
};

const written = (app: FakeApp): string[] =>
  app.log
    .filter((each) => each.command === "writeHome")
    .map((each) => (each.args as { text: string }).text);

beforeEach(() => {
  localStorage.clear();
  loadSettings(null);
  homeNotice.text = "";
});

afterEach(async () => {
  delete window.chrome;
  loadSettings(null);
  homeNotice.text = "";
});

describe("reading settings.json", () => {
  test("no file is every default", () => {
    loadSettings(null);
    expect(prefs).toMatchObject(defaults);
    expect(settingsProblems).toEqual([]);
  });

  test("a value in the file is used, the rest are defaults", () => {
    loadSettings('{"appearance.uiScale": 120, "objects.teamColor": "blue"}');
    expect(prefs.uiScale).toBe(120);
    expect(prefs.teamColor).toBe(1);
    expect(prefs.theme).toBe("kanagawa-dragon");
    expect(settingsProblems).toEqual([]);
  });

  test("every key is read", () => {
    loadSettings(`{
      // all of them
      "appearance.theme": "nord",
      "appearance.codeTheme": "monokai",
      "appearance.uiScale": 80,
      "game.folder": "D:/War3",
      "game.graphicsMode": "hd",
      "objects.teamColor": "peanut",
      "objects.showHidden": true,
      "editor.confirm": false,
      "editor.alphaNotice": false,
      "editor.experimental": true,
      "editor.reopenLastMap": true,
      "terminal.shell": "bash",
    }`);
    expect(prefs).toMatchObject({
      theme: "nord",
      codeTheme: "monokai",
      uiScale: 80,
      gameFolder: "D:/War3",
      graphicsMode: "hd",
      teamColor: 23,
      showHidden: true,
      confirm: false,
      alphaNotice: false,
      experimental: true,
      reopenLastMap: true,
      terminalShell: "bash",
    });
    expect(settingsProblems).toEqual([]);
  });

  test("null is the default of the keys that may be null", () => {
    loadSettings(
      '{"appearance.codeTheme": "monokai", "game.folder": "D:/War3", "terminal.shell": "bash"}',
    );
    loadSettings('{"appearance.codeTheme": null, "game.folder": null, "terminal.shell": null}');
    expect(prefs).toMatchObject({ codeTheme: "", gameFolder: null, terminalShell: "" });
    expect(settingsProblems).toEqual([]);
  });

  test("a value that can't be used is the default, with its line", () => {
    loadSettings('{"appearance.uiScale": 90}');
    expect(prefs.uiScale).toBe(100);
    expect(settingsProblems).toEqual([{ code: "badValue", key: "appearance.uiScale", line: 1 }]);
    loadSettings('{\n  "editor.alphaNotice": false,\n  "editor.confirm": "yes"\n}');
    expect(prefs.confirm).toBe(true);
    expect(prefs.alphaNotice).toBe(false);
    expect(settingsProblems).toEqual([{ code: "badValue", key: "editor.confirm", line: 3 }]);
  });

  test.each([
    ["appearance.theme", ""],
    ["appearance.theme", 5],
    ["appearance.codeTheme", "no-such-theme"],
    ["appearance.codeTheme", 5],
    ["appearance.uiScale", "120"],
    ["appearance.uiScale", 110],
    ["game.folder", ""],
    ["game.folder", 5],
    ["game.graphicsMode", "ultra"],
    ["objects.teamColor", "mauve"],
    ["objects.teamColor", 2],
    ["objects.showHidden", "true"],
    ["editor.confirm", 1],
    ["editor.alphaNotice", null],
    ["editor.experimental", "yes"],
    ["editor.reopenLastMap", "true"],
    ["terminal.shell", ""],
    ["terminal.shell", false],
  ])("%s of %j is a bad value", (key, value) => {
    loadSettings(JSON.stringify({ [key as string]: value }));
    expect(prefs).toMatchObject(defaults);
    expect(settingsProblems).toEqual([{ code: "badValue", key, line: 1 }]);
  });

  test("a code theme from before the VS Code themes is read", () => {
    loadSettings('{"appearance.codeTheme": "one-dark"}');
    expect(prefs.codeTheme).toBe("one-dark");
    expect(settingsProblems).toEqual([]);
  });

  test("a later text replaces the earlier one, and what it leaves out is the default", () => {
    loadSettings('{"appearance.uiScale": 120, "editor.confirm": "x"}');
    loadSettings('{"objects.showHidden": true}');
    expect(prefs).toMatchObject({ ...defaults, showHidden: true });
    expect(settingsProblems).toEqual([]);
  });

  test("comments, trailing commas and a byte order mark are fine", () => {
    loadSettings('\uFEFF{\n  // big\n  "appearance.uiScale": 120, /* yes */\n}');
    expect(prefs.uiScale).toBe(120);
    expect(settingsProblems).toEqual([]);
  });

  test("a file with nothing in it is no settings", () => {
    loadSettings('{"appearance.uiScale": 120}');
    loadSettings("// soon\n");
    expect(prefs.uiScale).toBe(100);
    expect(settingsProblems).toEqual([]);
  });

  test("a text that is not JSON keeps the last values and says why", () => {
    loadSettings('{"appearance.uiScale": 120}');
    loadSettings("{\n  oops");
    expect(prefs.uiScale).toBe(120);
    expect(settingsProblems).toEqual([{ code: "notJson", line: 2 }]);
  });

  test("a text that is not an object is not settings", () => {
    loadSettings('{"appearance.uiScale": 120}');
    loadSettings("[1, 2]");
    expect(prefs.uiScale).toBe(120);
    expect(settingsProblems).toEqual([{ code: "notJson", line: 1 }]);
  });
});

describe("writing settings.json", () => {
  test("a change is edited into the file, keeping its comment", async () => {
    const app = new FakeApp();
    loadSettings('{\n  // mine\n  "editor.confirm": false\n}');
    setPref("uiScale", 120);
    expect(prefs.uiScale).toBe(120);
    await app.idle();
    expect(app.args("writeHome")).toEqual({
      file: "settings.json",
      text: '{\n  // mine\n  "editor.confirm": false,\n  "appearance.uiScale": 120\n}',
    });
  });

  test("a value back at its default is removed from the file", async () => {
    const app = new FakeApp();
    loadSettings('{\n  // mine\n  "appearance.uiScale": 120,\n  "editor.confirm": false\n}');
    setPref("uiScale", 100);
    await app.idle();
    expect(written(app)).toEqual(['{\n  // mine\n  "editor.confirm": false\n}']);
  });

  test("the team colour is written as its name", async () => {
    const app = new FakeApp();
    loadSettings("{}");
    setPref("teamColor", 2);
    await app.idle();
    expect(written(app)).toEqual(['{\n  "objects.teamColor": "teal"\n}']);
  });

  test("none for the code theme, the shell and the folder is null, and is not written", async () => {
    const app = new FakeApp();
    loadSettings("{}");
    setPref("codeTheme", "monokai");
    setPref("terminalShell", "bash");
    setPref("gameFolder", "D:/War3");
    await app.idle();
    const [, , last] = written(app);
    expect(JSON.parse(last as string)).toEqual({
      "appearance.codeTheme": "monokai",
      "terminal.shell": "bash",
      "game.folder": "D:/War3",
    });
    setPref("codeTheme", "");
    setPref("terminalShell", "");
    setPref("gameFolder", null);
    await app.idle();
    expect(JSON.parse(written(app).at(-1) as string)).toEqual({});
    expect(prefs).toMatchObject({ codeTheme: "", terminalShell: "", gameFolder: null });
  });

  test("the graphics mode, the theme and the switches are written under their keys", async () => {
    const app = new FakeApp();
    loadSettings("{}");
    setPref("graphicsMode", "sd");
    setPref("theme", "nord");
    setPref("confirm", false);
    setPref("showHidden", true);
    await app.idle();
    expect(JSON.parse(written(app).at(-1) as string)).toEqual({
      "game.graphicsMode": "sd",
      "appearance.theme": "nord",
      "editor.confirm": false,
      "objects.showHidden": true,
    });
  });

  test("an unknown key is kept, with no problem", async () => {
    const app = new FakeApp();
    loadSettings('{\n  "future.feature": [1, 2],\n  "editor.alphaNotice": false\n}');
    expect(settingsProblems).toEqual([]);
    setPref("uiScale", 120);
    await app.idle();
    expect(written(app)).toEqual([
      '{\n  "future.feature": [1, 2],\n  "editor.alphaNotice": false,\n  "appearance.uiScale": 120\n}',
    ]);
  });

  test("an unknown key that is the last one is kept as it is, array and all", async () => {
    const app = new FakeApp();
    loadSettings('{\n\t"editor.alphaNotice": false,\n\t"future.feature": [1, {"a": 2}] // soon\n}');
    setPref("uiScale", 120);
    await app.idle();
    expect(written(app)).toEqual([
      '{\n\t"editor.alphaNotice": false,\n\t"future.feature": [1, {"a": 2}], // soon\n\t"appearance.uiScale": 120\n}',
    ]);
  });

  test("a changed value stays on its line with its comment", async () => {
    const app = new FakeApp();
    loadSettings('{\n  "appearance.uiScale": 120 // laptop\n}');
    setPref("uiScale", 80);
    await app.idle();
    expect(written(app)).toEqual(['{\n  "appearance.uiScale": 80 // laptop\n}']);
  });

  test("with no file, the first change makes one under the schema", async () => {
    const app = new FakeApp();
    loadSettings(null);
    setPref("confirm", false);
    await app.idle();
    expect(written(app)).toEqual([
      '{\n  "$schema": "./schemas/settings.schema.json",\n  "editor.confirm": false\n}\n',
    ]);
    expect(JSON.parse(emptySettings)).toEqual({ $schema: "./schemas/settings.schema.json" });
  });

  test("a change that leaves the file as it is writes nothing", async () => {
    const app = new FakeApp();
    loadSettings(null);
    setPref("uiScale", 100);
    loadSettings('{"appearance.uiScale": 120}');
    setPref("uiScale", 120);
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
  });

  test("a file that can't be read as JSON is not written to", async () => {
    const app = new FakeApp();
    loadSettings("{}");
    setPref("uiScale", 120);
    loadSettings("{ oops");
    expect(prefs.uiScale).toBe(120);
    expect(settingsProblems).toMatchObject([{ code: "notJson" }]);
    setPref("uiScale", 80);
    expect(prefs.uiScale).toBe(80);
    await app.idle();
    expect(app.count("writeHome")).toBe(1);
    loadSettings('{"appearance.uiScale": 80}');
    expect(settingsProblems).toEqual([]);
    setPref("confirm", false);
    await app.idle();
    expect(app.count("writeHome")).toBe(2);
    expect(written(app).at(-1)).toBe('{"appearance.uiScale": 80, "editor.confirm": false}');
  });

  test("a file the app could not read is not written to either, until it brings its text", async () => {
    const app = new FakeApp();
    loadSettings(null, true);
    expect(settingsProblems).toEqual([{ code: "unreadable" }]);
    expect(prefs).toMatchObject(defaults);
    setPref("uiScale", 120);
    expect(prefs.uiScale).toBe(120);
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
    loadSettings('{"editor.confirm": false}');
    expect(settingsProblems).toEqual([]);
    expect(prefs).toMatchObject({ ...defaults, confirm: false });
    setPref("uiScale", 120);
    await app.idle();
    expect(written(app)).toEqual(['{"editor.confirm": false, "appearance.uiScale": 120}']);
  });

  test("a write the app refuses sets the one notice and leaves the setting changed", async () => {
    let count = 0;
    const app = new FakeApp({ writeHome: () => new Refusal("failed", `Failure ${++count}`) });
    loadSettings("{}");
    setPref("uiScale", 120);
    await waitFor(() => expect(homeNotice.text).toContain("Failure 1"));
    setPref("uiScale", 80);
    await app.idle();
    await waitFor(() => expect(app.count("writeHome")).toBe(2));
    expect(homeNotice.text).toContain("Failure 1");
    expect(homeNotice.text).not.toContain("Failure 2");
    expect(prefs.uiScale).toBe(80);
  });

  test("after a refused write the next one carries the earlier change too", async () => {
    const app = new FakeApp({ writeHome: new Refusal("failed", "Disk full") });
    loadSettings("{}");
    setPref("uiScale", 120);
    await waitFor(() => expect(homeNotice.text).not.toBe(""));
    setPref("confirm", false);
    await app.idle();
    expect(JSON.parse(written(app).at(-1) as string)).toEqual({
      "appearance.uiScale": 120,
      "editor.confirm": false,
    });
  });
});

describe("following the file", () => {
  test("another editor's save changes the settings, and the next edit builds on it", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings('{"appearance.uiScale": 120}');
    setPref("confirm", false);
    await app.idle();
    await app.emit("homeChanged", {
      file: "settings.json",
      text: '{\n  // from Rider\n  "appearance.uiScale": 80\n}',
    });
    expect(prefs.uiScale).toBe(80);
    expect(prefs.confirm).toBe(true);
    setPref("showHidden", true);
    await app.idle();
    expect(written(app).at(-1)).toBe(
      '{\n  // from Rider\n  "appearance.uiScale": 80,\n  "objects.showHidden": true\n}',
    );
    stop();
  });

  test("the page's own write coming back changes nothing", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings("{}");
    setPref("uiScale", 120);
    await app.idle();
    const [text] = written(app) as [string];
    prefs.uiScale = 80;
    await app.emit("homeChanged", { file: "settings.json", text });
    expect(prefs.uiScale).toBe(80);
    await app.emit("homeChanged", { file: "settings.json", text: text.replace("120", "90") });
    expect(prefs.uiScale).toBe(100);
    stop();
  });

  test("a late echo of an older write does not undo a newer one, nor lose it on the next change", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings("{}");
    setPref("uiScale", 120);
    setPref("uiScale", 80);
    await app.idle();
    const [first, second] = written(app) as [string, string];

    await app.emit("homeChanged", { file: "settings.json", text: first });
    expect(prefs.uiScale).toBe(80);
    setPref("confirm", false);
    await app.idle();
    expect(written(app).at(-1)).toContain('"appearance.uiScale": 80');
    expect(written(app).at(-1)).toContain('"editor.confirm": false');

    await app.emit("homeChanged", { file: "settings.json", text: second });
    expect(prefs.uiScale).toBe(80);
    expect(prefs.confirm).toBe(false);
    stop();
  });

  test("a deleted file is every default, and the next change makes a new one", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings('{"appearance.uiScale": 120}');
    await app.emit("homeChanged", { file: "settings.json", text: null });
    expect(prefs.uiScale).toBe(100);
    setPref("confirm", false);
    await app.idle();
    expect(written(app)).toEqual([
      '{\n  "$schema": "./schemas/settings.schema.json",\n  "editor.confirm": false\n}\n',
    ]);
    stop();
  });

  test("another file's change is not for the settings", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings('{"appearance.uiScale": 120}');
    await app.emit("homeChanged", { file: "hotkeys.json", text: "{}" });
    await app.emit("homeChanged", { file: "themes/settings.json", text: "{}" });
    expect(prefs.uiScale).toBe(120);
    stop();
  });

  test("a broken save shows why, and a good one after it clears it", async () => {
    const app = new FakeApp();
    const stop = watchSettings();
    loadSettings("{}");
    await app.emit("homeChanged", { file: "settings.json", text: '{ "appearance.uiScale": ' });
    expect(settingsProblems).toMatchObject([{ code: "notJson" }]);
    await app.emit("homeChanged", { file: "settings.json", text: '{ "appearance.uiScale": 80 }' });
    expect(settingsProblems).toEqual([]);
    expect(prefs.uiScale).toBe(80);
    stop();
  });
});

describe("the schema", () => {
  const { $schema: _, ...properties } = schema.properties as Record<
    string,
    Record<string, unknown>
  >;

  test("lists exactly the keys of the table, with their defaults", () => {
    expect(Object.keys(properties).sort()).toEqual(Object.keys(settingsDefaults).sort());
    for (const [key, value] of Object.entries(settingsDefaults)) {
      expect(properties[key]?.default, key).toEqual(value);
    }
  });

  test("describes every key", () => {
    for (const [key, property] of Object.entries(properties)) {
      expect(property.description, key).toBeTruthy();
    }
  });

  test("offers the values the page takes", () => {
    expect(properties["appearance.uiScale"]?.enum).toEqual(uiScales);
    expect(properties["game.graphicsMode"]?.enum).toEqual(["sd", "hd", "de"]);
    expect(properties["objects.teamColor"]?.enum).toEqual([...teamColorIds]);
    expect(properties["appearance.codeTheme"]?.enum).toEqual([
      null,
      ...codeThemes.map((each) => each.id),
    ]);
  });

  test("allows the schema's own key and no other", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toContain("$schema");
  });
});
