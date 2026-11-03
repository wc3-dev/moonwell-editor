import { describe, expect, it } from "vitest";
import { codeThemes, loadCodeThemes } from "../../codeThemes.ts";
import { editorThemeId, editorThemes } from "./editorThemes.ts";

const contributed = async (id: string) =>
  (await editorThemes()).contributes.find((each) => each.id === `moonwell-${id}`);

describe("editorThemes", () => {
  it("makes one for every code theme, each with its own file", async () => {
    const made = await editorThemes();
    expect(made.contributes).toHaveLength(codeThemes.length);
    expect(made.files.size).toBe(codeThemes.length);
    expect(made.contributes[0]?.id).toBe(
      editorThemeId(codeThemes[0] as (typeof codeThemes)[number]),
    );
  });

  it("gives VS Code each theme's own file", async () => {
    const made = await editorThemes();
    for (const [index, each] of (await loadCodeThemes()).entries()) {
      const path = made.contributes[index]?.path.replace("./", "/") ?? "";
      expect(made.files.get(path)).toBe(each.file);
    }
  });

  it("says which are light", async () => {
    expect((await contributed("dracula"))?.uiTheme).toBe("vs-dark");
    expect((await contributed("light-plus"))?.uiTheme).toBe("vs");
  });
});
