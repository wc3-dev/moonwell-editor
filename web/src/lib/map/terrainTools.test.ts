import { describe, expect, it } from "vitest";
import { brushOutline } from "./terrainTools.svelte.ts";

describe("brushOutline", () => {
  it("puts an odd brush round the nearest corner and an even one round its tile's middle", () => {
    const [odd] = brushOutline(0, 0, 140, 250, "Square", 1);
    const [even] = brushOutline(0, 0, 140, 250, "Square", 2);

    expect(odd).toEqual([128 - 64, 256 - 64]);
    expect(even).toEqual([192 - 128, 192 - 128]);
  });

  it("goes round a circle of half the brush's size", () => {
    const outline = brushOutline(0, 0, 0, 0, "Circle", 4);

    expect(outline.length).toBeGreaterThanOrEqual(16);
    for (const [x, y] of outline) expect(Math.hypot(x - 64, y - 64)).toBeCloseTo(256);
  });
});
