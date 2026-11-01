import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codeThemes } from "./codeThemes.ts";
import { applyTheme, defaultTheme, themeOf, themes, tokens } from "./themes.ts";

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

  it("are every VS Code theme, dark and light", () => {
    expect(themes.map((each) => each.id).sort()).toEqual(codeThemes.map((each) => each.id).sort());
    expect(themes.filter((each) => each.type === "light").length).toBeGreaterThan(0);
  });

  it("list the dark ones first after the default", () => {
    const types = themes.map((each) => each.type);
    expect(types.lastIndexOf("dark")).toBeLessThan(types.indexOf("light"));
  });

  it("take over a choice saved from the palettes before them", () => {
    expect(themeOf("gruvbox-dark").id).toBe("gruvbox-dark-medium");
    expect(themeOf("one-dark").id).toBe("one-dark-pro");
    for (const id of [
      "kanagawa-dragon",
      "kanagawa-wave",
      "vitesse-dark",
      "dracula",
      "catppuccin-mocha",
      "catppuccin-macchiato",
      "tokyo-night",
      "nord",
      "rose-pine",
      "everforest-dark",
      "solarized-dark",
    ]) {
      expect(themeOf(id).id).toBe(id);
    }
  });

  it("fall back to the default for an unknown id", () => {
    expect(themeOf("no-such-theme").id).toBe(defaultTheme);
    expect(themeOf(null).id).toBe(defaultTheme);
  });

  it("put their colours on the page", () => {
    const set: Record<string, string> = {};
    const root = {
      style: {
        setProperty: (name: string, value: string) => (set[name] = value),
        colorScheme: "",
      },
      dataset: {} as Record<string, string>,
    };
    const kanagawa = themeOf("kanagawa-wave");
    applyTheme(kanagawa, root as unknown as HTMLElement);
    expect(set["--bg"]).toBe(kanagawa.colors.bg);
    expect(set["--kind-upgrade"]).toBe(kanagawa.colors["kind-upgrade"]);
    expect(root.dataset.theme).toBe("kanagawa-wave");
    expect(root.dataset.scheme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("tell the page when a theme is light", () => {
    const root = {
      style: { setProperty: () => {}, colorScheme: "" },
      dataset: {} as Record<string, string>,
    };
    applyTheme(themeOf("github-light"), root as unknown as HTMLElement);
    expect(root.dataset.scheme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});
