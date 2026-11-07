/**
 * The Terrain Editor's tools: which group the header has on (none: the view selects and picks as before), its tool
 * (each group keeps the last one used), the brush's outline, size and strength, the tile a paint gives and the cliff
 * type a cliff tool gives. Kept for the session, as the object editor keeps its kind.
 */
import type { BrushShape, GroundTool, PlaceKind, ThingKind } from "../bridge.gen.ts";

/** The header's groups of terrain tools: the brushes' (the design's steps 1 and 2), then those to come. */
export type ToolGroup = "ground" | "cliffs" | "water" | "place" | "regions" | "cameras";

/** The groups whose tools are brushes on the ground. */
export type BrushGroup = "ground" | "cliffs" | "water";

export const terrainTools = $state<{
  group: ToolGroup | null;
  tool: GroundTool;
  last: Record<BrushGroup, GroundTool>;
  shape: BrushShape;
  size: number;
  strength: number;
  tile: string | null;
  cliffType: number;
  /** The Place group's choice: the kind and type of thing a click places, and the player a unit goes to. */
  place: { kind: PlaceKind; type: string | null; owner: number };
  /** The region or camera chosen on the map in the Regions or Cameras group, for the dock; null for none. */
  mark: { kind: "region" | "camera"; number: number; name: string; detail: string } | null;
  /** The placed thing chosen on the map in the Place group, for the dock; null for none. */
  chosen: { number: number; kind: ThingKind; name: string; owner: number; scale: number } | null;
}>({
  group: null,
  tool: "Paint",
  last: { ground: "Paint", cliffs: "CliffUp", water: "ShallowWater" },
  shape: "Circle",
  size: 3,
  strength: 16,
  tile: null,
  cliffType: 0,
  place: { kind: "Unit", type: null, owner: 0 },
  mark: null,
  chosen: null,
});

/** What the dock asks of the map view for regions and cameras; the view sets these while it shows. */
export const chosenMark: {
  rename: ((name: string) => void) | null;
  newCamera: (() => void) | null;
  aim: (() => void) | null;
  look: (() => void) | null;
} = { rename: null, newCamera: null, aim: null, look: null };

/** What the dock asks of the map view for the thing chosen; the view sets these while it shows. */
export const chosenThing: {
  own: ((owner: number) => void) | null;
  resize: ((scale: number) => void) | null;
} = {
  own: null,
  resize: null,
};

/** Whether `group` is one whose tools are brushes. */
export function isBrushGroup(group: ToolGroup | null): group is BrushGroup {
  return group === "ground" || group === "cliffs" || group === "water";
}

/** Turns `group` on (a brush group with the tool it had last), or off when it is on. */
export function toggleGroup(group: ToolGroup): void {
  terrainTools.chosen = null;
  terrainTools.mark = null;
  if (terrainTools.group === group) {
    terrainTools.group = null;
    return;
  }
  terrainTools.group = group;
  if (isBrushGroup(group)) terrainTools.tool = terrainTools.last[group];
}

/** Picks `tool` in the group that is on, which keeps it for next time. */
export function chooseTool(tool: GroundTool): void {
  terrainTools.tool = tool;
  if (isBrushGroup(terrainTools.group)) terrainTools.last[terrainTools.group] = tool;
}

/** The largest brush, as the app allows (GroundTools.Largest). */
export const largestBrush = 8;

/**
 * The outline of a brush of `size` at `x`, `y` (2 × size − 1 corners across, as World Editor's), as a loop of points on
 * the map: round or square around the corner nearest, half a tile outside the corners it covers, as the app's
 * GroundTools.Covered counts them. A ramp (`tiles`) covers 2 × size − 1 tiles around the tile under it instead.
 */
export function brushOutline(
  left: number,
  bottom: number,
  x: number,
  y: number,
  shape: BrushShape,
  size: number,
  tiles = false,
): [number, number][] {
  const snap = (value: number) => (tiles ? Math.floor(value) + 0.5 : Math.round(value));
  const cx = left + snap((x - left) / 128) * 128;
  const cy = bottom + snap((y - bottom) / 128) * 128;
  const radius = ((2 * size - 1) / 2) * 128;
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
