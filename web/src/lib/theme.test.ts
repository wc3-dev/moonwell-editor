import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorKeys } from "./themes/format.ts";
import { shippedThemes } from "./themes/shipped.ts";
import { cssName } from "./themes.ts";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const root = css.match(/^:root \{([^}]*)\}/m)?.[1]?.toLowerCase() ?? "";

describe("app.css theme", () => {
  it("draws the page in Kanagawa Dragon before a theme is put on", () => {
    const dragon = shippedThemes.find((each) => each.id === "kanagawa-dragon");
    for (const key of colorKeys.filter((each) => !each.startsWith("terminal."))) {
      expect(root, key).toContain(`${cssName(key)}: ${dragon?.colors[key]};`);
    }
  });

  it("leaves the terminal's colours to the terminal", () => {
    expect(css).not.toContain("--terminal-");
  });

  it("uses no pixel font", () => {
    expect(css).not.toMatch(/pixel|press start|silkscreen/i);
  });
});
