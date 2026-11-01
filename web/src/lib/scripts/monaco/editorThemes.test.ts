import { describe, expect, it } from "vitest";
import { codeThemes } from "../../codeThemes.ts";
import { editorThemeId, editorThemes } from "./editorThemes.ts";

const contributed = (id: string) =>
  editorThemes().contributes.find((each) => each.id === `moonwell-${id}`);

describe("editorThemes", () => {
  it("makes one for every code theme, each with its own file", () => {
    const made = editorThemes();
    expect(made.contributes).toHaveLength(codeThemes.length);
    expect(made.files.size).toBe(codeThemes.length);
    expect(made.contributes[0]?.id).toBe(
      editorThemeId(codeThemes[0] as (typeof codeThemes)[number]),
    );
  });

  it("gives VS Code each theme's own file", () => {
    const made = editorThemes();
    for (const [index, each] of codeThemes.entries()) {
      const path = made.contributes[index]?.path.replace("./", "/") ?? "";
      expect(made.files.get(path)).toBe(each.file);
    }
  });

  it("says which are light", () => {
    expect(contributed("dracula")?.uiTheme).toBe("vs-dark");
    expect(contributed("light-plus")?.uiTheme).toBe("vs");
  });
});
