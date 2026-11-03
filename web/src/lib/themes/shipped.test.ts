import { describe, expect, it } from "vitest";
import { codeThemes } from "../codeThemes.ts";
import { shippedThemes } from "./shipped.ts";

describe("the shipped themes", () => {
  it("are one for each code theme, with its id and name", () => {
    expect(shippedThemes).toHaveLength(64);
    expect(shippedThemes.map((each) => each.id).sort()).toEqual(
      codeThemes.map((each) => each.id).sort(),
    );
    for (const code of codeThemes) {
      expect(shippedThemes.find((each) => each.id === code.id)?.name, code.id).toBe(code.name);
    }
  });

  it("are 43 dark and 21 light", () => {
    expect(shippedThemes.filter((each) => each.type === "dark")).toHaveLength(43);
    expect(shippedThemes.filter((each) => each.type === "light")).toHaveLength(21);
  });

  it("all read with no problems", () => {
    for (const theme of shippedThemes) {
      expect(theme.problems, theme.id).toEqual([]);
      expect(theme.source, theme.id).toBe("shipped");
    }
  });

  it("start with Kanagawa Dragon, then the dark ones, then the light, each by name", () => {
    expect(shippedThemes[0]?.id).toBe("kanagawa-dragon");
    const rest = shippedThemes.slice(1);
    const sorted = [...rest].sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    );
    expect(rest.map((each) => each.id)).toEqual(sorted.map((each) => each.id));
    expect(rest.findIndex((each) => each.type === "light")).toBeGreaterThan(
      rest.findLastIndex((each) => each.type === "dark"),
    );
  });

  it("make Kanagawa Dragon the colours the interface had", () => {
    const theme = shippedThemes.find((each) => each.id === "kanagawa-dragon");
    expect(theme?.colors).toMatchObject({
      "background.base": "#0d0c0c",
      "background.panel": "#181616",
      "background.raised": "#282727",
      "background.hover": "#282727",
      "border.normal": "#373636",
      "text.normal": "#c5c9c5",
      "text.soft": "#b4b7b4",
      "text.muted": "#a6a9a6",
      "text.faint": "#737c73",
      "accent.normal": "#8ba4b0",
      "accent.text": "#8ea4a2",
      "accent.background": "#2d3032",
      "state.changed": "#c4b28a",
      "state.warning": "#c4746e",
      "state.warningBackground": "#372726",
      "kind.unit": "#8ba4b0",
      "kind.item": "#c4937c",
      "kind.destructable": "#8a9a7b",
      "kind.doodad": "#c4b28a",
      "kind.ability": "#8ea4a2",
      "kind.buff": "#a292a3",
      "kind.upgrade": "#c4746e",
    });
  });
});
