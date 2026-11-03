/**
 * The map view's scene as the app sends it (the mapScene command, MoonwellEditor.Map's MapSceneView, its types generated
 * into bridge.gen.ts) and the terrain's bytes (the asset host's /terrain, TerrainBytes): corners every 128, row by row
 * from the bottom left.
 */

export type {
  CameraMark,
  CliffPiece,
  MapSceneView,
  PlacedThing,
  RegionMark,
  SceneLight,
  SceneLights,
  TerrainTexture,
  ThingKind,
  UnitShadow,
  WaterLook,
} from "../bridge.gen.ts";

/**
 * The terrain's corners and tiles: the ground's height, the height without cliff levels (`relief`, what a cliff model
 * stands on), the water's surface (NaN for none); a tile's four layers as texture, piece pairs (255 for none) and its
 * flags (bit 0 the ground is drawn, bit 1 outside the playable area, bit 2 boundary); and a quarter tile's baked
 * Classic shadow (war3map.shd, 255 in shadow), four by four a tile.
 */
export type Terrain = {
  columns: number;
  rows: number;
  left: number;
  bottom: number;
  ground: Float32Array;
  relief: Float32Array;
  water: Float32Array;
  layers: Uint8Array;
  tiles: Uint8Array;
  shadows: Uint8Array;
};

/** Reads the terrain bytes; `left` and `bottom` come from the scene. Throws when the bytes are not of their size. */
export function readTerrain(buffer: ArrayBuffer, left: number, bottom: number): Terrain {
  if (buffer.byteLength < 8) throw new Error("The terrain is cut short.");
  const head = new DataView(buffer);
  const columns = head.getInt32(0, true);
  const rows = head.getInt32(4, true);
  const corners = columns * rows;
  const tiles = Math.max(columns - 1, 0) * Math.max(rows - 1, 0);
  if (columns < 0 || rows < 0 || buffer.byteLength !== 8 + corners * 12 + tiles * 25) {
    throw new Error("The terrain is not of its size.");
  }
  // Float32Array reads the machine's order, which is little-endian on every machine WebView2 runs on.
  return {
    columns,
    rows,
    left,
    bottom,
    ground: new Float32Array(buffer, 8, corners),
    relief: new Float32Array(buffer, 8 + corners * 4, corners),
    water: new Float32Array(buffer, 8 + corners * 8, corners),
    layers: new Uint8Array(buffer, 8 + corners * 12, tiles * 8),
    tiles: new Uint8Array(buffer, 8 + corners * 12 + tiles * 8, tiles),
    shadows: new Uint8Array(buffer, 8 + corners * 12 + tiles * 9, tiles * 16),
  };
}

/**
 * The ground's height at a point: the bilinear blend of its tile's four corners, as the game's GetLocationZ blends
 * them (docs/game-facts.md, 10-28). A point outside the grid reads its edge.
 */
export function groundAt(terrain: Terrain, x: number, y: number): number {
  const { columns, rows, ground } = terrain;
  if (columns === 0 || rows === 0) return 0;
  const u = Math.min(Math.max((x - terrain.left) / 128, 0), columns - 1);
  const v = Math.min(Math.max((y - terrain.bottom) / 128, 0), rows - 1);
  const i = Math.min(Math.floor(u), Math.max(columns - 2, 0));
  const j = Math.min(Math.floor(v), Math.max(rows - 2, 0));
  const right = Math.min(i + 1, columns - 1);
  const top = Math.min(j + 1, rows - 1);
  const fx = u - i;
  const fy = v - j;
  const at = (column: number, row: number) => ground[row * columns + column] ?? 0;
  return (
    (1 - fy) * ((1 - fx) * at(i, j) + fx * at(right, j)) +
    fy * ((1 - fx) * at(i, top) + fx * at(right, top))
  );
}
