<script lang="ts">
/**
 * The map view (the Terrain Editor button): the whole map drawn with WebGL2, read only. It asks the app for the scene
 * each time it opens, so it shows the session's current objects (Review Focus 4). The mouse and keys are Blender's
 * (Sven, 2026-10-29): a middle drag orbits, Shift with it pans, Ctrl with it zooms, the wheel zooms; the numpad's 1, 3
 * and 7 look from the front, right and top (Ctrl the opposite side), 2, 4, 6 and 8 orbit (Ctrl pans), 9 turns round,
 * + and - zoom; Home frames the map, the numpad's . the selection. The camera starts over player 1's start location,
 * else the map's middle.
 *
 * Hovering highlights what is under the mouse and a click selects it; the line at the bottom names it, with the name
 * triggers use for it. In pick mode (`pickOnMap`, for the trigger editor) a click on the asked kind answers, Esc
 * cancels.
 *
 * With the header's ground tools on (terrainTools), a left drag is a brush stroke instead: each step goes to the app,
 * which changes the terrain and answers with the part to redraw; one request at a time, the mouse's points gathered
 * meanwhile. Raise, lower and smooth keep working while the button is held still. The brush's outline follows the
 * mouse. A cliff or water stroke redraws the ground as it goes and the cliff models when it ends.
 *
 * With the Place group on, a click on the ground places the type chosen in the dock, a click on a thing chooses it,
 * and a drag of the chosen thing moves it there; the keys for "turn the thing" (R) and "delete" (Delete) turn and
 * remove it (Sven, 2026-11-06). Each change is one undo step; the view then draws the app's list of things again,
 * keeping the models it has.
 *
 * With the Regions group on, a drag on the ground draws a region, a drag of one moves it, and a drag of the chosen one's
 * corner resizes it. With the Cameras group on, a drag of a camera's cross moves what it looks at; the dock makes one
 * from the view, aims the chosen one at the view, or looks through it. Delete removes the chosen one. An undo or redo
 * of the terrain (the session's terrainVersion moving on without a stroke here) reads the scene again, as does a paint
 * that added a tile to the map's list, once its stroke ends; the view and what is chosen stay.
 */

import { untrack } from "svelte";
import {
  fileUrl,
  mapScene,
  terrainCamera,
  terrainCameraRemove,
  terrainCliffs,
  terrainMarks,
  terrainPlace,
  terrainRegion,
  terrainRegionRemove,
  terrainStroke,
  terrainStrokeEnd,
  terrainThing,
  terrainThings,
  terrainUndone,
  terrainUrl,
} from "../api.ts";
import { actionOf, defaultKeymap, type Keymap } from "../app/keymap.ts";
import type { CameraMark, RegionMark, ThingChange } from "../bridge.gen.ts";
import { errorText } from "../errors.ts";
import { type TextKey, t } from "../text.ts";
import { framed, numpadView, orbited, panned, ray, type View, zoomed } from "./camera.ts";
import { GlHost } from "./gl/host.ts";
import { allLayers, type Layers, MapRenderer } from "./gl/renderer.ts";
import { groundPoint } from "./groundRay.ts";
import { answer, picking } from "./pick.svelte.ts";
import { cameraAt, choose, type Pick, type PickKind, regionAt } from "./picking.ts";
import {
  groundAt,
  type MapSceneView,
  patchTerrain,
  readTerrain,
  type Terrain,
  type ThingKind,
} from "./scene.ts";
import {
  brushOutline,
  chosenMark,
  chosenThing,
  isBrushGroup,
  terrainTools,
} from "./terrainTools.svelte.ts";

type Props = {
  /** The graphics mode the map is drawn in: `sd`, `hd` or `de`. */
  mode: string;
  /** The session's terrain version (SessionState.terrainVersion): when it moves on, the terrain changed. */
  terrainVersion?: number;
  /** The keys, for the Place group's turn and delete. */
  keymap?: Keymap;
};

let { mode, terrainVersion = 0, keymap = defaultKeymap() }: Props = $props();

let canvas: HTMLCanvasElement | undefined = $state();
let status = $state<"loading" | "ready" | "failed">("loading");
let failure = $state("");
let problems = $state<string[]>([]);
let software = $state(false);
/** What the mouse is over, and what a click selected. */
let hovered = $state<Pick | null>(null);
let selected = $state<Pick | null>(null);
let layers = $state<Layers>(allLayers);

/** The game's own camera looks down 56 degrees from 1650 away (angle of attack 304). */
const pitch = (56 * Math.PI) / 180;
/** How near the mouse must be to a camera's target to pick it, in world units. */
const cameraReach = 96;
let view: View = { x: 0, y: 0, z: 0, distance: 1650, yaw: 0, pitch };
let scene: MapSceneView | null = null;
let terrain: Terrain | null = null;
let renderer: MapRenderer | null = $state.raw(null);
let frame = 0;
let hoverFrame = 0;
/** A middle drag: what it does, chosen when it starts (Blender's: Shift pans, Ctrl zooms, else it orbits). */
let drag: { x: number; y: number; does: "orbit" | "pan" | "zoom" } | null = null;
let press: { x: number; y: number } | null = null;
/** Goes up to read the scene again (after an undo of the terrain, or a paint that added a tile). */
let reloads = $state(0);
/** Whether the next read of the scene is a reload, which keeps the view and what is chosen. */
let keepView = false;
/** The terrain version the view draws: the session's when read, plus each stroke step here that changed it. */
let drawnVersion = 0;
/** A brush stroke under way: the points not sent yet, whether a step is on its way, and whether the button is up. */
type Stroke = {
  pending: number[][];
  first: boolean;
  busy: boolean;
  ended: boolean;
  last: [number, number] | null;
  repeat: number;
  reload: boolean;
  cliffs: boolean;
};
let stroke: Stroke | null = null;
/** Why the last brush step was refused, until the next stroke. */
let refused = $state("");
const editing = $derived(isBrushGroup(terrainTools.group) && picking.kind === null);
const placing = $derived(terrainTools.group === "place" && picking.kind === null);
/** A change to a placed thing on its way to the app: the view waits for it before reading the version. */
let thingBusy = false;
/** A press on the chosen thing in the Place group, which a drag turns into a move. */
let carry: { x: number; y: number; number: number; moved: boolean } | null = null;
const marking = $derived(
  (terrainTools.group === "regions" || terrainTools.group === "cameras") && picking.kind === null,
);
/** A drag in the Regions or Cameras group: drawing a region, moving one or a camera, or resizing a region. */
let shaping: {
  does: "draw" | "move" | "resize";
  number: number;
  from: [number, number];
  to: [number, number];
  /** The rectangle it started as (a region's), or the corner that stays (a resize's, as left = right). */
  rect: [number, number, number, number];
} | null = null;

// The view's camera in the game's terms, and back: the game turns from east and tilts below 360.
const degrees = (radians: number) => (radians * 180) / Math.PI;
function aimOf(view: View): { rotation: number; angleOfAttack: number; distance: number } {
  return {
    rotation: 90 - degrees(view.yaw),
    angleOfAttack: 360 - degrees(view.pitch),
    distance: view.distance,
  };
}

// The dock's changes to the chosen region or camera go through the view, which draws them.
$effect(() => {
  chosenMark.rename = (name) => {
    const mark = terrainTools.mark;
    const region = mark?.kind === "region" ? scene?.regions[mark.number - 1] : undefined;
    const camera = mark?.kind === "camera" ? scene?.cameras[mark.number - 1] : undefined;
    if (mark && region)
      void changeMark("region", () =>
        terrainRegion({ number: mark.number, ...rectOf(region), name }),
      );
    if (mark && camera)
      void changeMark("camera", () => terrainCamera({ ...cameraArgs(mark.number, camera), name }));
  };
  chosenMark.newCamera = () =>
    void changeMark("camera", () =>
      terrainCamera({ number: 0, x: view.x, y: view.y, ...aimOf(view), name: null }),
    );
  chosenMark.aim = () => {
    const mark = terrainTools.mark;
    const camera = mark?.kind === "camera" ? scene?.cameras[mark.number - 1] : undefined;
    if (mark && camera)
      void changeMark("camera", () =>
        terrainCamera({
          number: mark.number,
          x: view.x,
          y: view.y,
          ...aimOf(view),
          name: camera.name,
        }),
      );
  };
  chosenMark.look = () => {
    const mark = terrainTools.mark;
    const camera = mark?.kind === "camera" ? scene?.cameras[mark.number - 1] : undefined;
    if (!camera) return;
    const radians = (value: number) => (value * Math.PI) / 180;
    move({
      x: camera.x,
      y: camera.y,
      z: 0,
      distance: camera.distance,
      yaw: radians(90 - camera.rotation),
      pitch: Math.min(
        Math.max(radians(360 - camera.angleOfAttack), -Math.PI / 2 + 0.001),
        Math.PI / 2 - 0.001,
      ),
    });
  };
  return () => {
    chosenMark.rename = null;
    chosenMark.newCamera = null;
    chosenMark.aim = null;
    chosenMark.look = null;
  };
});

// The dock's changes to the chosen thing go through the view, which draws them.
$effect(() => {
  chosenThing.own = (owner) => {
    const number = terrainTools.chosen?.number;
    if (number)
      void changeThing(() => terrainThing.own({ number, owner, x: 0, y: 0, degrees: 0, scale: 1 }));
  };
  chosenThing.resize = (scale) => {
    const number = terrainTools.chosen?.number;
    if (number)
      void changeThing(() =>
        terrainThing.resize({ number, scale, x: 0, y: 0, degrees: 0, owner: 0 }),
      );
  };
  return () => {
    chosenThing.own = null;
    chosenThing.resize = null;
  };
});

/** The kinds a layer switch shows or hides. */
const thingLayers: { kinds: ThingKind[]; key: TextKey }[] = [
  { kinds: ["Doodad"], key: "mapView.layer.doodads" },
  { kinds: ["Destructable"], key: "mapView.layer.destructables" },
  { kinds: ["Unit"], key: "mapView.layer.units" },
  { kinds: ["Item"], key: "mapView.layer.items" },
  { kinds: ["StartLocation"], key: "mapView.layer.startLocations" },
];
/** The pick kinds, each with its name's key, in the order the menu lists them. */
const kindNames: Record<PickKind, TextKey> = {
  unit: "mapView.kind.unit",
  item: "mapView.kind.item",
  destructable: "mapView.kind.destructable",
  doodad: "mapView.kind.doodad",
  startLocation: "mapView.kind.startLocation",
  region: "mapView.kind.region",
  camera: "mapView.kind.camera",
  point: "mapView.kind.point",
};

/** The host made last, whatever the mode: when the view goes, its context goes back to the browser. */
let lastHost: GlHost | null = null;
$effect(() => {
  if (!canvas) return;
  return () => lastHost?.stop(true);
});

$effect(() => {
  const shown = mode;
  const target = canvas;
  void reloads;
  if (!target) return;
  let host: GlHost | null = null;
  const stop = new AbortController();
  void open(shown, target, stop.signal, (made) => {
    host = made;
    lastHost = made;
  });
  const resize = new ResizeObserver(() => sizeCanvas(target));
  resize.observe(target);
  return () => {
    stop.abort();
    resize.disconnect();
    host?.stop();
    if (frame) cancelAnimationFrame(frame);
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    frame = 0;
    hoverFrame = 0;
  };
});

// The white diamond follows what is hovered and selected; a selected region or camera is drawn white.
$effect(() => {
  const marked = [hovered, selected].filter((pick): pick is Pick => !!pick && pick.typeId !== null);
  const things = scene?.things ?? [];
  renderer?.setHighlight(
    things.filter((thing) =>
      marked.some((pick) =>
        pick.ref ? pick.ref === thing.ref : pick.x === thing.x && pick.y === thing.y,
      ),
    ),
  );
});

$effect(() => {
  renderer?.selectMark(
    selected && (selected.kind === "region" || selected.kind === "camera") ? selected.ref : null,
  );
});

$effect(() => {
  renderer?.setLayers(layers);
});

// The brush's outline shows only while the ground tools are on.
$effect(() => {
  if (!editing) renderer?.setBrush(null);
});

// An undo or redo of the terrain: redraw what it changed (not while a stroke of this view's is under way).
$effect(() => {
  if (terrainVersion !== drawnVersion && !stroke && !thingBusy) void catchUp();
});

/** Redraws what the undos and redos since the view last asked changed; the whole scene only when the tiles changed. */
async function catchUp(): Promise<void> {
  if (!renderer || !terrain || !scene) {
    drawnVersion = untrack(() => terrainVersion);
    reload();
    return;
  }
  thingBusy = true;
  try {
    const change = await terrainUndone(mode);
    drawnVersion = change.version;
    const ground = change.ground;
    if (ground.tiles) {
      reload();
      return;
    }
    if (ground.columns > 0) {
      patchTerrain(terrain, Uint8Array.from(atob(ground.bytes), (c) => c.charCodeAt(0)).buffer);
      renderer.terrainChanged();
    }
    if (ground.cliffs) renderer.setCliffs(await terrainCliffs(mode), [view.x, view.y]);
    if (change.things) {
      const things = await terrainThings(mode);
      scene = { ...scene, things };
      renderer.setThings(things, [view.x, view.y]);
      const number = terrainTools.chosen?.number ?? 0;
      chooseThing(number <= things.length ? number : 0);
    }
    if (change.marks) {
      const marks = await terrainMarks();
      scene = { ...scene, regions: marks.regions, cameras: marks.cameras };
      renderer.setMarks(marks.regions, marks.cameras);
      if (terrainTools.mark) chooseMark(terrainTools.mark.kind, terrainTools.mark.number);
    }
  } catch {
    reload();
    return;
  } finally {
    thingBusy = false;
  }
  // Another undo while this one was on its way.
  if (untrack(() => terrainVersion) !== drawnVersion) void catchUp();
}

function reload(): void {
  keepView = true;
  reloads++;
}

async function open(
  shown: string,
  target: HTMLCanvasElement,
  signal: AbortSignal,
  keep: (host: GlHost) => void,
): Promise<void> {
  const reloading = keepView;
  keepView = false;
  status = "loading";
  problems = [];
  const started = performance.now();
  try {
    drawnVersion = untrack(() => terrainVersion);
    const read = await mapScene(shown);
    if (signal.aborted) return;
    problems = read.problems;
    scene = read;
    if (read.columns === 0) {
      status = "ready";
      return;
    }
    const response = await fetch(terrainUrl(shown), { signal });
    if (!response.ok) throw new Error(t("mapView.noTerrain"));
    const grid = readTerrain(await response.arrayBuffer(), read.left, read.bottom);
    if (signal.aborted) return;
    console.info(`[timing] map scene ${Math.round(performance.now() - started)} ms`);
    terrain = grid;
    view = reloading ? { ...view, z: groundAt(grid, view.x, view.y) } : start(read, grid);
    if (reloading && terrainTools.mark)
      chooseMark(terrainTools.mark.kind, terrainTools.mark.number);
    if (reloading && terrainTools.chosen) chooseThing(terrainTools.chosen.number);
    sizeCanvas(target);
    keep(
      new GlHost(target, (gl) => {
        software = softwareRenderer(gl);
        renderer = new MapRenderer(
          gl,
          read,
          grid,
          (path) => fileUrl(path, shown),
          redraw,
          (what, ms) => console.info(`[timing] map ${what} ${Math.round(ms)} ms`),
          [view.x, view.y],
        );
        renderer.setLayers(layers);
        redraw();
        return () => {
          renderer?.dispose();
          renderer = null;
        };
      }),
    );
    status = "ready";
  } catch (error) {
    if (signal.aborted) return;
    failure = errorText(error);
    status = "failed";
  }
}

/** Over player 1's start location, else the map's middle. */
function start(read: MapSceneView, grid: Terrain): View {
  const home = read.things.find((thing) => thing.kind === "StartLocation" && thing.player === 0);
  const x = home?.x ?? grid.left + ((grid.columns - 1) * 128) / 2;
  const y = home?.y ?? grid.bottom + ((grid.rows - 1) * 128) / 2;
  return { x, y, z: groundAt(grid, x, y), distance: 1650, yaw: 0, pitch };
}

/** Whether WebView2 draws without the graphics card (Chrome's software renderers), which is slow. */
function softwareRenderer(gl: WebGL2RenderingContext): boolean {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  return /swiftshader|basic render|llvmpipe|software/i.test(name);
}

function sizeCanvas(target: HTMLCanvasElement): void {
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(target.clientWidth * scale));
  const height = Math.max(1, Math.round(target.clientHeight * scale));
  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }
  redraw();
}

function redraw(): void {
  if (frame) return;
  frame = requestAnimationFrame((now) => {
    frame = 0;
    if (!canvas || !renderer) return;
    renderer.draw(view, canvas.width, canvas.height, now);
    // Animations and water keep the scene drawing, a frame at a time.
    if (renderer.moving) redraw();
  });
}

/** Moves the camera and keeps it looking at the ground. */
function move(next: View): void {
  view = terrain ? { ...next, z: groundAt(terrain, next.x, next.y) } : next;
  redraw();
}

/** World units a pixel moves at the camera's target. */
function perPixel(): number {
  return (2 * view.distance * Math.tan(Math.PI / 6)) / Math.max(canvas?.clientHeight ?? 1, 1);
}

/** What is under the mouse at `clientX`, `clientY`, as a click would pick it. */
function under(clientX: number, clientY: number): Pick | null {
  if (!canvas || !renderer || !scene || !terrain) return null;
  const box = canvas.getBoundingClientRect();
  const scale = canvas.width / Math.max(box.width, 1);
  const px = (clientX - box.left) * scale;
  const py = (clientY - box.top) * scale;
  const number = renderer.pickAt(view, canvas.width, canvas.height, px, py);
  const thing = number > 0 ? (scene.things[number - 1] ?? null) : null;
  const { origin, direction } = ray(view, canvas.width, canvas.height, px, py);
  const point = groundPoint(terrain, origin, direction);
  const region = point && layers.regions ? regionAt(scene.regions, point[0], point[1]) : null;
  const camera =
    point && layers.cameras ? cameraAt(scene.cameras, point[0], point[1], cameraReach) : null;
  return choose({ thing, region, camera, point }, picking.kind);
}

function onwheel(event: WheelEvent): void {
  event.preventDefault();
  move(zoomed(view, -Math.sign(event.deltaY)));
}

/** The ground under the mouse, as x and y; null off the map. */
function groundUnder(clientX: number, clientY: number): [number, number] | null {
  if (!canvas || !terrain) return null;
  const box = canvas.getBoundingClientRect();
  const scale = canvas.width / Math.max(box.width, 1);
  const { origin, direction } = ray(
    view,
    canvas.width,
    canvas.height,
    (clientX - box.left) * scale,
    (clientY - box.top) * scale,
  );
  const point = groundPoint(terrain, origin, direction);
  return point ? [point[0], point[1]] : null;
}

function showBrush(at: [number, number] | null): void {
  if (!renderer || !terrain) return;
  renderer.setBrush(
    at
      ? brushOutline(
          terrain.left,
          terrain.bottom,
          at[0],
          at[1],
          terrainTools.shape,
          terrainTools.size,
        )
      : null,
  );
}

function startStroke(event: PointerEvent): void {
  const at = groundUnder(event.clientX, event.clientY);
  if (!at) return;
  canvas?.setPointerCapture(event.pointerId);
  refused = "";
  const begun: Stroke = {
    pending: [at],
    first: true,
    busy: false,
    ended: false,
    last: at,
    repeat: 0,
    reload: false,
    cliffs: false,
  };
  if (
    terrainTools.tool === "Raise" ||
    terrainTools.tool === "Lower" ||
    terrainTools.tool === "Smooth"
  ) {
    begun.repeat = window.setInterval(() => {
      if (begun.last && !begun.ended) {
        begun.pending.push(begun.last);
        void sendStroke(begun);
      }
    }, 100);
  }
  stroke = begun;
  void sendStroke(begun);
}

/** Sends the points gathered, unless a step is on its way; ends the stroke once the button is up and all are sent. */
async function sendStroke(current: Stroke): Promise<void> {
  if (current.busy) return;
  if (current.pending.length === 0) {
    if (current.ended) await endStroke(current);
    return;
  }
  const points = current.pending;
  current.pending = [];
  current.busy = true;
  try {
    const change = await terrainStroke({
      tool: terrainTools.tool,
      points,
      shape: terrainTools.shape,
      size: terrainTools.size,
      strength: terrainTools.strength,
      tile: terrainTools.tool === "Paint" ? terrainTools.tile : null,
      cliffType: terrainTools.cliffType,
      first: current.first,
      mode,
    });
    current.first = false;
    if (change.columns > 0 && terrain && renderer) {
      patchTerrain(terrain, Uint8Array.from(atob(change.bytes), (c) => c.charCodeAt(0)).buffer);
      renderer.terrainChanged();
      drawnVersion++;
    }
    current.reload ||= change.tiles;
    current.cliffs ||= change.cliffs;
  } catch (error) {
    refused = errorText(error);
    current.pending = [];
    current.ended = true;
  } finally {
    current.busy = false;
  }
  await sendStroke(current);
}

async function endStroke(current: Stroke): Promise<void> {
  window.clearInterval(current.repeat);
  if (stroke === current) stroke = null;
  await terrainStrokeEnd().catch((error) => {
    refused = errorText(error);
  });
  if (current.reload) reload();
  else if (current.cliffs) {
    // The ground was redrawn as the stroke went; the cliff models once it ends.
    await terrainCliffs(mode).then(
      (pieces) => renderer?.setCliffs(pieces, [view.x, view.y]),
      (error) => {
        refused = errorText(error);
      },
    );
  }
}

/** The number of the placed thing under the mouse; 0 for none. */
function thingUnder(clientX: number, clientY: number): number {
  if (!canvas || !renderer) return 0;
  const box = canvas.getBoundingClientRect();
  const scale = canvas.width / Math.max(box.width, 1);
  return renderer.pickAt(
    view,
    canvas.width,
    canvas.height,
    (clientX - box.left) * scale,
    (clientY - box.top) * scale,
  );
}

/** Chooses placed thing `number` (0 for none): the dock shows it, and the view marks it. */
function chooseThing(number: number): void {
  const thing = number > 0 ? scene?.things[number - 1] : undefined;
  terrainTools.chosen = thing
    ? { number, kind: thing.kind, name: thing.name, owner: thing.owner, scale: thing.scaleX }
    : null;
  selected = thing ? choose({ thing, region: null, camera: null, point: null }, null) : null;
}

function rectOf(region: RegionMark): { left: number; bottom: number; right: number; top: number } {
  return { left: region.left, bottom: region.bottom, right: region.right, top: region.top };
}

function cameraArgs(number: number, camera: CameraMark) {
  return {
    number,
    x: camera.x,
    y: camera.y,
    rotation: camera.rotation,
    angleOfAttack: camera.angleOfAttack,
    distance: camera.distance,
    name: camera.name,
  };
}

/** Chooses region or camera `number` (0 for none): the dock shows it, and the view draws it white. */
function chooseMark(kind: "region" | "camera", number: number): void {
  const region = kind === "region" && number > 0 ? scene?.regions[number - 1] : undefined;
  const camera = kind === "camera" && number > 0 ? scene?.cameras[number - 1] : undefined;
  const round = Math.round;
  terrainTools.mark = region
    ? {
        kind,
        number,
        name: region.name,
        detail: `${round(region.left)}, ${round(region.bottom)} – ${round(region.right)}, ${round(region.top)}`,
      }
    : camera
      ? {
          kind,
          number,
          name: camera.name,
          detail: `${round(camera.x)}, ${round(camera.y)} · ${round(camera.rotation)}° · ${round(camera.angleOfAttack)}°`,
        }
      : null;
  selected =
    region || camera
      ? choose({ thing: null, region: region ?? null, camera: camera ?? null, point: null }, null)
      : null;
}

/** Sends a change to a region or camera, then draws the app's regions and cameras again and chooses the one it names. */
async function changeMark(
  kind: "region" | "camera",
  change: () => Promise<ThingChange>,
): Promise<void> {
  if (!renderer || !scene) return;
  thingBusy = true;
  refused = "";
  try {
    const result = await change();
    drawnVersion = result.version;
    const marks = await terrainMarks();
    scene = { ...scene, regions: marks.regions, cameras: marks.cameras };
    renderer.setMarks(marks.regions, marks.cameras);
    chooseMark(
      kind,
      result.number <= (kind === "region" ? marks.regions : marks.cameras).length
        ? result.number
        : 0,
    );
  } catch (error) {
    refused = errorText(error);
  } finally {
    thingBusy = false;
  }
}

/** The rectangle a drag in the Regions group makes, as left, bottom, right, top. */
function shapedRect(drag: NonNullable<typeof shaping>): [number, number, number, number] {
  const [x, y] = drag.to;
  if (drag.does === "draw") return [drag.from[0], drag.from[1], x, y];
  if (drag.does === "resize") return [drag.rect[0], drag.rect[1], x, y];
  const [dx, dy] = [x - drag.from[0], y - drag.from[1]];
  return [drag.rect[0] + dx, drag.rect[1] + dy, drag.rect[2] + dx, drag.rect[3] + dy];
}

function startMark(event: PointerEvent): void {
  const at = groundUnder(event.clientX, event.clientY);
  if (!at || !scene) return;
  canvas?.setPointerCapture(event.pointerId);
  if (terrainTools.group === "cameras") {
    const camera = cameraAt(scene.cameras, at[0], at[1], Math.max(cameraReach, perPixel() * 12));
    const number = camera ? scene.cameras.indexOf(camera) + 1 : 0;
    chooseMark("camera", number);
    if (camera)
      shaping = {
        does: "move",
        number,
        from: at,
        to: at,
        rect: [camera.x, camera.y, camera.x, camera.y],
      };
    return;
  }
  // The chosen region's corner, near enough, resizes it from the corner across.
  const reach = Math.max(48, perPixel() * 10);
  const chosen =
    terrainTools.mark?.kind === "region" ? scene.regions[terrainTools.mark.number - 1] : undefined;
  if (chosen && terrainTools.mark) {
    for (const [cx, cy, ox, oy] of [
      [chosen.left, chosen.bottom, chosen.right, chosen.top],
      [chosen.right, chosen.bottom, chosen.left, chosen.top],
      [chosen.left, chosen.top, chosen.right, chosen.bottom],
      [chosen.right, chosen.top, chosen.left, chosen.bottom],
    ] as const) {
      if (Math.hypot(at[0] - cx, at[1] - cy) <= reach) {
        shaping = {
          does: "resize",
          number: terrainTools.mark.number,
          from: at,
          to: at,
          rect: [ox, oy, ox, oy],
        };
        return;
      }
    }
  }
  const region = regionAt(scene.regions, at[0], at[1]);
  if (region) {
    const number = scene.regions.indexOf(region) + 1;
    chooseMark("region", number);
    shaping = {
      does: "move",
      number,
      from: at,
      to: at,
      rect: [region.left, region.bottom, region.right, region.top],
    };
    return;
  }
  chooseMark("region", 0);
  shaping = { does: "draw", number: 0, from: at, to: at, rect: [at[0], at[1], at[0], at[1]] };
}

/** Sends a change to a placed thing, then draws the app's things again and chooses the thing it names. */
async function changeThing(change: () => Promise<ThingChange>): Promise<void> {
  if (!renderer || !scene) return;
  thingBusy = true;
  refused = "";
  try {
    const result = await change();
    drawnVersion = result.version;
    const things = await terrainThings(mode);
    scene = { ...scene, things };
    renderer.setThings(things, [view.x, view.y]);
    chooseThing(result.number <= things.length ? result.number : 0);
  } catch (error) {
    refused = errorText(error);
  } finally {
    thingBusy = false;
  }
}

function startPlace(event: PointerEvent): void {
  const number = thingUnder(event.clientX, event.clientY);
  if (number > 0) {
    chooseThing(number);
    canvas?.setPointerCapture(event.pointerId);
    carry = { x: event.clientX, y: event.clientY, number, moved: false };
    return;
  }
  const at = groundUnder(event.clientX, event.clientY);
  const { kind, type, owner } = terrainTools.place;
  if (!at || !type) return;
  void changeThing(() => terrainPlace({ kind, typeId: type, x: at[0], y: at[1], owner }));
}

function onpointerdown(event: PointerEvent): void {
  if (event.button === 0 && editing) {
    startStroke(event);
    return;
  }
  if (event.button === 0 && placing) {
    startPlace(event);
    return;
  }
  if (event.button === 0 && marking) {
    startMark(event);
    return;
  }
  if (event.button === 0) {
    press = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.button !== 1) return;
  event.preventDefault();
  canvas?.setPointerCapture(event.pointerId);
  drag = {
    x: event.clientX,
    y: event.clientY,
    does: event.shiftKey ? "pan" : event.ctrlKey ? "zoom" : "orbit",
  };
}

function onpointermove(event: PointerEvent): void {
  if (drag) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag = { ...drag, x: event.clientX, y: event.clientY };
    if (drag.does === "orbit") move(orbited(view, dx, dy));
    else if (drag.does === "pan") move(panned(view, -dx * perPixel(), dy * perPixel()));
    else move(zoomed(view, -dy / 40));
    return;
  }
  if (shaping) {
    const at = groundUnder(event.clientX, event.clientY);
    if (at) shaping.to = at;
    if (shaping.does === "move" && terrainTools.group === "cameras") {
      if (renderer && terrain)
        renderer.setBrush(
          brushOutline(terrain.left, terrain.bottom, shaping.to[0], shaping.to[1], "Circle", 1),
        );
    } else {
      const [l, b, r, t] = shapedRect(shaping);
      renderer?.setBrush([
        [l, b],
        [r, b],
        [r, t],
        [l, t],
      ]);
    }
    return;
  }
  if (carry) {
    carry.moved ||= Math.hypot(event.clientX - carry.x, event.clientY - carry.y) >= 4;
    const at = carry.moved ? groundUnder(event.clientX, event.clientY) : null;
    if (renderer && terrain)
      renderer.setBrush(
        at ? brushOutline(terrain.left, terrain.bottom, at[0], at[1], "Square", 1) : null,
      );
    return;
  }
  if (editing) {
    const at = groundUnder(event.clientX, event.clientY);
    showBrush(at);
    if (stroke && at && !stroke.ended) {
      const last = stroke.last;
      // A point every quarter of the brush, at least every 32 game units, as the mouse goes.
      const spacing = Math.max(32, terrainTools.size * 32);
      if (!last || Math.hypot(at[0] - last[0], at[1] - last[1]) >= spacing) {
        stroke.pending.push(at);
        stroke.last = at;
        void sendStroke(stroke);
      }
    }
  }
  // What is under the mouse, once a frame.
  const { clientX, clientY } = event;
  if (hoverFrame) cancelAnimationFrame(hoverFrame);
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    hovered = under(clientX, clientY);
  });
}

function onpointerup(event: PointerEvent): void {
  if (drag) {
    canvas?.releasePointerCapture(event.pointerId);
    drag = null;
    return;
  }
  if (stroke && event.button === 0) {
    canvas?.releasePointerCapture(event.pointerId);
    stroke.ended = true;
    void sendStroke(stroke);
    return;
  }
  if (shaping && event.button === 0) {
    canvas?.releasePointerCapture(event.pointerId);
    renderer?.setBrush(null);
    const drag = shaping;
    shaping = null;
    if (Math.hypot(drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]) < 16) return;
    if (terrainTools.group === "cameras") {
      const camera = scene?.cameras[drag.number - 1];
      if (camera)
        void changeMark("camera", () =>
          terrainCamera({ ...cameraArgs(drag.number, camera), x: drag.to[0], y: drag.to[1] }),
        );
      return;
    }
    const [left, bottom, right, top] = shapedRect(drag);
    void changeMark("region", () =>
      terrainRegion({ number: drag.number, left, bottom, right, top, name: null }),
    );
    return;
  }
  if (carry && event.button === 0) {
    canvas?.releasePointerCapture(event.pointerId);
    renderer?.setBrush(null);
    const { number, moved } = carry;
    carry = null;
    const at = moved ? groundUnder(event.clientX, event.clientY) : null;
    if (at)
      void changeThing(() =>
        terrainThing.move({ number, x: at[0], y: at[1], degrees: 0, scale: 1, owner: 0 }),
      );
    return;
  }
  if (event.button !== 0 || !press) return;
  const still = Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4;
  press = null;
  if (!still) return;
  const pick = under(event.clientX, event.clientY);
  if (picking.kind !== null) {
    if (pick) answer(pick);
    return;
  }
  selected = pick;
}

function onpointerleave(): void {
  hovered = null;
  if (!stroke) showBrush(null);
}

function onkeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (picking.kind !== null) answer(null);
    else if (placing) chooseThing(0);
    else if (marking) chooseMark("region", 0);
    else selected = null;
    return;
  }
  const mark = marking ? terrainTools.mark : null;
  if (mark && actionOf(event, keymap) === "deleteObject") {
    event.preventDefault();
    void changeMark(mark.kind, () =>
      mark.kind === "region" ? terrainRegionRemove(mark.number) : terrainCameraRemove(mark.number),
    ).then(() => chooseMark(mark.kind, 0));
    return;
  }
  const number = placing ? terrainTools.chosen?.number : undefined;
  const action = number ? actionOf(event, keymap) : undefined;
  if (number && action === "turnThing") {
    event.preventDefault();
    void changeThing(() =>
      terrainThing.turn({ number, degrees: 45, x: 0, y: 0, scale: 1, owner: 0 }),
    );
    return;
  }
  if (number && action === "deleteObject") {
    event.preventDefault();
    void changeThing(() =>
      terrainThing.remove({ number, x: 0, y: 0, degrees: 0, scale: 1, owner: 0 }),
    ).then(() => chooseThing(0));
    return;
  }
  if (event.code === "Home" && terrain) {
    event.preventDefault();
    const right = terrain.left + (terrain.columns - 1) * 128;
    const top = terrain.bottom + (terrain.rows - 1) * 128;
    move(framed(view, terrain.left, terrain.bottom, right, top));
    return;
  }
  if (event.code === "NumpadDecimal") {
    event.preventDefault();
    const at = selected ?? hovered;
    if (at) move({ ...view, x: at.x, y: at.y, distance: Math.min(view.distance, 900) });
    return;
  }
  const next = numpadView(view, event.code, event.ctrlKey);
  if (!next) return;
  event.preventDefault();
  move(next);
}

// Esc cancels pick mode from anywhere in the window, not only the canvas.
function onwindowkeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && picking.kind !== null) answer(null);
}

function toggle(kinds: ThingKind[]): void {
  const next = new Set(layers.kinds);
  const on = kinds.every((kind) => next.has(kind));
  for (const kind of kinds) {
    if (on) next.delete(kind);
    else next.add(kind);
  }
  layers = { ...layers, kinds: next };
}

/** A pick in words: its name, its type, its trigger name, or a point's place. */
function describe(pick: Pick): string {
  if (pick.kind === "point") {
    return t("mapView.point", {
      x: Math.round(pick.x),
      y: Math.round(pick.y),
      z: Math.round(pick.z),
    });
  }
  return [pick.name, pick.typeId, pick.ref].filter(Boolean).join(" · ");
}

/** The selected or hovered thing's owner, for the line at the bottom. */
function ownerOf(pick: Pick): string {
  if (pick.kind !== "unit" && pick.kind !== "startLocation") return "";
  const thing = scene?.things.find(
    (each) => each.ref === pick.ref && each.x === pick.x && each.y === pick.y,
  );
  if (!thing) return "";
  if (thing.owner === 24) return t("app.folder.hostile");
  if (thing.owner === 27) return t("app.folder.passive");
  return t("mapView.player", { number: thing.owner + 1 });
}
</script>

<svelte:window onkeydown={onwindowkeydown} />

<div class="relative h-full min-h-0 overflow-hidden rounded-ui bg-[#0d0d12]" data-testid="map-view">
  <canvas
    bind:this={canvas}
    class="block h-full w-full outline-none"
    tabindex="0"
    aria-label={t("main.map")}
    {onwheel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    {onpointerleave}
    {onkeydown}
    oncontextmenu={(event) => event.preventDefault()}
  ></canvas>
  {#if status !== "ready" || problems.length > 0 || software || refused}
    <div class="pointer-events-none absolute left-3 top-3 flex max-w-md flex-col gap-1">
      {#if status === "loading"}
        <p class="rounded-ui bg-panel/90 px-2 py-1 text-muted">{t("mapView.loading")}</p>
      {:else if status === "failed"}
        <p class="rounded-ui bg-panel/90 px-2 py-1 text-warning">{t("mapView.failed", { error: failure })}</p>
      {/if}
      {#if software}
        <p class="rounded-ui bg-panel/90 px-2 py-1 text-warning">{t("mapView.software")}</p>
      {/if}
      {#if refused}
        <p class="rounded-ui bg-panel/90 px-2 py-1 text-warning" data-testid="terrain-refused">{refused}</p>
      {/if}
      {#each problems as problem (problem)}
        <p class="rounded-ui bg-panel/90 px-2 py-1 text-warning">{problem}</p>
      {/each}
    </div>
  {/if}
  <div
    class="absolute right-3 top-3 flex flex-col items-end gap-1"
    role="group"
    aria-label={t("mapView.layers")}
  >
    <div class="flex flex-wrap justify-end gap-1">
      {#each thingLayers as layer (layer.key)}
        <button
          type="button"
          class="rounded-ui bg-raised px-2 py-px {layer.kinds.every((kind) => layers.kinds.has(kind))
            ? 'text-normal'
            : 'text-muted line-through'}"
          aria-pressed={layer.kinds.every((kind) => layers.kinds.has(kind))}
          onclick={() => toggle(layer.kinds)}>{t(layer.key)}</button
        >
      {/each}
      <button
        type="button"
        class="rounded-ui bg-raised px-2 py-px {layers.regions ? 'text-normal' : 'text-muted line-through'}"
        aria-pressed={layers.regions}
        onclick={() => (layers = { ...layers, regions: !layers.regions })}>{t("mapView.layer.regions")}</button
      >
      <button
        type="button"
        class="rounded-ui bg-raised px-2 py-px {layers.cameras ? 'text-normal' : 'text-muted line-through'}"
        aria-pressed={layers.cameras}
        onclick={() => (layers = { ...layers, cameras: !layers.cameras })}>{t("mapView.layer.cameras")}</button
      >
    </div>
  </div>
  {#if picking.kind !== null}
    <p
      class="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-ui border border-accent bg-panel/95 px-3 py-1 text-normal"
      data-testid="pick-banner"
    >
      {t("mapView.picking", { kind: t(kindNames[picking.kind]) })}
    </p>
  {/if}
  {#if selected ?? hovered}
    {@const shown = selected ?? hovered}
    {#if shown}
      <p
        class="pointer-events-none absolute bottom-3 left-3 max-w-[80%] truncate rounded-ui bg-panel/90 px-2 py-1 text-normal"
        data-testid="map-selection"
      >
        {describe(shown)}{#if ownerOf(shown)}<span class="text-muted"> · {ownerOf(shown)}</span>{/if}
      </p>
    {/if}
  {/if}
</div>
