// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeApp } from "../../test/fakeApp.ts";
import schema from "../home/schemas/hotkeys.schema.json";
import {
  actionList,
  actionOf,
  clashes,
  defaultKeymap,
  hotkeyProblems,
  keyOf,
  loadedKeymap,
  loadHotkeys,
  readKeymap,
  saveKeymap,
  shownKey,
  watchHotkeys,
} from "./keymap.ts";

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("the keymap", () => {
  it("writes a key press as its modifiers and key", () => {
    expect(keyOf(press("n", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+N");
    expect(keyOf(press("ArrowLeft", { alt: true }))).toBe("Alt+ArrowLeft");
    expect(keyOf(press("F2"))).toBe("F2");
    expect(keyOf(press("Shift", { shift: true }))).toBeNull();
  });

  it("finds the action of a key press, World Editor's keys out of the box", () => {
    const keymap = defaultKeymap();
    expect(actionOf(press("s", { ctrl: true }), keymap)).toBe("save");
    expect(actionOf(press("Z", { ctrl: true, shift: true }), keymap)).toBe("redo");
    expect(actionOf(press("d", { ctrl: true }), keymap)).toBe("fieldIds");
    expect(actionOf(press("q", { ctrl: true }), keymap)).toBeUndefined();
  });

  it("follows a changed key and tells what else uses a key", () => {
    const keymap = defaultKeymap();
    keymap.save = ["Ctrl+Alt+S"];
    expect(actionOf(press("s", { ctrl: true }), keymap)).toBeUndefined();
    expect(actionOf(press("s", { ctrl: true, alt: true }), keymap)).toBe("save");
    expect(clashes(keymap, "save", "Ctrl+Z")).toEqual(["undo"]);
  });

  it("opens the command palette with Ctrl Shift P out of the box", () => {
    expect(actionOf(press("P", { ctrl: true, shift: true }), defaultKeymap())).toBe(
      "commandPalette",
    );
  });

  it("shows the terminal with VS Code's key out of the box, which is Ö on a Swedish keyboard", () => {
    expect(actionOf(press("`", { ctrl: true }), defaultKeymap())).toBe("terminal");
    expect(actionOf(press("ö", { ctrl: true }), defaultKeymap())).toBe("terminal");
    expect(actionOf(press("j", { ctrl: true }), defaultKeymap())).toBeUndefined();
  });

  it("finds a command that has no key until one is set", () => {
    const keymap = defaultKeymap();
    expect(keymap.showTriggers).toEqual([]);
    keymap.showTriggers = ["Ctrl+1"];
    expect(actionOf(press("1", { ctrl: true }), keymap)).toBe("showTriggers");
  });

  it("shows arrows as arrows", () => {
    expect(shownKey("Alt+ArrowRight")).toBe("Alt →");
  });
});

describe("reading hotkeys.json", () => {
  it("no file is every default", () => {
    expect(readKeymap(null)).toEqual({ keymap: defaultKeymap(), problems: [] });
  });

  it("a file with nothing in it is every default", () => {
    expect(readKeymap("  // nothing yet\n")).toEqual({ keymap: defaultKeymap(), problems: [] });
  });

  it("changes only the command it names", () => {
    const { keymap, problems } = readKeymap('{"save": ["Ctrl+Alt+S"]}');
    expect(keymap).toEqual({ ...defaultKeymap(), save: ["Ctrl+Alt+S"] });
    expect(problems).toEqual([]);
  });

  it("an empty list takes a command's default key away", () => {
    expect(readKeymap('{"undo": []}').keymap.undo).toEqual([]);
    expect(readKeymap('{"kindUnit": []}').keymap.kindUnit).toEqual([]);
  });

  it("takes several keys, comments, trailing commas, the schema line and a byte order mark", () => {
    const { keymap, problems } = readKeymap(`﻿{
      "$schema": "./schemas/hotkeys.schema.json",
      // like VS Code
      "commandPalette": ["Ctrl+Shift+P", "F1"], /* both */
    }`);
    expect(keymap.commandPalette).toEqual(["Ctrl+Shift+P", "F1"]);
    expect(problems).toEqual([]);
  });

  it("a command that does not exist is a warning and is skipped", () => {
    const { keymap, problems } = readKeymap('{\n  "save": ["F5"],\n  "nope": ["F1"]\n}');
    expect(problems).toEqual([{ code: "unknownKey", key: "nope", line: 3 }]);
    expect(keymap).toEqual({ ...defaultKeymap(), save: ["F5"] });
  });

  it("a value that is not a list of strings is a warning and is skipped", () => {
    const { keymap, problems } = readKeymap(
      '{\n  "save": "Ctrl+S",\n  "undo": ["Ctrl+Z", 3],\n  "redo": null,\n  "copy": ["F3"]\n}',
    );
    expect(problems).toEqual([
      { code: "badValue", key: "save", line: 2 },
      { code: "badValue", key: "undo", line: 3 },
      { code: "badValue", key: "redo", line: 4 },
    ]);
    expect(keymap).toEqual({ ...defaultKeymap(), copy: ["F3"] });
  });

  it("a file that is not JSON gives the one problem and the defaults", () => {
    expect(readKeymap('{\n  "save": [\n')).toEqual({
      keymap: defaultKeymap(),
      problems: [{ code: "notJson", line: 3 }],
    });
    expect(readKeymap("[]").problems).toEqual([{ code: "notJson", line: 1 }]);
  });
});

describe("the schema", () => {
  const { $schema: _, ...properties } = schema.properties as Record<
    string,
    Record<string, unknown>
  >;

  it("lists exactly the ids in the action list, with their keys", () => {
    expect(Object.keys(properties)).toEqual(actionList.map((each) => each.action));
    for (const each of actionList) {
      expect(properties[each.action]?.default, each.action).toEqual(each.keys);
    }
  });

  it("describes every command with its name, as a list of strings", () => {
    for (const each of actionList) {
      const property = properties[each.action];
      expect(property?.description, each.action).toContain(each.name);
      expect(property?.type, each.action).toBe("array");
      expect(property?.items, each.action).toEqual({ type: "string" });
    }
  });

  it("allows the schema's own line and no other key", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toContain("$schema");
  });
});

const written = (app: FakeApp): string[] =>
  app.log
    .filter((each) => each.command === "writeHome")
    .map((each) => {
      const { file, text } = each.args as { file: string; text: string };
      expect(file).toBe("hotkeys.json");
      return text;
    });

describe("hotkeys.json in the editor", () => {
  beforeEach(() => loadHotkeys(null));

  afterEach(() => {
    delete window.chrome;
    loadHotkeys(null);
  });

  describe("loading it", () => {
    it("gives the keymap the text names and says what is wrong with it", () => {
      expect(loadHotkeys('{"save": ["F5"], "nope": []}')).toEqual({
        ...defaultKeymap(),
        save: ["F5"],
      });
      expect(hotkeyProblems).toEqual([{ code: "unknownKey", key: "nope", line: 1 }]);
      expect(loadHotkeys(null)).toEqual(defaultKeymap());
      expect(hotkeyProblems).toEqual([]);
    });

    it("a file that is not JSON gives no keymap, so the keys stay as they are", () => {
      loadHotkeys('{"save": ["F5"]}');
      expect(loadHotkeys('{"save": [')).toBeUndefined();
      expect(hotkeyProblems).toMatchObject([{ code: "notJson" }]);
      expect(loadHotkeys('{"save": ["F6"]}')?.save).toEqual(["F6"]);
      expect(hotkeyProblems).toEqual([]);
    });

    it("a file the app could not read gives none either", () => {
      expect(loadHotkeys(null, true)).toBeUndefined();
      expect(hotkeyProblems).toEqual([{ code: "unreadable" }]);
    });
  });

  describe("the keymap the editor starts from", () => {
    it("is the defaults until a file has been loaded", () => {
      expect(loadedKeymap()).toEqual(defaultKeymap());
    });

    it("is what the last file that could be read made", () => {
      loadHotkeys('{"save": ["F5"]}');
      expect(loadedKeymap()).toEqual({ ...defaultKeymap(), save: ["F5"] });
      loadHotkeys('{"undo": []}');
      expect(loadedKeymap()).toEqual({ ...defaultKeymap(), undo: [] });
      loadHotkeys(null);
      expect(loadedKeymap()).toEqual(defaultKeymap());
    });

    it("stays as it is for a file that is not JSON and for one the app could not read", () => {
      loadHotkeys('{"save": ["F5"]}');
      loadHotkeys('{"save": [');
      expect(loadedKeymap().save).toEqual(["F5"]);
      loadHotkeys(null, true);
      expect(loadedKeymap().save).toEqual(["F5"]);
    });

    it("is a copy, so changing it changes nothing here", () => {
      loadHotkeys('{"save": ["F5"]}');
      loadedKeymap().save.push("F6");
      expect(loadedKeymap().save).toEqual(["F5"]);
    });
  });

  describe("saving the keymap", () => {
    it("with no file, the first change makes one under the schema, with only that command", async () => {
      const app = new FakeApp();
      loadHotkeys(null);
      saveKeymap({ ...defaultKeymap(), kindUnit: ["Alt+1"] });
      await app.idle();
      expect(written(app)).toEqual([
        '{\n  "$schema": "./schemas/hotkeys.schema.json",\n  "kindUnit": ["Alt+1"]\n}\n',
      ]);
    });

    it("keeps a comment, and adds only the command that changed", async () => {
      const app = new FakeApp();
      loadHotkeys('{\n  // my keys\n  "save": ["Ctrl+Alt+S"]\n}');
      saveKeymap({ ...defaultKeymap(), save: ["Ctrl+Alt+S"], kindUnit: ["Alt+1"] });
      await app.idle();
      expect(written(app)).toEqual([
        '{\n  // my keys\n  "save": ["Ctrl+Alt+S"],\n  "kindUnit": ["Alt+1"]\n}',
      ]);
    });

    it("changes a command's keys where they are, and takes a default key away with a list", async () => {
      const app = new FakeApp();
      loadHotkeys('{\n  "save": ["Ctrl+Alt+S"] // mine\n}');
      saveKeymap({ ...defaultKeymap(), save: ["F5"], undo: [] });
      await app.idle();
      expect(written(app)).toEqual(['{\n  "save": ["F5"], // mine\n  "undo": []\n}']);
    });

    it("a command put back to its keys is taken out of the file", async () => {
      const app = new FakeApp();
      loadHotkeys('{\n  // mine\n  "save": ["Ctrl+Alt+S"],\n  "kindUnit": ["Alt+1"]\n}');
      saveKeymap({ ...defaultKeymap(), kindUnit: ["Alt+1"] });
      await app.idle();
      expect(written(app)).toEqual(['{\n  // mine\n  "kindUnit": ["Alt+1"]\n}']);
    });

    it("leaves alone what the file says and the editor did not change", async () => {
      const app = new FakeApp();
      loadHotkeys('{\n  "future": [1],\n  "redo": "Ctrl+Y",\n  "save": ["F5"]\n}');
      const keymap = readKeymap('{"save": ["F5"]}').keymap;
      saveKeymap({ ...keymap, kindUnit: ["Alt+1"] });
      await app.idle();
      expect(written(app)).toEqual([
        '{\n  "future": [1],\n  "redo": "Ctrl+Y",\n  "save": ["F5"],\n  "kindUnit": ["Alt+1"]\n}',
      ]);
    });

    it("every command back to its keys leaves a file with no commands in it", async () => {
      const app = new FakeApp();
      loadHotkeys('{\n  "save": ["F5"],\n  "undo": []\n}');
      saveKeymap(defaultKeymap());
      await app.idle();
      expect(written(app)).toEqual(["{\n}"]);
    });

    it("a change that leaves the file as it is writes nothing", async () => {
      const app = new FakeApp();
      loadHotkeys(null);
      saveKeymap(defaultKeymap());
      loadHotkeys('{"save": ["F5"]}');
      saveKeymap({ ...defaultKeymap(), save: ["F5"] });
      await app.idle();
      expect(app.count("writeHome")).toBe(0);
    });

    it("builds on the latest text, also when it was the editor's own write", async () => {
      const app = new FakeApp();
      loadHotkeys(null);
      saveKeymap({ ...defaultKeymap(), save: ["F5"] });
      saveKeymap({ ...defaultKeymap(), save: ["F5"], undo: [] });
      await app.idle();
      expect(written(app).at(-1)).toBe(
        '{\n  "$schema": "./schemas/hotkeys.schema.json",\n  "save": ["F5"],\n  "undo": []\n}\n',
      );
    });

    it("a file that is not JSON is not written to, until a text that can be read arrives", async () => {
      const app = new FakeApp();
      loadHotkeys('{"save": ["F5"]}');
      expect(loadHotkeys("{ oops")).toBeUndefined();
      saveKeymap({ ...defaultKeymap(), undo: [] });
      await app.idle();
      expect(app.count("writeHome")).toBe(0);
      loadHotkeys('{"save": ["F5"]}');
      saveKeymap({ ...defaultKeymap(), save: ["F5"], undo: [] });
      await app.idle();
      expect(written(app)).toEqual(['{"save": ["F5"], "undo": []}']);
    });

    it("a file the app could not read is not written to either, until it brings its text", async () => {
      const app = new FakeApp();
      loadHotkeys(null, true);
      saveKeymap({ ...defaultKeymap(), undo: [] });
      await app.idle();
      expect(app.count("writeHome")).toBe(0);
      loadHotkeys('{"redo": []}');
      saveKeymap({ ...defaultKeymap(), redo: [], undo: [] });
      await app.idle();
      expect(written(app)).toEqual(['{"redo": [], "undo": []}']);
    });
  });

  describe("following the file", () => {
    it("a save made elsewhere gives the new keymap, and the next change builds on it", async () => {
      const app = new FakeApp();
      const seen: string[][] = [];
      const stop = watchHotkeys((keymap) => seen.push(keymap.save));
      loadHotkeys('{"save": ["F5"]}');
      await app.emit("homeChanged", {
        file: "hotkeys.json",
        text: '{\n  // from Rider\n  "save": ["F6"]\n}',
      });
      expect(seen).toEqual([["F6"]]);
      saveKeymap({ ...defaultKeymap(), save: ["F6"], undo: [] });
      await app.idle();
      expect(written(app)).toEqual(['{\n  // from Rider\n  "save": ["F6"],\n  "undo": []\n}']);
      stop();
    });

    it("the page's own write coming back changes nothing", async () => {
      const app = new FakeApp();
      const seen: string[][] = [];
      const stop = watchHotkeys((keymap) => seen.push(keymap.save));
      loadHotkeys("{}");
      saveKeymap({ ...defaultKeymap(), save: ["F5"] });
      await app.idle();
      await app.emit("homeChanged", { file: "hotkeys.json", text: written(app)[0] ?? null });
      expect(seen).toEqual([]);
      stop();
    });

    it("a deleted file is every default", async () => {
      const app = new FakeApp();
      const seen: string[][] = [];
      const stop = watchHotkeys((keymap) => seen.push(keymap.save));
      loadHotkeys('{"save": ["F5"]}');
      await app.emit("homeChanged", { file: "hotkeys.json", text: null });
      expect(seen).toEqual([["Ctrl+S"]]);
      stop();
    });

    it("a broken save keeps the keys and shows why", async () => {
      const app = new FakeApp();
      const seen: string[][] = [];
      const stop = watchHotkeys((keymap) => seen.push(keymap.save));
      loadHotkeys('{"save": ["F5"]}');
      await app.emit("homeChanged", { file: "hotkeys.json", text: '{"save": ' });
      expect(seen).toEqual([]);
      expect(hotkeyProblems).toMatchObject([{ code: "notJson" }]);
      stop();
    });

    it("another file's change is not for the hotkeys", async () => {
      const app = new FakeApp();
      const seen: string[][] = [];
      const stop = watchHotkeys((keymap) => seen.push(keymap.save));
      await app.emit("homeChanged", { file: "settings.json", text: '{"save": ["F5"]}' });
      expect(seen).toEqual([]);
      stop();
    });
  });
});
