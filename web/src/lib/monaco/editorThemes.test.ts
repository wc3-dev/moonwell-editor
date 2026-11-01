import { describe, expect, it } from "vitest";
import { codeColors, themeOf, themes } from "../themes.ts";
import { editorTheme, editorThemeId, editorThemes } from "./editorThemes.ts";

const nord = themeOf("nord");

function colourOf(scope: string, theme = nord): string | undefined {
  return editorTheme(theme).tokenColors.find((each) => each.scope.includes(scope))?.settings
    .foreground;
}

describe("editorTheme", () => {
  it("is a dark theme", () => {
    expect(editorTheme(nord).type).toBe("dark");
  });

  it("draws the editor in the code theme's colours", () => {
    const code = codeColors(nord);
    const { colors } = editorTheme(nord);
    expect(colors["editor.background"]).toBe(code["code-bg"]);
    expect(colors["editor.foreground"]).toBe(code["code-fg"]);
    expect(colors["editorLineNumber.foreground"]).toBe(code["code-gutter"]);
    expect(colors["editor.selectionBackground"]).toBe(code["code-selection"]);
  });

  it("colours a script as a card does", () => {
    const code = codeColors(nord);
    expect(colourOf("comment")).toBe(code["code-comment"]);
    expect(colourOf("keyword")).toBe(code["code-keyword"]);
    expect(colourOf("string")).toBe(code["code-string"]);
    expect(colourOf("constant.numeric")).toBe(code["code-number"]);
    expect(colourOf("support.type")).toBe(code["code-type"]);
    expect(colourOf("variable.function")).toBe(code["code-function"]);
    expect(colourOf("keyword.operator")).toBe(code["code-operator"]);
  });

  it("gives every colour as a colour", () => {
    for (const each of themes) {
      for (const value of Object.values(editorTheme(each).colors)) {
        expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    }
  });
});

describe("editorThemes", () => {
  it("makes one for every theme, each with its own file", () => {
    const made = editorThemes();
    expect(made.contributes).toHaveLength(themes.length);
    expect(made.files.size).toBe(themes.length);
    const first = made.contributes[0];
    expect(first?.id).toBe(editorThemeId(themes[0] as (typeof themes)[number]));
    expect(first?.uiTheme).toBe("vs-dark");
  });

  it("writes a file VS Code can read", () => {
    const made = editorThemes();
    const path = made.contributes[0]?.path.replace("./", "/") ?? "";
    expect(JSON.parse(made.files.get(path) ?? "")).toEqual(
      editorTheme(themes[0] as (typeof themes)[number]),
    );
  });
});
