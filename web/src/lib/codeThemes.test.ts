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

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8").toLowerCase();

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
    const colors = codeColors(codeThemeOf("", "dark"));
    for (const [token, value] of Object.entries(colors)) {
      expect(css).toContain(`--${token}: ${value.toLowerCase()};`);
    }
  });
});

describe("the theme scripts are drawn in", () => {
  it("is Dark Plus, or Light Plus for a light editor theme, when none is chosen", () => {
    expect(codeThemeOf("", "dark").id).toBe("dark-plus");
    expect(codeThemeOf("", "light").id).toBe("light-plus");
  });

  it("is the one chosen, whatever the editor theme", () => {
    expect(codeThemeOf("nord", "light").id).toBe("nord");
    expect(codeThemeOf("monokai", "dark")).toBe(named("monokai"));
  });

  it("keeps a choice saved under a palette from before", () => {
    expect(codeThemeOf("one-dark", "dark")).toBe(named("one-dark-pro"));
  });

  it("is the default for an id no theme has", () => {
    expect(codeThemeOf("no-such-theme", "dark").id).toBe("dark-plus");
  });

  it("puts its colours on the page and leaves the interface's alone", () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (name: string, value: string) => (set[name] = value) } };
    const theme = codeThemeOf("nord", "dark");
    applyCodeTheme(theme, root as unknown as HTMLElement);
    expect(set["--code-keyword"]).toBe(codeColors(theme)["code-keyword"]);
    expect(Object.keys(set).every((name) => name.startsWith("--code-"))).toBe(true);
  });
});
