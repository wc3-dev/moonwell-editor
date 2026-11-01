import { describe, expect, it } from "vitest";
import { type CodeTheme, codeThemes } from "./codeThemes.ts";
import { contrast, interfaceColors, mix } from "./themeColors.ts";

const sample = (
  colors: Record<string, string>,
  tokenColors: CodeTheme["tokenColors"] = [],
  type: CodeTheme["type"] = "dark",
): CodeTheme => ({
  id: "sample",
  name: "Sample",
  type,
  tokenColors,
  file: "",
  colors: { "editor.background": "#101010", "editor.foreground": "#e0e0e0", ...colors },
});

describe("mixing colours", () => {
  it("goes from one to the other", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("the contrast of two colours", () => {
  it("runs from 1 to 21", () => {
    expect(contrast("#000000", "#000000")).toBe(1);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
  });
});

describe("a VS Code theme's interface colours", () => {
  it("draw the panels in the editor's background", () => {
    expect(interfaceColors(sample({})).surface).toBe("#101010");
  });

  it("sink the base under the panels with the tabs' background", () => {
    const colors = interfaceColors(sample({ "editorGroupHeader.tabsBackground": "#080808" }));
    expect(colors.bg).toBe("#080808");
  });

  it("work a base out when the theme's would stand above the panels", () => {
    const colors = interfaceColors(sample({ "editorGroupHeader.tabsBackground": "#303030" }));
    expect(contrast(colors.bg, "#000000")).toBeLessThan(contrast("#101010", "#000000"));
  });

  it("flatten a see-through colour onto the panels", () => {
    const colors = interfaceColors(sample({ "list.inactiveSelectionBackground": "#ffffff20" }));
    expect(colors.hover).toBe("#2e2e2e");
  });

  it("raise headers with the active tab's background", () => {
    expect(interfaceColors(sample({ "tab.activeBackground": "#202020" })).raised).toBe("#202020");
  });

  it("work a raised colour out when the theme's is the panels' own", () => {
    const colors = interfaceColors(sample({ "tab.activeBackground": "#101010" }));
    expect(colors.raised).not.toBe("#101010");
    expect(contrast(colors.raised, "#000000")).toBeGreaterThan(contrast("#101010", "#000000"));
  });

  it("read the terminal's colours for changes, warnings and the kinds", () => {
    const colors = interfaceColors(
      sample({
        "terminal.ansiRed": "#ff5555",
        "terminal.ansiGreen": "#55ff55",
        "terminal.ansiYellow": "#ffff55",
        "terminal.ansiBlue": "#5599ff",
        "terminal.ansiMagenta": "#ff55ff",
        "terminal.ansiCyan": "#55ffff",
      }),
    );
    expect(colors.changed).toBe("#ffff55");
    expect(colors.warn).toBe("#ff5555");
    expect(colors["kind-unit"]).toBe("#5599ff");
    expect(colors["kind-destructable"]).toBe("#55ff55");
    expect(colors["kind-doodad"]).toBe("#ffff55");
    expect(colors["kind-ability"]).toBe("#55ffff");
    expect(colors["kind-buff"]).toBe("#ff55ff");
    expect(colors["kind-upgrade"]).toBe("#ff5555");
  });

  it("give items the colour between yellow and red", () => {
    const colors = interfaceColors(
      sample({ "terminal.ansiRed": "#ff0000", "terminal.ansiYellow": "#ffff00" }),
    );
    expect(colors["kind-item"]).toBe("#ff8000");
  });

  it("take the syntax's colours when the theme has no terminal colours", () => {
    const colors = interfaceColors(
      sample({}, [
        { scope: "entity.name.function", settings: { foreground: "#6699ee" } },
        { scope: "string", settings: { foreground: "#66ee66" } },
        { scope: "keyword.control", settings: { foreground: "#ee66ee" } },
      ]),
    );
    expect(colors["kind-unit"]).toBe("#6699ee");
    expect(colors["kind-destructable"]).toBe("#66ee66");
    expect(colors["kind-buff"]).toBe("#ee66ee");
  });

  it("move a colour too close to the panels until it reads", () => {
    const colors = interfaceColors(sample({ "terminal.ansiBlue": "#000080" }));
    expect(contrast(colors["kind-unit"], "#101010")).toBeGreaterThanOrEqual(3);
  });

  it("read a light theme against its light panels", () => {
    const colors = interfaceColors(
      sample(
        {
          "editor.background": "#ffffff",
          "editor.foreground": "#202020",
          "terminal.ansiYellow": "#ffff55",
        },
        [],
        "light",
      ),
    );
    expect(contrast(colors.changed, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});

describe.each(codeThemes.map((theme) => [theme.id, theme] as const))("%s", (_, theme) => {
  const colors = interfaceColors(theme);

  it("gives every token a colour", () => {
    for (const [token, value] of Object.entries(colors)) {
      expect(value, token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the text readable on the panels", () => {
    expect(contrast(colors.fg, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.muted, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the marks readable on the panels", () => {
    for (const token of [
      "accent",
      "accent-hi",
      "changed",
      "warn",
      "kind-unit",
      "kind-item",
      "kind-destructable",
      "kind-doodad",
      "kind-ability",
      "kind-buff",
      "kind-upgrade",
    ] as const) {
      expect(contrast(colors[token], colors.surface), token).toBeGreaterThanOrEqual(3);
    }
  });

  it("sets the panels apart from the base, and headers from the panels", () => {
    expect(colors.bg).not.toBe(colors.surface);
    expect(colors.raised).not.toBe(colors.surface);
  });

  it("puts the base below the panels", () => {
    expect(contrast(colors.bg, "#000000")).toBeLessThan(contrast(colors.surface, "#000000"));
  });
});
