import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCodeTheme,
  type CodeTheme,
  codeColors,
  codeThemeOf,
  codeThemes,
  codeTokens,
} from "./codeThemes.ts";
import { defaultTheme, themeOf, themes } from "./themes.ts";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8").toLowerCase();

const dracula = themeOf("dracula");
const nord = themeOf("nord");
const named = (id: string) => codeThemes.find((each) => each.id === id) as CodeTheme;

describe("the code themes", () => {
  it("are VS Code's own, dark and light", () => {
    const names = codeThemes.map((each) => each.name);
    for (const name of ["Dracula Theme", "Dark Plus", "Monokai", "GitHub Dark", "Light Plus"]) {
      expect(names).toContain(name);
    }
  });

  it("leave Aurora X out, for its GPL", () => {
    expect(codeThemes.map((each) => each.id)).not.toContain("aurora-x");
  });

  it("put the dark ones first", () => {
    const types = codeThemes.map((each) => each.type);
    expect(types.lastIndexOf("dark")).toBeLessThan(types.indexOf("light"));
  });

  it("each give every code colour", () => {
    for (const each of codeThemes) {
      const colors = codeColors(each);
      for (const token of codeTokens) {
        expect(colors[token], `${each.id} ${token}`).toMatch(/^#([0-9a-f]{3,4}){1,2}$/i);
      }
    }
  });

  it("colour a script box as VS Code colours the file", () => {
    const colors = codeColors(named("dracula"));
    expect(colors["code-bg"].toLowerCase()).toBe("#282a36");
    expect(colors["code-keyword"].toLowerCase()).toBe("#ff79c6");
    expect(colors["code-function"].toLowerCase()).toBe("#50fa7b");
    expect(colors["code-string"].toLowerCase()).toBe("#f1fa8c");
    expect(colors["code-number"].toLowerCase()).toBe("#bd93f9");
    expect(colors["code-comment"].toLowerCase()).toBe("#6272a4");
  });

  it("start as app.css has them", () => {
    const colors = codeColors(codeThemeOf("", themeOf(defaultTheme)));
    for (const [token, value] of Object.entries(colors)) {
      expect(css).toContain(`--${token}: ${value.toLowerCase()};`);
    }
  });
});

describe("the theme scripts are drawn in", () => {
  it("has a code theme for every interface theme", () => {
    for (const each of themes) {
      expect(codeThemeOf("", each).name.toLowerCase(), each.id).toContain(
        each.name.split(" ")[0]?.toLowerCase(),
      );
    }
  });

  it("follows the interface's theme when none is chosen", () => {
    expect(codeThemeOf("", dracula)).toBe(named("dracula"));
  });

  it("stays its own when one is chosen, whatever the interface's theme", () => {
    expect(codeThemeOf("monokai", dracula)).toBe(named("monokai"));
  });

  it("keeps a choice saved under an interface theme's id", () => {
    expect(codeThemeOf("one-dark", dracula)).toBe(named("one-dark-pro"));
  });

  it("follows the interface's theme for an id no theme has", () => {
    expect(codeThemeOf("no-such-theme", dracula)).toBe(named("dracula"));
  });

  it("puts its colours on the page and leaves the interface's alone", () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (name: string, value: string) => (set[name] = value) } };
    const theme = codeThemeOf("", nord);
    applyCodeTheme(theme, root as unknown as HTMLElement);
    expect(set["--code-keyword"]).toBe(codeColors(theme)["code-keyword"]);
    expect(set["--bg"]).toBeUndefined();
  });
});
