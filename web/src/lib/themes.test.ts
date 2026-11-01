import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCodeTheme,
  applyTheme,
  codeColors,
  codeThemeOf,
  codeTokens,
  defaultTheme,
  themeOf,
  themes,
  tokens,
} from "./themes.ts";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8").toLowerCase();

describe("the themes", () => {
  it("each set every token to a colour, with ids of their own", () => {
    for (const each of themes) {
      for (const token of tokens)
        expect(each.colors[token], `${each.id} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(themes.map((each) => each.id)).size).toBe(themes.length);
  });

  it("start with Kanagawa Dragon, as app.css draws the page before a theme is put on", () => {
    const dragon = themeOf(defaultTheme);
    expect(dragon.name).toBe("Kanagawa Dragon");
    expect(themes[0]).toBe(dragon);
    for (const token of tokens) expect(css).toContain(`--${token}: ${dragon.colors[token]};`);
  });

  it("include the ones Sven asked for", () => {
    const names = themes.map((each) => each.name);
    for (const name of ["Kanagawa Wave", "Gruvbox Dark", "Dracula", "Catppuccin Mocha"]) {
      expect(names).toContain(name);
    }
  });

  it("fall back to the default for an unknown id", () => {
    expect(themeOf("no-such-theme").id).toBe(defaultTheme);
    expect(themeOf(null).id).toBe(defaultTheme);
  });

  it("put their colours on the page", () => {
    const set: Record<string, string> = {};
    const root = {
      style: { setProperty: (name: string, value: string) => (set[name] = value) },
      dataset: {} as Record<string, string>,
    };
    const kanagawa = themeOf("kanagawa-wave");
    applyTheme(kanagawa, root as unknown as HTMLElement);
    expect(set["--bg"]).toBe(kanagawa.colors.bg);
    expect(set["--kind-upgrade"]).toBe(kanagawa.colors["kind-upgrade"]);
    expect(root.dataset.theme).toBe("kanagawa-wave");
  });
});

describe("the code theme", () => {
  const dracula = themeOf("dracula");
  const nord = themeOf("nord");

  it("gives every code colour, from any theme", () => {
    for (const each of themes) {
      const colors = codeColors(each);
      for (const token of codeTokens) {
        expect(colors[token], `${each.id} ${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("draws a theme's script in that theme's own colours", () => {
    const colors = codeColors(dracula);
    expect(colors["code-bg"]).toBe(dracula.colors.bg);
    expect(colors["code-keyword"]).toBe(dracula.colors.purple);
    expect(colors["code-keyword"]).not.toBe(codeColors(nord)["code-keyword"]);
  });

  it("follows the interface's theme when none is chosen", () => {
    expect(codeThemeOf("", dracula)).toBe(dracula);
  });

  it("stays its own when one is chosen, whatever the interface's theme", () => {
    expect(codeThemeOf("nord", dracula)).toBe(nord);
  });

  it("follows the interface's theme for an id no theme has", () => {
    expect(codeThemeOf("no-such-theme", dracula)).toBe(dracula);
  });

  it("puts its colours on the page and leaves the interface's alone", () => {
    const set: Record<string, string> = {};
    const root = { style: { setProperty: (name: string, value: string) => (set[name] = value) } };
    applyCodeTheme(nord, root as unknown as HTMLElement);
    expect(set["--code-keyword"]).toBe(nord.colors.purple);
    expect(set["--bg"]).toBeUndefined();
  });

  it("starts as app.css has it", () => {
    for (const [token, value] of Object.entries(codeColors(themeOf(defaultTheme)))) {
      expect(css).toContain(`--${token}: ${value};`);
    }
  });
});
