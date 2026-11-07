import { describe, expect, it } from "vitest";
import { brushOutline } from "./terrainTools.svelte.ts";

describe("brushOutline", () => {
  it("puts every brush round the nearest corner, 2 × size − 1 corners across as World Editor's", () => {
    const [one] = brushOutline(0, 0, 140, 250, "Square", 1);
    const [two] = brushOutline(0, 0, 140, 250, "Square", 2);

    expect(one).toEqual([128 - 64, 256 - 64]);
    expect(two).toEqual([128 - 192, 256 - 192]);
  });

  it("goes round a circle half the corners across", () => {
    const outline = brushOutline(0, 0, 0, 0, "Circle", 4);

    expect(outline.length).toBeGreaterThanOrEqual(16);
    for (const [x, y] of outline) expect(Math.hypot(x, y)).toBeCloseTo(448);
  });
});
