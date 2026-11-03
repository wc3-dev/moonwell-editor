import { describe, expect, it } from "vitest";
import { clampLightness, contrast, mix, mixOklab, readable } from "./color.ts";
import { fillColors } from "./fill.ts";
import { colorKeys } from "./format.ts";

const four = {
  "background.base": "#0d0c0c",
  "background.panel": "#181616",
  "text.normal": "#c5c9c5",
  "accent.normal": "#8ba4b0",
};
const lightFour = {
  "background.base": "#f2efe8",
  "background.panel": "#ffffff",
  "text.normal": "#202020",
  "accent.normal": "#006ab1",
};

const dark = fillColors("dark", four);
const light = fillColors("light", lightFour);

describe("a theme with only the four required colours", () => {
  it("gets every colour, each a solid #rrggbb, in the order of the keys", () => {
    expect(Object.keys(dark)).toEqual([...colorKeys]);
    expect(Object.keys(light)).toEqual([...colorKeys]);
    for (const [key, value] of Object.entries(dark)) expect(value, key).toMatch(/^#[0-9a-f]{6}$/);
    for (const [key, value] of Object.entries(light)) expect(value, key).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is refused when one of the four is missing", () => {
    expect(() => fillColors("dark", { ...four, "accent.normal": undefined })).toThrow(
      "accent.normal",
    );
  });
});

describe("the backgrounds a theme leaves out", () => {
  it("take the gutter from the base, toward black", () => {
    expect(dark["background.gutter"]).toBe(mix("#0d0c0c", "#000000", 0.22));
    expect(light["background.gutter"]).toBe(mix("#f2efe8", "#000000", 0.07));
  });

  it("raise a row from the panel, toward the text", () => {
    expect(dark["background.raised"]).toBe(mix("#181616", "#c5c9c5", 0.09));
    expect(light["background.raised"]).toBe(mix("#ffffff", "#202020", 0.09));
  });

  it("put the pointer on the raised colour", () => {
    expect(dark["background.hover"]).toBe(dark["background.raised"]);
  });

  it("sink a field under the base", () => {
    expect(dark["background.field"]).toBe(mix("#0d0c0c", "#000000", 0.3));
    expect(light["background.field"]).toBe(mix("#f2efe8", "#000000", 0.03));
  });

  it("tint the selection with the accent, dark enough to carry the text", () => {
    expect(dark["background.selection"]).toBe(
      clampLightness(mixOklab("#181616", "#8ba4b0", 0.32), { max: 0.44 }),
    );
  });

  it("tint a light selection with the accent, light enough to carry the text", () => {
    expect(light["background.selection"]).toBe(
      clampLightness(mixOklab("#ffffff", "#006ab1", 0.28), { min: 0.84 }),
    );
  });

  it("tint the main button from the raised colour", () => {
    expect(dark["background.button"]).toBe(
      clampLightness(mixOklab(dark["background.raised"], "#8ba4b0", 0.4), { max: 0.44 }),
    );
    expect(light["background.button"]).toBe(
      clampLightness(mixOklab(light["background.raised"], "#006ab1", 0.34), { min: 0.8 }),
    );
  });
});

describe("the lines a theme leaves out", () => {
  it("draw the border from the panel toward the text", () => {
    expect(dark["border.normal"]).toBe(mix("#181616", "#c5c9c5", 0.18));
  });

  it("draw the faint border at 70% of the border", () => {
    expect(dark["border.faint"]).toBe(mix("#181616", dark["border.normal"], 0.7));
  });
});

describe("the text a theme leaves out", () => {
  it("steps from the normal text toward the panel and reads on it", () => {
    const soft = mix("#c5c9c5", "#181616", 0.1);
    const muted = mix("#c5c9c5", "#181616", 0.18);
    const faint = mix("#c5c9c5", "#181616", 0.55);
    expect(dark["text.soft"]).toBe(readable(soft, "#181616", "#c5c9c5", 4.5));
    expect(dark["text.muted"]).toBe(readable(muted, "#181616", "#c5c9c5", 3));
    expect(dark["text.faint"]).toBe(readable(faint, "#181616", "#c5c9c5", 2));
  });
});

describe("the accent a theme leaves out", () => {
  it("writes accent text in the accent itself", () => {
    expect(dark["accent.text"]).toBe("#8ba4b0");
  });

  it("reads accent text on the panel", () => {
    const dim = fillColors("dark", { ...four, "accent.normal": "#202830" });
    expect(contrast(dim["accent.text"], "#181616")).toBeGreaterThanOrEqual(3);
  });

  it("tints the accent's background from the panel", () => {
    expect(dark["accent.background"]).toBe(mix("#181616", "#8ba4b0", 0.18));
  });
});

describe("the states a theme leaves out", () => {
  it("take VS Code's warning yellow and error red, by the theme's type", () => {
    expect(dark["state.changed"]).toBe("#cca700");
    expect(dark["state.warning"]).toBe("#f14c4c");
    expect(light["state.changed"]).toBe(readable("#bf8803", "#ffffff", "#202020", 3));
    expect(light["state.warning"]).toBe(readable("#e51400", "#ffffff", "#202020", 3));
  });

  it("tint the warning's background from the panel", () => {
    expect(dark["state.warningBackground"]).toBe(mix("#181616", dark["state.warning"], 0.18));
  });
});

describe("the kinds a theme leaves out", () => {
  const onPanel = (color: string) => readable(color, "#181616", "#c5c9c5", 3);
  const onWhite = (color: string) => readable(color, "#ffffff", "#202020", 3);

  it("take VS Code's terminal colours, by the theme's type", () => {
    expect(dark["kind.unit"]).toBe(onPanel("#2472c8"));
    expect(dark["kind.destructable"]).toBe(onPanel("#0dbc79"));
    expect(dark["kind.doodad"]).toBe(onPanel("#e5e510"));
    expect(dark["kind.ability"]).toBe(onPanel("#11a8cd"));
    expect(dark["kind.buff"]).toBe(onPanel("#bc3fbc"));
    expect(dark["kind.upgrade"]).toBe(onPanel("#cd3131"));
    expect(light["kind.unit"]).toBe(onWhite("#0451a5"));
    expect(light["kind.destructable"]).toBe(onWhite("#00bc00"));
    expect(light["kind.doodad"]).toBe(onWhite("#949800"));
    expect(light["kind.ability"]).toBe(onWhite("#0598bc"));
    expect(light["kind.buff"]).toBe(onWhite("#bc05bc"));
    expect(light["kind.upgrade"]).toBe(onWhite("#cd3131"));
  });

  it("put items between the upgrades' red and the doodads' yellow", () => {
    expect(dark["kind.item"]).toBe(onPanel(mix(dark["kind.upgrade"], dark["kind.doodad"], 0.5)));
  });
});

describe("the terminal a theme leaves out", () => {
  it("follows the theme", () => {
    expect(dark["terminal.red"]).toBe(dark["state.warning"]);
    expect(dark["terminal.blue"]).toBe(dark["kind.unit"]);
    expect(dark["terminal.green"]).toBe(dark["kind.destructable"]);
    expect(dark["terminal.yellow"]).toBe(dark["state.changed"]);
    expect(dark["terminal.magenta"]).toBe(dark["kind.buff"]);
    expect(dark["terminal.cyan"]).toBe(dark["kind.ability"]);
    expect(dark["terminal.white"]).toBe(dark["text.soft"]);
    expect(dark["terminal.black"]).toBe(dark["background.base"]);
    expect(dark["terminal.background"]).toBe(dark["background.panel"]);
    expect(dark["terminal.foreground"]).toBe(dark["text.normal"]);
    expect(dark["terminal.cursor"]).toBe(dark["text.normal"]);
    expect(dark["terminal.selection"]).toBe(dark["background.selection"]);
    expect(dark["terminal.brightBlack"]).toBe(dark["text.faint"]);
    expect(dark["terminal.brightWhite"]).toBe(dark["text.normal"]);
  });

  it("brightens the other colours 20% toward the text", () => {
    const brighter = (color: string) =>
      readable(mix(color, "#c5c9c5", 0.2), "#181616", "#c5c9c5", 3);
    expect(dark["terminal.brightRed"]).toBe(brighter(dark["terminal.red"]));
    expect(dark["terminal.brightGreen"]).toBe(brighter(dark["terminal.green"]));
    expect(dark["terminal.brightYellow"]).toBe(brighter(dark["terminal.yellow"]));
    expect(dark["terminal.brightBlue"]).toBe(brighter(dark["terminal.blue"]));
    expect(dark["terminal.brightMagenta"]).toBe(brighter(dark["terminal.magenta"]));
    expect(dark["terminal.brightCyan"]).toBe(brighter(dark["terminal.cyan"]));
  });

  it("reads colours against the terminal's own background", () => {
    const filled = fillColors("dark", { ...four, "terminal.background": "#3a3a3a" });
    expect(contrast(filled["terminal.blue"], "#3a3a3a")).toBeGreaterThanOrEqual(3);
    expect(filled["terminal.blue"]).not.toBe(filled["kind.unit"]);
  });
});

describe("a colour the theme sets", () => {
  it("is kept as written", () => {
    const filled = fillColors("dark", { ...four, "text.muted": "#202020" });
    expect(filled["text.muted"]).toBe("#202020");
  });

  it("is kept even where it would not read", () => {
    const filled = fillColors("dark", {
      ...four,
      "state.warning": "#181616",
      "kind.unit": "#181616",
    });
    expect(filled["state.warning"]).toBe("#181616");
    expect(filled["kind.unit"]).toBe("#181616");
  });

  it("leads the colours worked out from it", () => {
    const filled = fillColors("dark", {
      ...four,
      "background.raised": "#303030",
      "state.warning": "#ff0000",
    });
    expect(filled["background.hover"]).toBe("#303030");
    expect(filled["state.warningBackground"]).toBe(mix("#181616", "#ff0000", 0.18));
    expect(filled["terminal.red"]).toBe(readable("#ff0000", "#181616", "#c5c9c5", 3));
  });
});

describe("the colours worked out", () => {
  const readsOn = (colors: typeof dark, panel: string, keys: readonly string[], ratio: number) => {
    for (const key of keys) {
      expect(contrast(colors[key as keyof typeof colors], panel), key).toBeGreaterThanOrEqual(
        ratio,
      );
    }
  };
  const kinds = colorKeys.filter((key) => key.startsWith("kind."));
  const terminalColours = colorKeys.filter(
    (key) =>
      key.startsWith("terminal.") &&
      !/background|cursor|selection|black|Black/.test(key.replace("terminal.", "")),
  );

  it("read on a dark panel", () => {
    const panel = dark["background.panel"];
    readsOn(dark, panel, ["text.soft"], 4.5);
    readsOn(
      dark,
      panel,
      ["text.muted", "accent.text", "state.changed", "state.warning", ...kinds],
      3,
    );
    readsOn(dark, panel, ["text.faint"], 2);
  });

  it("read on a light panel", () => {
    const panel = light["background.panel"];
    readsOn(light, panel, ["text.soft"], 4.5);
    readsOn(
      light,
      panel,
      ["text.muted", "accent.text", "state.changed", "state.warning", ...kinds],
      3,
    );
    readsOn(light, panel, ["text.faint"], 2);
  });

  it("read in the terminal, but for black, bright black and what is not text", () => {
    expect(terminalColours).toHaveLength(15);
    readsOn(dark, dark["terminal.background"], terminalColours, 3);
    readsOn(light, light["terminal.background"], terminalColours, 3);
  });
});

describe("Kanagawa Dragon, as the app has it today", () => {
  it("keeps the amounts the app worked its colours out with", () => {
    expect(dark["border.normal"]).toBe("#373636");
    expect(dark["text.soft"]).toBe("#b4b7b4");
    expect(dark["text.muted"]).toBe("#a6a9a6");
    expect(dark["accent.background"]).toBe("#2d3032");
  });
});
