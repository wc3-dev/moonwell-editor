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
 * mouse. An undo or redo of the terrain (the session's terrainVersion moving on without a stroke here) reads the scene
 * again, as does a paint that added a tile to the map's list, once its stroke ends.
 */

import { untrack } from "svelte";
import { fileUrl, mapScene, terrainStroke, terrainStrokeEnd, terrainUrl } from "../api.ts";
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
import { brushOutline, terrainTools } from "./terrainTools.svelte.ts";

type Props = {
  /** The graphics mode the map is drawn in: `sd`, `hd` or `de`. */
  mode: string;
  /** The session's terrain version (SessionState.terrainVersion): when it moves on, the terrain changed. */
  terrainVersion?: number;
};

let { mode, terrainVersion = 0 }: Props = $props();

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
let renderer: MapRenderer | null = null;
let frame = 0;
let hoverFrame = 0;
/** A middle drag: what it does, chosen when it starts (Blender's: Shift pans, Ctrl zooms, else it orbits). */
let drag: { x: number; y: number; does: "orbit" | "pan" | "zoom" } | null = null;
let press: { x: number; y: number } | null = null;
/** Goes up to read the scene again (after an undo of the terrain, or a paint that added a tile). */
let reloads = $state(0);
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
};
let stroke: Stroke | null = null;
/** Why the last brush step was refused, until the next stroke. */
let refused = $state("");
const editing = $derived(terrainTools.group === "ground" && picking.kind === null);

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

// An undo or redo of the terrain: read the scene again (not while a stroke of this view's is under way).
$effect(() => {
  const version = terrainVersion;
  if (version !== drawnVersion && !stroke) {
    drawnVersion = version;
    reloads++;
  }
});

async function open(
  shown: string,
  target: HTMLCanvasElement,
  signal: AbortSignal,
  keep: (host: GlHost) => void,
): Promise<void> {
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
    view = start(read, grid);
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
  if (current.reload) reloads++;
}

function onpointerdown(event: PointerEvent): void {
  if (event.button === 0 && editing) {
    startStroke(event);
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
    else selected = null;
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
