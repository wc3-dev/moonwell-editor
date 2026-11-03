import { describe, expect, it } from "vitest";
import schema from "../home/schemas/theme.schema.json";
import { flattened } from "./color.ts";
import { fillColors } from "./fill.ts";
import { colorKeys, parseTheme, requiredKeys, themeText } from "./format.ts";

const fileOf = (
  colors: Record<string, string>,
  rest = '"name": "Sample", "type": "dark"',
): string => `{ ${rest}, "colors": ${JSON.stringify(colors)} }`;

const four = {
  "background.base": "#0d0c0c",
  "background.panel": "#181616",
  "text.normal": "#c5c9c5",
  "accent.normal": "#8ba4b0",
};

describe("the colour keys", () => {
  it("are 47, with the four required ones among them", () => {
    expect(colorKeys).toHaveLength(47);
    expect(new Set(colorKeys).size).toBe(47);
    expect(requiredKeys).toEqual([
      "background.base",
      "background.panel",
      "text.normal",
      "accent.normal",
    ]);
    for (const key of requiredKeys) expect(colorKeys).toContain(key);
  });
});

describe("reading a theme file", () => {
  it("loads one with only the four required colours, and works out the rest", () => {
    const { theme, problems } = parseTheme("sample", fileOf(four), "user");
    expect(problems).toEqual([]);
    expect(theme).not.toBeNull();
    expect(Object.keys(theme?.colors ?? {})).toHaveLength(47);
    expect(theme?.colors).toEqual(fillColors("dark", four));
    expect(theme).toMatchObject({ id: "sample", name: "Sample", type: "dark", source: "user" });
    expect(theme?.problems).toEqual([]);
  });

  it("loads one with comments and trailing commas", () => {
    const text = `// A theme of mine.
{
  "$schema": "../schemas/theme.schema.json", // for Rider
  "name": "Mine",
  "type": "light",
  /* The four. */
  "colors": {
    "background.base": "#eeeeee",
    "background.panel": "#ffffff",
    "text.normal": "#202020",
    "accent.normal": "#006ab1",
  },
}
`;
    const { theme, problems } = parseTheme("mine", text, "shipped");
    expect(problems).toEqual([]);
    expect(theme?.type).toBe("light");
    expect(theme?.source).toBe("shipped");
  });

  it("sets the colours it is given as written", () => {
    const { theme } = parseTheme("sample", fileOf({ ...four, "text.muted": "#202020" }), "user");
    expect(theme?.colors["text.muted"]).toBe("#202020");
  });
});

describe("refusing a theme file", () => {
  it("refuses one missing a required colour", () => {
    const { "accent.normal": _, ...three } = four;
    const { theme, problems } = parseTheme("sample", fileOf(three), "user");
    expect(theme).toBeNull();
    expect(problems).toContainEqual({ code: "missing", key: "accent.normal" });
  });

  it("names every required colour that is missing", () => {
    const { theme, problems } = parseTheme("sample", '{ "name": "Bare", "type": "dark" }', "user");
    expect(theme).toBeNull();
    expect(problems.filter((problem) => problem.code === "missing").map((p) => p.key)).toEqual([
      ...requiredKeys,
    ]);
  });

  it("refuses one without a name", () => {
    const { theme, problems } = parseTheme("sample", fileOf(four, '"type": "dark"'), "user");
    expect(theme).toBeNull();
    expect(problems.map((problem) => problem.code)).toContain("noName");
  });

  it("refuses one with a name that is not text, or empty", () => {
    for (const name of ["5", '""', '"  "']) {
      const { theme, problems } = parseTheme(
        "sample",
        fileOf(four, `"name": ${name}, "type": "dark"`),
        "user",
      );
      expect(theme, name).toBeNull();
      expect(
        problems.map((problem) => problem.code),
        name,
      ).toContain("noName");
    }
  });

  it("refuses one with a type that is not dark or light", () => {
    const { theme, problems } = parseTheme(
      "sample",
      fileOf(four, '"name": "Sample", "type": "blue"'),
      "user",
    );
    expect(theme).toBeNull();
    expect(problems).toContainEqual({ code: "badType", line: 1 });
  });

  it("refuses one without a type", () => {
    const { theme, problems } = parseTheme("sample", fileOf(four, '"name": "Sample"'), "user");
    expect(theme).toBeNull();
    expect(problems.map((problem) => problem.code)).toContain("badType");
  });

  it("refuses text that is not JSON, with the line of the mistake", () => {
    const { theme, problems } = parseTheme("sample", "{ oops", "user");
    expect(theme).toBeNull();
    expect(problems).toEqual([{ code: "notJson", line: 1 }]);
    const later = parseTheme("sample", '{\n  "name": "Sample"\n  "type": "dark"\n}', "user");
    expect(later.problems).toEqual([{ code: "notJson", line: 3 }]);
  });

  it("refuses an empty file, and a file that is not an object", () => {
    for (const text of ["", "[]", "5", "null"]) {
      const { theme, problems } = parseTheme("sample", text, "user");
      expect(theme, text).toBeNull();
      expect(problems.length, text).toBeGreaterThan(0);
    }
  });

  it("refuses one whose required colour is not a colour", () => {
    const { theme, problems } = parseTheme(
      "sample",
      fileOf({ ...four, "accent.normal": "blue" }),
      "user",
    );
    expect(theme).toBeNull();
    expect(problems).toContainEqual({ code: "badColor", key: "accent.normal", line: 1 });
  });
});

describe("a theme file with warnings", () => {
  const lined = (colors: Record<string, string>): string =>
    `{\n  "name": "Sample",\n  "type": "dark",\n  "colors": ${JSON.stringify(colors, null, 2)}\n}\n`;

  it("loads one with a colour that is not a hex colour, and works that colour out", () => {
    const text = lined({ ...four, "text.muted": "grey" });
    const { theme, problems } = parseTheme("sample", text, "user");
    const line = text.split("\n").findIndex((each) => each.includes('"text.muted"')) + 1;
    expect(problems).toEqual([{ code: "badColor", key: "text.muted", line }]);
    expect(theme?.colors["text.muted"]).toBe(fillColors("dark", four)["text.muted"]);
    expect(theme?.problems).toEqual(problems);
  });

  it("loads one with a colour that is not text", () => {
    const text = '{ "name": "S", "type": "dark", "colors": { "text.muted": 5 } }';
    const { problems } = parseTheme("sample", text, "user");
    expect(problems).toContainEqual({ code: "badColor", key: "text.muted", line: 1 });
  });

  it("loads one with a key the editor does not know, and ignores that key", () => {
    const text = lined({ ...four, "panel.background": "#000" });
    const { theme, problems } = parseTheme("sample", text, "user");
    const line = text.split("\n").findIndex((each) => each.includes('"panel.background"')) + 1;
    expect(problems).toEqual([{ code: "unknownKey", key: "panel.background", line }]);
    expect(theme).not.toBeNull();
    expect(Object.keys(theme?.colors ?? {})).toEqual([...colorKeys]);
    expect(theme?.colors).toEqual(fillColors("dark", four));
  });

  it("loads one with a key at the top the editor does not know", () => {
    const text = '{ "name": "S", "type": "dark", "extends": "other", "colors": {} }';
    const { theme, problems } = parseTheme(
      "sample",
      text.replace("{}", JSON.stringify(four)),
      "user",
    );
    expect(theme).not.toBeNull();
    expect(problems).toEqual([{ code: "unknownKey", key: "extends", line: 1 }]);
  });

  it("lets the schema key stand", () => {
    const text = `{ "$schema": "x", "name": "S", "type": "dark", "colors": ${JSON.stringify(four)} }`;
    expect(parseTheme("sample", text, "user").problems).toEqual([]);
  });
});

describe("a theme file's colour values", () => {
  it("expands #rgb", () => {
    const { theme } = parseTheme("sample", fileOf({ ...four, "text.muted": "#abc" }), "user");
    expect(theme?.colors["text.muted"]).toBe("#aabbcc");
  });

  it("lays #rrggbbaa over the panel", () => {
    const { theme } = parseTheme(
      "sample",
      fileOf({ ...four, "background.hover": "#ffffff20" }),
      "user",
    );
    expect(theme?.colors["background.hover"]).toBe(flattened("#ffffff20", "#181616"));
  });

  it("lays the panel over the base", () => {
    const { theme } = parseTheme(
      "sample",
      fileOf({ ...four, "background.panel": "#ffffff20" }),
      "user",
    );
    expect(theme?.colors["background.panel"]).toBe(flattened("#ffffff20", "#0d0c0c"));
  });

  it("lays the base over black for a dark theme and white for a light one", () => {
    const see = { ...four, "background.base": "#80808080" };
    expect(parseTheme("sample", fileOf(see), "user").theme?.colors["background.base"]).toBe(
      flattened("#80808080", "#000000"),
    );
    const light = parseTheme("sample", fileOf(see, '"name": "Sample", "type": "light"'), "user");
    expect(light.theme?.colors["background.base"]).toBe(flattened("#80808080", "#ffffff"));
  });

  it("writes upper case colours in lower case", () => {
    const { theme } = parseTheme("sample", fileOf({ ...four, "text.muted": "#ABCDEF" }), "user");
    expect(theme?.colors["text.muted"]).toBe("#abcdef");
  });
});

describe("writing a theme file", () => {
  const { theme } = parseTheme("sample", fileOf({ ...four, "text.muted": "#a6a9a6" }), "user");

  it("reads back to the same colours", () => {
    if (!theme) throw new Error("the sample did not load");
    const again = parseTheme("sample", themeText(theme), "user");
    expect(again.problems).toEqual([]);
    expect(again.theme?.colors).toEqual(theme.colors);
    expect(again.theme).toMatchObject({ name: theme.name, type: theme.type });
  });

  it("writes every colour in the order of the keys, 2-space indented, under the schema", () => {
    if (!theme) throw new Error("the sample did not load");
    const text = themeText(theme);
    expect(text).toMatch(/^\{\n {2}"\$schema": "\.\.\/schemas\/theme\.schema\.json",\n/);
    expect(text.endsWith("}\n")).toBe(true);
    const written = [...text.matchAll(/^ {4}"([^"]+)": "#[0-9a-f]{6}",?$/gm)].map(
      (each) => each[1],
    );
    expect(written).toEqual([...colorKeys]);
  });

  it("starts with the header as comments", () => {
    if (!theme) throw new Error("the sample did not load");
    const text = themeText(theme, "Made from Kanagawa Dragon.\n\nBy hand.");
    expect(text.startsWith("// Made from Kanagawa Dragon.\n//\n// By hand.\n{\n")).toBe(true);
    const again = parseTheme("sample", text, "user");
    expect(again.problems).toEqual([]);
    expect(again.theme?.colors).toEqual(theme.colors);
  });

  it("keeps a name with quotes", () => {
    if (!theme) throw new Error("the sample did not load");
    const named = { ...theme, name: 'My "best" theme' };
    expect(parseTheme("sample", themeText(named), "user").theme?.name).toBe('My "best" theme');
  });
});

describe("the theme schema", () => {
  const colors = schema.properties.colors;

  it("lists exactly the colour keys, in order", () => {
    expect(Object.keys(colors.properties)).toEqual([...colorKeys]);
  });

  it("requires the four colours, the name and the type", () => {
    expect(colors.required).toEqual([...requiredKeys]);
    expect(schema.required).toEqual(["name", "type", "colors"]);
  });

  it("gives the type as dark or light, and every colour a description and the hex pattern", () => {
    expect(schema.properties.type.enum).toEqual(["dark", "light"]);
    for (const key of colorKeys) {
      const property = colors.properties[key];
      expect(property.description, key).toBeTruthy();
      expect(property.type, key).toBe("string");
      const hex = new RegExp(property.pattern);
      expect(hex.test("#aabbcc80"), key).toBe(true);
      expect(hex.test("red"), key).toBe(false);
    }
  });
});
