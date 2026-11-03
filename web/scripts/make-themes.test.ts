import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonc } from "../src/lib/home/jsonc.ts";
import { colorKeys, parseTheme } from "../src/lib/themes/format.ts";
import { editorThemeText, makeThemes, missingThemes } from "./make-themes.ts";

const kanagawa = readFileSync(
  new URL("../node_modules/tm-themes/themes/kanagawa-dragon.json", import.meta.url),
  "utf8",
);

describe("the code themes without an editor theme", () => {
  it("are the ones whose id has no file", () => {
    expect(missingThemes(["a", "b"], ["a"])).toEqual(["b"]);
  });

  it("are none when every id has a file, and keep the code themes' order", () => {
    expect(missingThemes(["a", "b"], ["b", "a", "c"])).toEqual([]);
    expect(missingThemes(["c", "a", "b"], ["a"])).toEqual(["c", "b"]);
  });
});

describe("an editor theme made from a VS Code theme", () => {
  const text = editorThemeText("kanagawa-dragon", kanagawa);

  it("starts with a comment naming the VS Code theme", () => {
    expect(
      text.startsWith('// Made from the VS Code theme "Kanagawa Dragon" in tm-themes.\n'),
    ).toBe(true);
  });

  it("reads with no problems", () => {
    const { theme, problems } = parseTheme("kanagawa-dragon", text, "shipped");
    expect(problems).toEqual([]);
    expect(theme).toMatchObject({ name: "Kanagawa Dragon", type: "dark" });
  });

  it("writes every colour", () => {
    const { value } = parseJsonc(text);
    const { colors } = value as { colors: Record<string, string> };
    expect(Object.keys(colors)).toEqual([...colorKeys]);
  });
});

describe("making the themes", () => {
  const folders = () => {
    const root = mkdtempSync(join(tmpdir(), "make-themes-"));
    const from = join(root, "tm-themes");
    mkdirSync(from);
    for (const id of ["kanagawa-dragon", "aurora-x", "dark-plus"]) {
      writeFileSync(join(from, `${id}.json`), kanagawa);
    }
    return { from, to: join(root, "themes") };
  };

  it("writes a theme for each code theme but Aurora X, and a second run writes none", () => {
    const { from, to } = folders();
    expect(makeThemes(from, to)).toEqual(["dark-plus", "kanagawa-dragon"]);
    expect(readdirSync(to)).toEqual(["dark-plus.json", "kanagawa-dragon.json"]);
    expect(makeThemes(from, to)).toEqual([]);
  });

  it("never overwrites a theme that has a file", () => {
    const { from, to } = folders();
    mkdirSync(to);
    writeFileSync(join(to, "dark-plus.json"), "tuned by hand");
    expect(makeThemes(from, to)).toEqual(["kanagawa-dragon"]);
    expect(readFileSync(join(to, "dark-plus.json"), "utf8")).toBe("tuned by hand");
  });
});
