// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { later } from "../../test/fakeApp.ts";
import { t } from "../text.ts";
import MapView from "./MapView.svelte";
import MapViewHost from "./MapViewHost.test.svelte";
import type { MapSceneView, PlacedThing } from "./scene.ts";

const fake = vi.hoisted(() => ({
  scenes: new Map<string, Promise<unknown>>(),
  hosts: 0,
  selectMarks: 0,
  highlights: 0,
  reads: 0,
  patched: 0,
  undone: { left: 0, bottom: 0, columns: 0, rows: 0, bytes: "", tiles: false, cliffs: false },
}));

vi.mock("../api.ts", async (original) => ({
  ...(await original<typeof import("../api.ts")>()),
  mapScene: (mode: string) => {
    fake.reads++;
    return fake.scenes.get(mode);
  },
  terrainUndone: async () => ({ ground: fake.undone, things: false, marks: false, version: 1 }),
  terrainUrl: (mode: string) => `terrain/${mode}`,
}));

vi.mock("./gl/host.ts", () => ({
  GlHost: class {
    constructor(_canvas: HTMLCanvasElement, build: (gl: unknown) => () => void) {
      fake.hosts++;
      build({ getExtension: () => null, getParameter: () => "a graphics card", RENDERER: 0 });
    }
    stop(): void {}
  },
}));

vi.mock("./gl/renderer.ts", () => ({
  allLayers: { kinds: new Set(["Unit"]), regions: true, cameras: true },
  MapRenderer: class {
    moving = false;
    draw(): void {}
    setLayers(): void {}
    setBrush(): void {}
    setHighlight(): void {
      fake.highlights++;
    }
    selectMark(): void {
      fake.selectMarks++;
    }
    terrainChanged(): void {
      fake.patched++;
    }
    pickAt(): number {
      return 1;
    }
    dispose(): void {}
  },
}));

class NoResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const footman = {
  kind: "Unit",
  name: "Footman",
  ref: "gg_unit_hfoo_0001",
  typeId: "hfoo",
  x: 0,
  y: 0,
  z: 0,
};

function scene(things: object[] = [footman]): MapSceneView {
  return {
    columns: 2,
    rows: 2,
    left: 0,
    bottom: 0,
    things: things as PlacedThing[],
    regions: [],
    cameras: [],
    problems: [],
  } as unknown as MapSceneView;
}

// A 2 by 2 corner grid: its size, three floats a corner and 25 bytes a tile.
function terrain(): ArrayBuffer {
  const bytes = new ArrayBuffer(8 + 4 * 12 + 25);
  new Int32Array(bytes, 0, 2).set([2, 2]);
  return bytes;
}

beforeEach(() => {
  fake.scenes.clear();
  fake.hosts = 0;
  fake.selectMarks = 0;
  fake.highlights = 0;
  fake.reads = 0;
  fake.patched = 0;
  globalThis.ResizeObserver = NoResizeObserver as never;
  vi.stubGlobal("requestAnimationFrame", (draw: FrameRequestCallback) =>
    setTimeout(() => draw(performance.now())),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal("fetch", async () => ({ ok: true, arrayBuffer: async () => terrain() }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("a map still loading", () => {
  test("draws nothing once the view has gone", async () => {
    const answer = later(scene());
    fake.scenes.set("sd", answer.answer);
    const view = render(MapView, { mode: "sd" });
    view.unmount();
    answer.release();
    await settled();
    expect(fake.hosts).toBe(0);
  });

  test("is dropped when the mode changes, and the new mode's load is waited for", async () => {
    const sd = later(scene());
    const hd = later(scene());
    fake.scenes.set("sd", sd.answer);
    fake.scenes.set("hd", hd.answer);
    const view = render(MapView, { mode: "sd" });
    await view.rerender({ mode: "hd" });
    sd.release();
    await settled();
    expect(screen.getByText(t("mapView.loading"))).toBeTruthy();
    expect(fake.hosts).toBe(0);
    hd.release();
    await waitFor(() => expect(screen.queryByText(t("mapView.loading"))).toBeNull());
    expect(fake.hosts).toBe(1);
  });
});

test("hovering moves the highlight and leaves the regions' lines alone", async () => {
  fake.scenes.set("sd", Promise.resolve(scene()));
  render(MapView, { mode: "sd" });
  await waitFor(() => expect(fake.hosts).toBe(1));
  const [highlights, selectMarks] = [fake.highlights, fake.selectMarks];
  await fireEvent.pointerMove(screen.getByLabelText(t("main.map")), { clientX: 5, clientY: 5 });
  await waitFor(() => expect(fake.highlights).toBeGreaterThan(highlights));
  expect(fake.selectMarks).toBe(selectMarks);
});

test.each([
  [24, t("app.folder.hostile")],
  [27, t("app.folder.passive")],
  [2, t("mapView.player", { number: 3 })],
])("a unit owned by %i shows its owner, not the colour it takes", async (owner, shown) => {
  fake.scenes.set("sd", Promise.resolve(scene([{ ...footman, kind: "Unit", player: 5, owner }])));
  render(MapView, { mode: "sd" });
  await waitFor(() => expect(fake.hosts).toBe(1));
  await fireEvent.pointerMove(screen.getByLabelText(t("main.map")), { clientX: 5, clientY: 5 });
  await waitFor(() => expect(screen.getByText(new RegExp(shown))).toBeTruthy());
});

test("an undo of a stroke redraws the part it touched, without reading the map again", async () => {
  // A 1 by 1 patch of corner (1, 1): its head, then three floats.
  const patch = new ArrayBuffer(16 + 12);
  new Int32Array(patch, 0, 4).set([1, 1, 1, 1]);
  const bytes = btoa(String.fromCharCode(...new Uint8Array(patch)));
  fake.undone = { left: 1, bottom: 1, columns: 1, rows: 1, bytes, tiles: false, cliffs: false };
  fake.scenes.set("sd", Promise.resolve(scene()));
  const view = render(MapViewHost, { terrainVersion: 0 });
  await waitFor(() => expect(fake.hosts).toBe(1));
  await view.rerender({ terrainVersion: 1 });
  await waitFor(() => expect(fake.patched).toBe(1));
  await settled();
  expect(fake.reads).toBe(1);
  expect(fake.hosts).toBe(1);
});
