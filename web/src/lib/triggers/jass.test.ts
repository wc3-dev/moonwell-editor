import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { jass } from "./jass.ts";

/** Each token of a text that has a style, as `[text, style]`. */
function tokens(text: string): [string, string][] {
  if (!jass.startState) throw new Error("no start state");
  const state = jass.startState(2);
  const found: [string, string][] = [];
  for (const line of text.split("\n")) {
    const stream = new StringStream(line, 4, 2);
    while (!stream.eol()) {
      const style = jass.token(stream, state);
      if (style) found.push([stream.current(), style]);
      stream.start = stream.pos;
    }
  }
  return found;
}

function styleOf(text: string, word: string): string | undefined {
  return tokens(text).find(([token]) => token === word)?.[1];
}

describe("jass", () => {
  it("knows a function's words, its name and its parameters' types", () => {
    expect(tokens("function Boom takes integer a, unit b returns nothing")).toEqual([
      ["function", "keyword"],
      ["Boom", "def"],
      ["takes", "keyword"],
      ["integer", "type"],
      ["a", "def"],
      [",", "operator"],
      ["unit", "type"],
      ["b", "def"],
      ["returns", "keyword"],
      ["nothing", "keyword"],
    ]);
  });

  it("knows a return type", () => {
    expect(styleOf("function Boom takes nothing returns boolean", "boolean")).toBe("type");
  });

  it("knows a native's name", () => {
    expect(
      styleOf("constant native GetTriggerUnit takes nothing returns unit", "GetTriggerUnit"),
    ).toBe("def");
    expect(styleOf("constant native GetTriggerUnit takes nothing returns unit", "unit")).toBe(
      "type",
    );
  });

  it("knows a local's type and name", () => {
    expect(tokens("local unit array hero")).toEqual([
      ["local", "keyword"],
      ["unit", "type"],
      ["array", "keyword"],
      ["hero", "def"],
    ]);
  });

  it("knows a global's type and name, also a constant one", () => {
    const text =
      "globals\n  timer clock = null\n  constant real speed = 2.5\nendglobals\nset clock = null";
    expect(styleOf(text, "timer")).toBe("type");
    expect(styleOf(text, "real")).toBe("type");
    expect(styleOf(text, "speed")).toBe("def");
    expect(styleOf(text, "endglobals")).toBe("keyword");
    expect(tokens("globals\nendglobals\nclock")).toEqual([
      ["globals", "keyword"],
      ["endglobals", "keyword"],
    ]);
  });

  it("knows a type declared", () => {
    expect(tokens("type unit extends widget")).toEqual([
      ["type", "keyword"],
      ["unit", "def"],
      ["extends", "keyword"],
      ["widget", "type"],
    ]);
  });

  it("knows a call by its bracket", () => {
    expect(tokens("call KillUnit (GetTriggerUnit())").slice(0, 3)).toEqual([
      ["call", "keyword"],
      ["KillUnit", "call"],
      ["(", "operator"],
    ]);
  });

  it("marks the variables and placed things of World Editor", () => {
    expect(styleOf("set udg_Worm = gg_unit_hfoo_0001", "udg_Worm")).toBe("global");
    expect(styleOf("set udg_Worm = gg_unit_hfoo_0001", "gg_unit_hfoo_0001")).toBe("global");
  });

  it("leaves a plain name alone", () => {
    expect(tokens("set total = iffy")).toEqual([
      ["set", "keyword"],
      ["=", "operator"],
    ]);
  });

  it("knows true, false and null", () => {
    expect(tokens("true false null").map(([, style]) => style)).toEqual(["atom", "atom", "atom"]);
  });

  it("reads a comment to the end of its line", () => {
    expect(tokens('// set "x"')).toEqual([['// set "x"', "comment"]]);
  });

  it("reads a string past an escaped quote and what looks like a comment", () => {
    expect(tokens('"a \\" // b"')).toEqual([['"a \\" // b"', "string"]]);
  });

  it("carries a string over to the next line", () => {
    expect(tokens('"one\ntwo" set')).toEqual([
      ['"one', "string"],
      ['two"', "string"],
      ["set", "keyword"],
    ]);
  });

  it("reads a four-letter code and a one-letter one as numbers", () => {
    expect(tokens("'hfoo' 'A' '\\''")).toEqual([
      ["'hfoo'", "number"],
      ["'A'", "number"],
      ["'\\''", "number"],
    ]);
  });

  it("reads every form of number", () => {
    expect(tokens("12 017 1.5 .5 2. 0x1F $FF").map(([token]) => token)).toEqual([
      "12",
      "017",
      "1.5",
      ".5",
      "2.",
      "0x1F",
      "$FF",
    ]);
    expect(new Set(tokens("12 017 1.5 .5 2. 0x1F $FF").map(([, style]) => style))).toEqual(
      new Set(["number"]),
    );
  });

  it("takes two-character operators whole", () => {
    expect(tokens("a == b != c <= d >= e").map(([token]) => token)).toEqual([
      "==",
      "!=",
      "<=",
      ">=",
    ]);
  });

  it("goes on past a character it does not know", () => {
    expect(tokens("# set")).toEqual([["set", "keyword"]]);
  });
});
