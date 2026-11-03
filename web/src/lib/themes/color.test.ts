import { describe, expect, it } from "vitest";
import {
  clampLightness,
  contrast,
  flattened,
  isHexColor,
  mix,
  mixOklab,
  oklchLightness,
  parsed,
  readable,
} from "./color.ts";

describe("reading a colour", () => {
  it("expands a short colour and reads its see-through part", () => {
    expect(parsed("#abc")).toEqual({ rgb: [170, 187, 204], alpha: 1 });
    expect(parsed("#ff000080").alpha).toBeCloseTo(0.5, 2);
  });
});

describe("mixing colours", () => {
  it("goes from one to the other", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("mixing colours the way a person sees them", () => {
  it("goes from one to the other", () => {
    expect(mixOklab("#336699", "#ffcc00", 0)).toBe("#336699");
    expect(mixOklab("#336699", "#ffcc00", 1)).toBe("#ffcc00");
  });

  it("meets in the middle of black and white at a darker grey than sRGB's", () => {
    expect(mixOklab("#000000", "#ffffff", 0.5)).toBe("#636363");
  });

  it("keeps a colour mixed with itself", () => {
    expect(mixOklab("#8ba4b0", "#8ba4b0", 0.4)).toBe("#8ba4b0");
  });
});

describe("the contrast of two colours", () => {
  it("runs from 1 to 21", () => {
    expect(contrast("#000000", "#000000")).toBe(1);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
  });
});

describe("flattening a see-through colour", () => {
  it("lays it over a solid one", () => {
    expect(flattened("#ffffff20", "#101010")).toBe("#2e2e2e");
  });

  it("keeps a solid colour as it is", () => {
    expect(flattened("#336699", "#101010")).toBe("#336699");
    expect(flattened("#369", "#101010")).toBe("#336699");
  });
});

describe("making a colour readable", () => {
  it("moves a colour too close to the panels until it reads", () => {
    const moved = readable("#000080", "#101010", "#e0e0e0", 3);
    expect(contrast(moved, "#101010")).toBeGreaterThanOrEqual(3);
  });

  it("leaves a colour that already reads", () => {
    expect(readable("#e0e0e0", "#101010", "#ffffff", 4.5)).toBe("#e0e0e0");
  });

  it("gives up on the colour it moves toward", () => {
    expect(readable("#101010", "#101010", "#101010", 4.5)).toBe("#101010");
  });
});

describe("clamping a colour's lightness", () => {
  it("brings a colour down to the most it may have", () => {
    expect(oklchLightness(clampLightness("#ffffff", { max: 0.44 }))).toBeCloseTo(0.44, 2);
  });

  it("brings a colour up to the least it may have", () => {
    expect(oklchLightness(clampLightness("#202020", { min: 0.84 }))).toBeCloseTo(0.84, 2);
  });

  it("leaves a colour that is inside the limit as it is", () => {
    expect(clampLightness("#336699", { max: 0.8 })).toBe("#336699");
    expect(clampLightness("#336699", { min: 0.1 })).toBe("#336699");
    expect(clampLightness("#336699", {})).toBe("#336699");
  });

  it("keeps the hue when the lightness moves", () => {
    const [red, green, blue] = parsed(clampLightness("#2060d0", { max: 0.4 })).rgb;
    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
  });

  it("keeps the lightness for a colour that cannot hold its chroma there", () => {
    const lifted = clampLightness("#0000ff", { min: 0.84 });
    expect(oklchLightness(lifted)).toBeCloseTo(0.84, 1);
    expect(lifted).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("a hex colour", () => {
  it("is #rgb, #rrggbb or #rrggbbaa", () => {
    for (const text of ["#abc", "#aabbcc", "#aabbcc80", "#ABC", "#AABBCC"]) {
      expect(isHexColor(text), text).toBe(true);
    }
  });

  it("is not a name, a length of 4 or 5, or a hex without its hash", () => {
    for (const text of ["red", "#abcd5", "#abcd", "aabbcc", "#ggg", "", "#"]) {
      expect(isHexColor(text), text).toBe(false);
    }
  });
});
