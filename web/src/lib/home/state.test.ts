// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeApp } from "../../test/fakeApp.ts";
import { loadState, setState, stateOf, stateStore } from "./state.svelte.ts";

const isNumber = (value: unknown): value is number => typeof value === "number";
const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;
const isList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === "string");

beforeEach(() => loadState(null));

afterEach(() => {
  delete window.chrome;
  loadState(null);
});

describe("reading state.json", () => {
  test("a key that is not there is the fallback", () => {
    loadState('{"terminalHeight": 300}');
    expect(stateOf("favourites", {}, isObject)).toEqual({});
    loadState(null);
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(240);
  });

  test("a value that fits is what the file says", () => {
    loadState('{"terminalHeight": 300, "tooltipColours": ["#112233"]}');
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(300);
    expect(stateOf("tooltipColours", [], isList)).toEqual(["#112233"]);
  });

  test("a value that does not fit is the fallback, and the rest is kept", () => {
    loadState('{"terminalHeight": "tall", "tooltipColours": ["#112233"]}');
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(240);
    expect(stateOf("tooltipColours", [], isList)).toEqual(["#112233"]);
  });

  test("a file that is not JSON, or not an object, holds nothing", () => {
    loadState('{"terminalHeight": 300}');
    loadState("{nope");
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(240);
    loadState('{"terminalHeight": 300}');
    loadState("[300]");
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(240);
  });

  test("takes comments and a byte order mark, as the page's other files do", () => {
    loadState('\uFEFF{\n  // the editor does not write these\n  "terminalHeight": 300,\n}');
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(300);
  });

  test("loading again forgets what the last text held", () => {
    loadState('{"terminalHeight": 300}');
    loadState("{}");
    expect(stateOf("terminalHeight", 240, isNumber)).toBe(240);
  });
});

describe("setState", () => {
  test("sends the key and the value to the app", async () => {
    const app = new FakeApp();
    setState("terminalHeight", 300);
    await app.idle();
    expect(app.log).toEqual([{ command: "setState", args: { key: "terminalHeight", value: 300 } }]);
  });

  test("is the value at once, with no wait for the app", () => {
    new FakeApp();
    setState("favourites", { unit: ["ugol"] });
    expect(stateOf("favourites", {}, isObject)).toEqual({ unit: ["ugol"] });
  });

  test("keeps the other keys, recent maps among them, and sends only its own", async () => {
    const app = new FakeApp();
    loadState('{"recentMaps": ["C:/Maps/Arena"], "terminalHeight": 300}');
    setState("terminalHeight", 320);
    await app.idle();
    expect(app.log.map((each) => each.args)).toEqual([{ key: "terminalHeight", value: 320 }]);
    expect(stateStore.getItem("recentMaps")).toBe('["C:/Maps/Arena"]');
  });
});

describe("stateStore", () => {
  test("gives a key's value as JSON text, and null for a key that is not there", () => {
    loadState('{"objectEditor.columns.unit": [{"field": "ulum", "level": 0}]}');
    expect(JSON.parse(stateStore.getItem("objectEditor.columns.unit") as string)).toEqual([
      { field: "ulum", level: 0 },
    ]);
    expect(stateStore.getItem("objectEditor.columns.item")).toBeNull();
  });

  test("keeps the value a text holds, and sends it", async () => {
    const app = new FakeApp();
    stateStore.setItem("objectEditor.columns.unit", '[{"field":"ulum","level":0}]');
    await app.idle();
    expect(app.args("setState")).toEqual({
      key: "objectEditor.columns.unit",
      value: [{ field: "ulum", level: 0 }],
    });
    expect(stateStore.getItem("objectEditor.columns.unit")).toBe('[{"field":"ulum","level":0}]');
  });

  test("a text that is not JSON is left out", async () => {
    const app = new FakeApp();
    stateStore.setItem("objectEditor.columns.unit", "{nope");
    await app.idle();
    expect(app.count("setState")).toBe(0);
    expect(stateStore.getItem("objectEditor.columns.unit")).toBeNull();
  });
});
