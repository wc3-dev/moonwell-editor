import { describe, expect, it } from "vitest";
import { codeThemes } from "../src/lib/codeThemes.ts";
import type { TokenRule } from "../src/lib/scopeColor.ts";
import { contrast } from "../src/lib/themes/color.ts";
import { colorKeys } from "../src/lib/themes/format.ts";
import {
  editorColors,
  interfaceColors,
  terminalColors,
  type VsCodeThemeFile,
} from "./vscodeColors.ts";

const sample = (
  colors: Record<string, string>,
  tokenColors: TokenRule[] = [],
  type: VsCodeThemeFile["type"] = "dark",
): VsCodeThemeFile => ({
  displayName: "Sample",
  type,
  tokenColors,
  colors: { "editor.background": "#101010", "editor.foreground": "#e0e0e0", ...colors },
});

describe("a VS Code theme's interface colours", () => {
  it("draw the panels in the editor's background", () => {
    expect(interfaceColors(sample({}))["background.panel"]).toBe("#101010");
  });

  it("sink the base under the panels with the tabs' background", () => {
    const colors = interfaceColors(sample({ "editorGroupHeader.tabsBackground": "#080808" }));
    expect(colors["background.base"]).toBe("#080808");
  });

  it("work a base out when the theme's would stand above the panels", () => {
    const colors = interfaceColors(sample({ "editorGroupHeader.tabsBackground": "#303030" }));
    expect(contrast(colors["background.base"], "#000000")).toBeLessThan(
      contrast("#101010", "#000000"),
    );
  });

  it("work a base out when the theme's sidebar is far from its panels", () => {
    const colors = interfaceColors(
      sample(
        {
          "editor.background": "#ffffff",
          "editor.foreground": "#202020",
          "editorGroupHeader.tabsBackground": "#2d3e4c",
          "sideBar.background": "#2d3e4c",
          "titleBar.activeBackground": "#2d3e4c",
        },
        [],
        "light",
      ),
    );
    expect(contrast(colors["background.base"], "#ffffff")).toBeLessThan(1.3);
  });

  it("take VS Code's own blue when a theme names no accent", () => {
    expect(interfaceColors(sample({}))["accent.normal"]).toBe("#3794ff");
    const light = sample(
      { "editor.background": "#ffffff", "editor.foreground": "#202020" },
      [],
      "light",
    );
    expect(interfaceColors(light)["accent.normal"]).toBe("#006ab1");
  });

  it("flatten a see-through colour onto the panels", () => {
    const colors = interfaceColors(sample({ "list.inactiveSelectionBackground": "#ffffff20" }));
    expect(colors["background.hover"]).toBe("#2e2e2e");
  });

  it("raise headers with the active tab's background", () => {
    expect(
      interfaceColors(sample({ "tab.activeBackground": "#202020" }))["background.raised"],
    ).toBe("#202020");
  });

  it("work a raised colour out when the theme's is the panels' own", () => {
    const colors = interfaceColors(sample({ "tab.activeBackground": "#101010" }));
    expect(colors["background.raised"]).not.toBe("#101010");
    expect(contrast(colors["background.raised"], "#000000")).toBeGreaterThan(
      contrast("#101010", "#000000"),
    );
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
    expect(colors["state.changed"]).toBe("#ffff55");
    expect(colors["state.warning"]).toBe("#ff5555");
    expect(colors["kind.unit"]).toBe("#5599ff");
    expect(colors["kind.destructable"]).toBe("#55ff55");
    expect(colors["kind.doodad"]).toBe("#ffff55");
    expect(colors["kind.ability"]).toBe("#55ffff");
    expect(colors["kind.buff"]).toBe("#ff55ff");
    expect(colors["kind.upgrade"]).toBe("#ff5555");
  });

  it("give items the colour between yellow and red", () => {
    const colors = interfaceColors(
      sample({ "terminal.ansiRed": "#ff0000", "terminal.ansiYellow": "#ffff00" }),
    );
    expect(colors["kind.item"]).toBe("#ff8000");
  });

  it("take the syntax's colours when the theme has no terminal colours", () => {
    const colors = interfaceColors(
      sample({}, [
        { scope: "entity.name.function", settings: { foreground: "#6699ee" } },
        { scope: "string", settings: { foreground: "#66ee66" } },
        { scope: "keyword.control", settings: { foreground: "#ee66ee" } },
      ]),
    );
    expect(colors["kind.unit"]).toBe("#6699ee");
    expect(colors["kind.destructable"]).toBe("#66ee66");
    expect(colors["kind.buff"]).toBe("#ee66ee");
  });

  it("move a colour too close to the panels until it reads", () => {
    const colors = interfaceColors(sample({ "terminal.ansiBlue": "#000080" }));
    expect(contrast(colors["kind.unit"], "#101010")).toBeGreaterThanOrEqual(3);
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
    expect(contrast(colors["state.changed"], "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});

describe("a VS Code theme's terminal colours", () => {
  it("are the theme's own", () => {
    const colors = terminalColors(
      sample({
        "terminal.background": "#111111",
        "terminal.foreground": "#eeeeee",
        "terminalCursor.foreground": "#ff00ff",
        "terminal.selectionBackground": "#333333",
        "terminal.ansiRed": "#ff5555",
        "terminal.ansiBrightBlue": "#99aaff",
      }),
    );
    expect(colors["terminal.background"]).toBe("#111111");
    expect(colors["terminal.foreground"]).toBe("#eeeeee");
    expect(colors["terminal.cursor"]).toBe("#ff00ff");
    expect(colors["terminal.selection"]).toBe("#333333");
    expect(colors["terminal.red"]).toBe("#ff5555");
    expect(colors["terminal.brightBlue"]).toBe("#99aaff");
  });

  it("sit on the panels when the theme gives no background", () => {
    expect(terminalColors(sample({}))["terminal.background"]).toBe("#101010");
  });

  it("take VS Code's own for what a theme leaves out, by its kind", () => {
    expect(terminalColors(sample({}))["terminal.green"]).toBe("#0dbc79");
    expect(terminalColors(sample({}, [], "light"))["terminal.green"]).toBe("#00bc00");
    expect(terminalColors(sample({}, [], "light"))["terminal.brightWhite"]).toBe("#a5a5a5");
  });

  it("flatten a see-through selection onto the terminal", () => {
    const colors = terminalColors(sample({ "terminal.selectionBackground": "#ffffff20" }));
    expect(colors["terminal.selection"]).toBe("#2e2e2e");
  });
});

describe("a VS Code theme's editor colours", () => {
  it("are the interface's and the terminal's together", () => {
    const theme = sample({ "terminal.ansiRed": "#ff5555" });
    expect(editorColors(theme)).toEqual({ ...interfaceColors(theme), ...terminalColors(theme) });
  });

  it("are only editor keys, and leave the worked-out ones to fillColors", () => {
    const keys = Object.keys(editorColors(sample({})));
    expect(keys.filter((key) => !(colorKeys as readonly string[]).includes(key))).toEqual([]);
    for (const left of [
      "background.gutter",
      "background.field",
      "background.selection",
      "background.button",
      "border.faint",
    ]) {
      expect(keys).not.toContain(left);
    }
  });
});

describe.each(
  codeThemes.map((each) => [each.id, JSON.parse(each.file) as VsCodeThemeFile] as const),
)("%s", (_, theme) => {
  const colors = interfaceColors(theme);

  it("gives the terminal text that reads", () => {
    const terminal = terminalColors(theme);
    expect(
      contrast(terminal["terminal.foreground"], terminal["terminal.background"]),
    ).toBeGreaterThanOrEqual(3);
  });

  it("gives every key a colour", () => {
    for (const [key, value] of Object.entries(editorColors(theme))) {
      expect(value, key).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the text readable on the panels", () => {
    const panel = colors["background.panel"];
    expect(contrast(colors["text.normal"], panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors["text.soft"], panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors["text.muted"], panel)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the marks readable on the panels", () => {
    for (const key of [
      "accent.normal",
      "accent.text",
      "state.changed",
      "state.warning",
      "kind.unit",
      "kind.item",
      "kind.destructable",
      "kind.doodad",
      "kind.ability",
      "kind.buff",
      "kind.upgrade",
    ] as const) {
      expect(contrast(colors[key], colors["background.panel"]), key).toBeGreaterThanOrEqual(3);
    }
  });

  it("sets the panels apart from the base, and headers from the panels", () => {
    expect(colors["background.base"]).not.toBe(colors["background.panel"]);
    expect(colors["background.raised"]).not.toBe(colors["background.panel"]);
  });

  it("puts the base just below the panels", () => {
    expect(contrast(colors["background.base"], "#000000")).toBeLessThan(
      contrast(colors["background.panel"], "#000000"),
    );
    expect(contrast(colors["background.base"], colors["background.panel"])).toBeLessThanOrEqual(
      1.8,
    );
  });
});
