/**
 * The Terrain Editor's tools: which group the header has on (none: the view selects and picks as before), the ground
 * brush's tool, outline, size and strength, and the tile a paint gives. Kept for the session, as the object editor
 * keeps its kind.
 */
import type { BrushShape, GroundTool } from "../bridge.gen.ts";

/** The header's groups of terrain tools; only the ground's is built so far (the design's step 1). */
export type ToolGroup = "ground" | "cliffs" | "water" | "place" | "regions" | "cameras";

export const terrainTools = $state<{
  group: ToolGroup | null;
  tool: GroundTool;
  shape: BrushShape;
  size: number;
  strength: number;
  tile: string | null;
}>({ group: null, tool: "Paint", shape: "Circle", size: 3, strength: 32, tile: null });

/** The largest brush, as the app allows (GroundTools.Largest). */
export const largestBrush = 8;

/**
 * The outline of a brush of `size` corners across at `x`, `y`, as a loop of points on the map: round or square around
 * the corner nearest (an odd size) or the middle of the tile under it (an even size), half a tile outside the corners
 * it covers, as the app's GroundTools.Covered counts them.
 */
export function brushOutline(
  left: number,
  bottom: number,
  x: number,
  y: number,
  shape: BrushShape,
  size: number,
): [number, number][] {
  const u = (x - left) / 128;
  const v = (y - bottom) / 128;
  const [cu, cv] =
    size % 2 === 1 ? [Math.round(u), Math.round(v)] : [Math.floor(u) + 0.5, Math.floor(v) + 0.5];
  const [cx, cy] = [left + cu * 128, bottom + cv * 128];
  const radius = (size / 2) * 128;
  if (shape === "Square") {
    return [
      [cx - radius, cy - radius],
      [cx + radius, cy - radius],
      [cx + radius, cy + radius],
      [cx - radius, cy + radius],
    ];
  }
  const steps = Math.max(16, size * 8);
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as [number, number];
  });
}
