import { describe, expect, it } from "vitest";
import { groundAt, patchTerrain, readTerrain } from "./scene.ts";
import { terrainBytes } from "./testTerrain.ts";

describe("readTerrain", () => {
  it("reads each array at its place", () => {
    const terrain = readTerrain(
      terrainBytes(
        3,
        2,
        (i) => i,
        (i) => (i === 0 ? -89.6 : Number.NaN),
      ),
      -128,
      64,
    );

    expect([terrain.columns, terrain.rows, terrain.left, terrain.bottom]).toEqual([3, 2, -128, 64]);
    expect(Array.from(terrain.ground)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(terrain.relief[4]).toBe(2);
    expect(terrain.water[0]).toBeCloseTo(-89.6, 3);
    expect(Number.isNaN(terrain.water[1])).toBe(true);
    expect(Array.from(terrain.layers.subarray(0, 4))).toEqual([3, 19, 255, 255]);
    expect(Array.from(terrain.tiles)).toEqual([1, 1]);
    expect(terrain.shadows.length).toBe(2 * 16);
    expect(terrain.shadows[0]).toBe(255);
    expect(terrain.shadows[1]).toBe(0);
  });

  it("refuses bytes of another size", () => {
    expect(() => readTerrain(new ArrayBuffer(12), 0, 0)).toThrow();
  });
});

describe("groundAt", () => {
  // The C# test's case: a tile whose right corners are 128 up.
  const terrain = readTerrain(
    terrainBytes(2, 2, (i) => (i % 2) * 128),
    0,
    0,
  );

  it("blends the four corners", () => {
    expect(groundAt(terrain, 64, 64)).toBeCloseTo(64, 3);
    expect(groundAt(terrain, 32, 100)).toBeCloseTo(32, 3);
  });

  it("reads the edge outside the grid", () => {
    expect(groundAt(terrain, 500, 500)).toBeCloseTo(128, 3);
    expect(groundAt(terrain, -500, 0)).toBeCloseTo(0, 3);
  });
});

describe("patchTerrain", () => {
  // A patch of corners 1..2 by 0..1 of a 3 by 2 terrain: ground 10, 11 / 12, 13, and its one tile's layers.
  function patch(left: number, columns: number, size = 16 + 4 * 12 + 8 + 1): ArrayBuffer {
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (const [at, value] of [left, 0, columns, 2].entries()) view.setInt32(at * 4, value, true);
    const floats = new Float32Array(buffer, 16, 12);
    floats.set([10, 11, 12, 13, 1, 1, 1, 1, Number.NaN, Number.NaN, Number.NaN, Number.NaN]);
    new Uint8Array(buffer, 64, 8).set([5, 16, 255, 255, 255, 255, 255, 255]);
    new Uint8Array(buffer, 72, 1).set([0]); // its tile under a cliff now
    return buffer;
  }

  it("writes the corners and the tile over the terrain, leaving the rest", () => {
    const terrain = readTerrain(
      terrainBytes(
        3,
        2,
        (i) => i,
        () => Number.NaN,
      ),
      0,
      0,
    );

    patchTerrain(terrain, patch(1, 2));

    expect(Array.from(terrain.ground)).toEqual([0, 10, 11, 3, 12, 13]);
    expect(Array.from(terrain.layers.subarray(0, 2))).toEqual([3, 19]);
    expect(Array.from(terrain.layers.subarray(8, 10))).toEqual([5, 16]);
    expect(Array.from(terrain.tiles)).toEqual([1, 0]);
  });

  it("refuses a patch of another size or off the terrain", () => {
    const terrain = readTerrain(
      terrainBytes(
        3,
        2,
        (i) => i,
        () => Number.NaN,
      ),
      0,
      0,
    );

    expect(() => patchTerrain(terrain, patch(1, 2, 70))).toThrow();
    expect(() => patchTerrain(terrain, patch(2, 2))).toThrow();
  });
});
