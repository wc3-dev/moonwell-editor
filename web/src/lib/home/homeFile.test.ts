// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { FakeApp, Refusal } from "../../test/fakeApp.ts";
import { HomeFile } from "./homeFile.svelte.ts";
import { homeNotice } from "./notice.svelte.ts";

const starter = '{\n  "$schema": "./schemas/mine.schema.json"\n}\n';
const mine = () => new HomeFile("settings.json", starter);
const append = (mark: string) => (text: string) => `${text}${mark}`;
const written = (app: FakeApp) =>
  app.log
    .filter((each) => each.command === "writeHome")
    .map((each) => each.args as { file: string; text: string });

afterEach(() => {
  delete window.chrome;
  homeNotice.text = "";
});

describe("taking a text", () => {
  test("a file that is not there is an empty object, and the latest text is none", () => {
    const file = mine();
    expect(file.take(null)).toEqual({ kind: "read", root: {} });
    expect(file.text).toBeNull();
  });

  test("a text that reads is its object, and the latest text", () => {
    const file = mine();
    expect(file.take('{\n  // mine\n  "a": 1\n}')).toEqual({ kind: "read", root: { a: 1 } });
    expect(file.text).toBe('{\n  // mine\n  "a": 1\n}');
  });

  test("a file with nothing in it is an empty object", () => {
    const file = mine();
    expect(file.take("// soon\n")).toEqual({ kind: "read", root: {} });
    expect(file.text).toBe("// soon\n");
  });

  test("a text that is not JSON is broken, with why, and the latest text stays", () => {
    const file = mine();
    file.take('{"a": 1}');
    expect(file.take('{\n  "a": \n')).toEqual({
      kind: "broken",
      problems: [{ code: "notJson", line: 3 }],
    });
    expect(file.problems).toEqual([{ code: "notJson", line: 3 }]);
    expect(file.text).toBe('{"a": 1}');
  });

  test("JSON that is not an object is broken too", () => {
    expect(mine().take("[1]")).toEqual({
      kind: "broken",
      problems: [{ code: "notJson", line: 1 }],
    });
  });

  test("a file the app could not read is broken, and says so", () => {
    const file = mine();
    expect(file.take(null, true)).toEqual({ kind: "broken", problems: [{ code: "unreadable" }] });
    expect(file.problems).toEqual([{ code: "unreadable" }]);
  });

  test("a text that reads is not shown as a problem, until the caller shows its own", () => {
    const file = mine();
    file.take("{");
    file.take("{}");
    expect(file.problems).toEqual([{ code: "notJson", line: 1 }]);
    file.show([]);
    expect(file.problems).toEqual([]);
  });

  test("showing problems replaces them in the same list", () => {
    const file = mine();
    const list = file.problems;
    file.show([{ code: "badValue", key: "a" }]);
    file.show([{ code: "badValue", key: "b" }]);
    expect(file.problems).toBe(list);
    expect(list).toEqual([{ code: "badValue", key: "b" }]);
  });
});

describe("editing the file", () => {
  test("with no file, the first edit starts from the starter text and writes it", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take(null);
    file.edit(append("a"));
    await app.idle();
    expect(written(app)).toEqual([{ file: "settings.json", text: `${starter}a` }]);
    expect(file.text).toBe(`${starter}a`);
  });

  test("builds on the latest text, the file's own or the last write", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(append("1"));
    file.edit(append("2"));
    await app.idle();
    expect(written(app).map((each) => each.text)).toEqual(["{}1", "{}12"]);
  });

  test("an edit that leaves the text as it is writes nothing", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit((text) => text);
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
  });

  test("a text that is not JSON is not written to, until one comes that reads", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.take("{ oops");
    file.edit(append("a"));
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
    file.take('{"b": 1}');
    file.edit(append("a"));
    await app.idle();
    expect(written(app)).toEqual([{ file: "settings.json", text: '{"b": 1}a' }]);
  });

  test("a file the app could not read is not written to, until its text comes", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take(null, true);
    file.edit(append("a"));
    await app.idle();
    expect(app.count("writeHome")).toBe(0);
    file.take("{}");
    file.edit(append("a"));
    await app.idle();
    expect(written(app)).toEqual([{ file: "settings.json", text: "{}a" }]);
  });

  test("a write the app refuses is the latest text all the same, and says so once", async () => {
    const app = new FakeApp({ writeHome: new Refusal("failed", "Disk full") });
    const file = mine();
    file.take("{}");
    file.edit(append("1"));
    file.edit(append("2"));
    await app.idle();
    expect(written(app).map((each) => each.text)).toEqual(["{}1", "{}12"]);
    expect(file.text).toBe("{}12");
    expect(homeNotice.text).toContain("Disk full");
  });

  test("writes the file it was made for", async () => {
    const app = new FakeApp();
    const file = new HomeFile("hotkeys.json", "{}");
    file.take(null);
    file.edit(append("a"));
    await app.idle();
    expect(written(app)).toEqual([{ file: "hotkeys.json", text: "{}a" }]);
  });
});

describe("the page's own write coming back", () => {
  test("is nothing to take, and changes nothing", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    await app.idle();
    file.show([{ code: "badValue", key: "a" }]);
    expect(file.take('{"a": 1}')).toEqual({ kind: "own" });
    expect(file.problems).toEqual([{ code: "badValue", key: "a" }]);
    expect(file.text).toBe('{"a": 1}');
  });

  test("another text is read, and the same text after it is read too", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    await app.idle();
    expect(file.take('{"a": 2}')).toEqual({ kind: "read", root: { a: 2 } });
    expect(file.take('{"a": 1}')).toEqual({ kind: "read", root: { a: 1 } });
  });

  test("comes back late, after a newer write: still the page's own, and the newer text stays", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    file.edit(() => '{"a": 2}');
    await app.idle();
    file.show([{ code: "badValue", key: "a" }]);

    expect(file.take('{"a": 1}')).toEqual({ kind: "own" });
    expect(file.text).toBe('{"a": 2}');
    expect(file.problems).toEqual([{ code: "badValue", key: "a" }]);

    // The next edit builds on the newer text, so the newer change is not lost on disk.
    file.edit(append("c"));
    await app.idle();
    expect(written(app).at(-1)).toEqual({ file: "settings.json", text: '{"a": 2}c' });

    expect(file.take('{"a": 2}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 2}c')).toEqual({ kind: "own" });
    expect(file.text).toBe('{"a": 2}c');
  });

  test("an echo that skips the older writes drops them too", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    file.edit(() => '{"a": 2}');
    file.edit(() => '{"a": 3}');
    await app.idle();
    expect(file.take('{"a": 2}')).toEqual({ kind: "own" });
    expect(file.text).toBe('{"a": 3}');
    expect(file.take('{"a": 3}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 1}')).toEqual({ kind: "read", root: { a: 1 } });
    expect(file.text).toBe('{"a": 1}');
  });

  test("the same text written twice is two echoes", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    file.edit(() => '{"a": 2}');
    file.edit(() => '{"a": 1}');
    await app.idle();
    expect(file.take('{"a": 1}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 2}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 1}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 1}')).toEqual({ kind: "read", root: { a: 1 } });
  });

  test("an outside text after the echoes is taken, and an old echo after it is too", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    file.edit(() => '{"a": 2}');
    await app.idle();
    expect(file.take('{"a": 1}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 2}')).toEqual({ kind: "own" });
    expect(file.take('{"a": 3}')).toEqual({ kind: "read", root: { a: 3 } });
    expect(file.take('{"a": 1}')).toEqual({ kind: "read", root: { a: 1 } });
  });

  test("an outside text between the echoes forgets the writes before it", async () => {
    const app = new FakeApp();
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    expect(file.take('{"a": 9}')).toEqual({ kind: "read", root: { a: 9 } });
    expect(file.take('{"a": 1}')).toEqual({ kind: "read", root: { a: 1 } });
    await app.idle();
  });

  test("is not a file that could not be read, when the app says so", () => {
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    expect(file.take('{"a": 1}', true)).toEqual({
      kind: "broken",
      problems: [{ code: "unreadable" }],
    });
  });

  test("a file that is not there is not an echo", () => {
    const file = mine();
    file.take("{}");
    file.edit(() => '{"a": 1}');
    expect(file.take(null)).toEqual({ kind: "read", root: {} });
    expect(file.text).toBeNull();
  });
});
