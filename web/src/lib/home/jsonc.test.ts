import { describe, expect, it } from "vitest";
import { isBlank, isRecord, lineOfKey, parseJsonc, parseObject, setKey } from "./jsonc.ts";

describe("parseJsonc", () => {
  it("reads comments and trailing commas", () => {
    const { value, problems } = parseJsonc('{\n  // mine\n  "a": [1, 2,],\n}');
    expect(problems).toEqual([]);
    expect(value).toEqual({ a: [1, 2] });
  });

  it("gives one notJson with the line of the first mistake", () => {
    expect(parseJsonc('{\n  "a": 1,\n  oops\n}')).toEqual({
      value: undefined,
      problems: [{ code: "notJson", line: 3 }],
    });
  });

  it("reads a file that starts with a byte order mark", () => {
    const { value, problems } = parseJsonc('\uFEFF{ "a": 1 }');
    expect(problems).toEqual([]);
    expect(value).toEqual({ a: 1 });
  });
});

describe("isRecord", () => {
  it("is true for an object and false for a list, null and the rest", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("a")).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("parseObject", () => {
  it("is the object a file holds", () => {
    expect(parseObject('{\n  // mine\n  "a": 1,\n}')).toEqual({ root: { a: 1 }, problems: [] });
  });

  it("is an empty object for no file and for a file with nothing in it", () => {
    expect(parseObject(null)).toEqual({ root: {}, problems: [] });
    expect(parseObject("  // nothing yet\n")).toEqual({ root: {}, problems: [] });
  });

  it("is the one notJson problem, with the line, for a file that is not JSON", () => {
    expect(parseObject('{\n  "a": 1,\n  oops\n}')).toEqual({
      root: {},
      problems: [{ code: "notJson", line: 3 }],
    });
  });

  it("is notJson on line 1 for JSON that is not an object", () => {
    for (const text of ["[]", "5", "null", '"a"']) {
      expect(parseObject(text), text).toEqual({
        root: {},
        problems: [{ code: "notJson", line: 1 }],
      });
    }
  });
});

describe("lineOfKey", () => {
  it("counts from 1", () => {
    expect(lineOfKey('{\n  "a": 1,\n  "b": 2\n}', "b")).toBe(3);
    expect(lineOfKey('{ "a": 1 }', "nope")).toBeUndefined();
  });

  it("counts the same after a byte order mark", () => {
    expect(lineOfKey('\uFEFF{\n  "a": 1,\n  "b": 2\n}', "b")).toBe(3);
  });
});

describe("isBlank", () => {
  it("is true for nothing but white space and comments", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank(" \r\n\t")).toBe(true);
    expect(isBlank("// nothing yet\n/* or this */")).toBe(true);
    expect(isBlank("\uFEFF\n")).toBe(true);
  });

  it("is false for anything else, broken or not", () => {
    expect(isBlank("{}")).toBe(false);
    expect(isBlank("{ oops")).toBe(false);
    expect(isBlank("// a\n5")).toBe(false);
  });
});

describe("setKey", () => {
  const mine = '{\n  // mine\n  "a": 1\n}';

  it("sets a new key and keeps the comment", () => {
    const text = setKey(mine, "b", 2);
    expect(text).toBe('{\n  // mine\n  "a": 1,\n  "b": 2\n}');
    expect(parseJsonc(text).value).toEqual({ a: 1, b: 2 });
  });

  it("changes a key where it stands", () => {
    expect(setKey('{\n  "a": 1,\n  "b": 2\n}', "a", 5)).toBe('{\n  "a": 5,\n  "b": 2\n}');
  });

  describe("changing a key", () => {
    it("changes only the value, so the comment after it stays on its line", () => {
      expect(setKey('{\n  "a": 1 // laptop\n}', "a", 2)).toBe('{\n  "a": 2 // laptop\n}');
      expect(setKey('{\n  "a": 1, /* laptop */\n  "b": 2\n}', "a", 3)).toBe(
        '{\n  "a": 3, /* laptop */\n  "b": 2\n}',
      );
    });

    it("keeps the keys beside it on a line of keys", () => {
      expect(setKey('{"a":1,"b":2}', "a", 5)).toBe('{"a":5,"b":2}');
      expect(setKey('{ "a": 1, "b": "x" }', "b", null)).toBe('{ "a": 1, "b": null }');
    });

    it("changes the last of two keys of the same name, the one that counts", () => {
      expect(setKey('{ "a": 1, "a": 2 }', "a", 3)).toBe('{ "a": 1, "a": 3 }');
    });
  });

  describe("adding a key", () => {
    it("is quick when the last line has many comments before something else", () => {
      const comments = Array.from({ length: 30 }, () => "/* c */").join(" ");
      const started = performance.now();
      const result = setKey(`{\n  "a": 1 ${comments} }`, "b", 2);
      expect(performance.now() - started).toBeLessThan(500);
      expect(parseJsonc(result).value).toEqual({ a: 1, b: 2 });
    });

    it("keeps many comments on the last line where they are", () => {
      const comments = Array.from({ length: 5 }, () => "/* c */").join(" ");
      expect(setKey(`{\n  "a": 1 ${comments}\n}`, "b", 2)).toBe(
        `{\n  "a": 1, ${comments}\n  "b": 2\n}`,
      );
    });

    it("goes after the last key's comma and before its comment", () => {
      expect(setKey('{\n  "a": 1 // laptop\n}', "b", 2)).toBe(
        '{\n  "a": 1, // laptop\n  "b": 2\n}',
      );
      expect(setKey('{\n  "a": 1 /* laptop */\n}', "b", 2)).toBe(
        '{\n  "a": 1, /* laptop */\n  "b": 2\n}',
      );
    });

    it("keeps a trailing comma going, and the comment after the last key", () => {
      expect(setKey('{\n  "a": 1, // laptop\n}', "b", 2)).toBe(
        '{\n  "a": 1, // laptop\n  "b": 2,\n}',
      );
    });

    it("is indented as the file is", () => {
      expect(setKey('{\n\t"a":1,\n\t"b":2\n}', "c", 3)).toBe('{\n\t"a":1,\n\t"b":2,\n\t"c": 3\n}');
      expect(setKey('{\n    "a": 1\n}', "b", 2)).toBe('{\n    "a": 1,\n    "b": 2\n}');
    });

    it("leaves the last key's own line alone when it holds an array or an object", () => {
      expect(setKey('{\n  "a": 1,\n  "future": [1, 2]\n}', "b", 3)).toBe(
        '{\n  "a": 1,\n  "future": [1, 2],\n  "b": 3\n}',
      );
      expect(setKey('{\n  "future": {"x": [1, {"y": 2}]}\n}', "b", 3)).toBe(
        '{\n  "future": {"x": [1, {"y": 2}]},\n  "b": 3\n}',
      );
    });

    it("goes before the comments that stand after the last key", () => {
      expect(setKey('{\n  "a": 1\n  // more to come\n}', "b", 2)).toBe(
        '{\n  "a": 1,\n  "b": 2\n  // more to come\n}',
      );
    });

    it("goes after the last key on a line of keys", () => {
      expect(setKey('{ "a": 1 }', "b", 2)).toBe('{ "a": 1, "b": 2 }');
      expect(setKey('{"a":1,}', "b", 2)).toBe('{"a":1, "b": 2,}');
      expect(setKey('{\n  "a": 1, "b": 2 // laptop\n}', "c", 3)).toBe(
        '{\n  "a": 1, "b": 2, "c": 3 // laptop\n}',
      );
    });

    it("goes into an object with no key, two spaces in", () => {
      expect(setKey("{}", "a", 1)).toBe('{\n  "a": 1\n}');
      expect(setKey("{ }", "a", 1)).toBe('{\n  "a": 1\n}');
      expect(setKey("{\n}", "a", 1)).toBe('{\n  "a": 1\n}');
      expect(setKey("{\n  // mine\n}", "a", 1)).toBe('{\n  // mine\n  "a": 1\n}');
    });

    it("goes into a file with nothing but comments, or nothing at all", () => {
      expect(setKey("", "a", 1)).toBe('{\n  "a": 1\n}\n');
      expect(setKey("// soon\n", "a", 1)).toBe('// soon\n{\n  "a": 1\n}\n');
    });

    it("keeps a byte order mark, and the line ends of a file with CRLF", () => {
      expect(setKey('\uFEFF{\n  "a": 1\n}', "b", 2)).toBe('\uFEFF{\n  "a": 1,\n  "b": 2\n}');
      expect(setKey('{\r\n  "a": 1 // x\r\n}', "b", 2)).toBe(
        '{\r\n  "a": 1, // x\r\n  "b": 2\r\n}',
      );
    });

    it("follows a new file from the editor", () => {
      const starter = '{\n  "$schema": "./schemas/settings.schema.json"\n}\n';
      expect(setKey(starter, "a", 1)).toBe(
        '{\n  "$schema": "./schemas/settings.schema.json",\n  "a": 1\n}\n',
      );
    });
  });

  describe("removing a key with undefined", () => {
    it("takes the key and leaves the comment above it", () => {
      expect(setKey(mine, "a", undefined)).toBe("{\n  // mine\n}");
    });

    it("takes the first, a middle and the last key of a list", () => {
      const list = '{\n  "a": 1,\n  "b": 2,\n  "c": 3\n}';
      expect(setKey(list, "a", undefined)).toBe('{\n  "b": 2,\n  "c": 3\n}');
      expect(setKey(list, "b", undefined)).toBe('{\n  "a": 1,\n  "c": 3\n}');
      expect(setKey(list, "c", undefined)).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it("keeps the comments of the keys next to it", () => {
      const text = '{\n  "a": 1, // note a\n  // about b\n  "b": 2, // note b\n  "c": 3\n}';
      expect(setKey(text, "b", undefined)).toBe(
        '{\n  "a": 1, // note a\n  // about b\n  "c": 3\n}',
      );
      expect(setKey('{\n  "a": 1, // note a\n  "b": 2\n}', "b", undefined)).toBe(
        '{\n  "a": 1 // note a\n}',
      );
    });

    it("takes the last key of a list with a trailing comma", () => {
      expect(setKey('{\n  "a": 1,\n  "b": 2,\n}', "b", undefined)).toBe('{\n  "a": 1,\n}');
    });

    it("takes a key from a line of keys", () => {
      const line = '{ "a": 1, "b": 2 }';
      expect(setKey(line, "a", undefined)).toBe('{ "b": 2 }');
      expect(setKey(line, "b", undefined)).toBe('{ "a": 1 }');
    });

    it("keeps the file's line ends", () => {
      expect(setKey('{\r\n  "a": 1,\r\n  "b": 2\r\n}', "a", undefined)).toBe('{\r\n  "b": 2\r\n}');
    });

    it("takes every one of a key written twice, so the file no longer has it", () => {
      const line = setKey('{ "a": 1, "a": 2 }', "a", undefined);
      expect(parseJsonc(line).value).toEqual({});
      const lines = '{\n  "a": 1,\n  "b": 2,\n  "a": 3, // again\n  "c": 4\n}';
      expect(setKey(lines, "a", undefined)).toBe('{\n  "b": 2,\n  "c": 4\n}');
      expect(setKey('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}', "a", undefined)).toBe('{\n  "b": 2\n}');
    });

    it("leaves a text without the key as it is", () => {
      expect(setKey(mine, "nope", undefined)).toBe(mine);
      expect(setKey("", "nope", undefined)).toBe("");
    });
  });

  it("takes a dotted key as one key", () => {
    const text = setKey("{}", "appearance.uiScale", 120);
    expect(parseJsonc(text).value).toEqual({ "appearance.uiScale": 120 });
  });

  it("writes null, strings and booleans as JSON", () => {
    const text = setKey(setKey(setKey("{}", "a", null), "b", "x"), "c", false);
    expect(parseJsonc(text).value).toEqual({ a: null, b: "x", c: false });
  });

  it("keeps a trailing comma and the other keys' order", () => {
    const text = setKey('{\n  "b": 1, // first\n  "a": 2,\n}', "c", 3);
    expect(text).toBe('{\n  "b": 1, // first\n  "a": 2,\n  "c": 3,\n}');
  });

  it("writes into a file with nothing in it", () => {
    expect(parseJsonc(setKey("", "a", 1)).value).toEqual({ a: 1 });
  });

  it("keeps the file's line ends", () => {
    expect(setKey('{\r\n  "a": 1\r\n}', "b", 2)).toBe('{\r\n  "a": 1,\r\n  "b": 2\r\n}');
  });
});
