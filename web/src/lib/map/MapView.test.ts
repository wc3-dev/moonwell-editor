// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { later } from "../../test/fakeApp.ts";
import { t } from "../text.ts";
import MapView from "./MapView.svelte";
import type { MapSceneView, PlacedThing } from "./scene.ts";

const fake = vi.hoisted(() => ({
  scenes: new Map<string, Promise<unknown>>(),
  hosts: 0,
  selectMarks: 0,
  highlights: 0,
}));

vi.mock("../api.ts", async (original) => ({
  ...(await original<typeof import("../api.ts")>()),
  mapScene: (mode: string) => fake.scenes.get(mode),
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
    setHighlight(): void {
      fake.highlights++;
    }
    selectMark(): void {
      fake.selectMarks++;
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

function scene(): MapSceneView {
  return {
    columns: 2,
    rows: 2,
    left: 0,
    bottom: 0,
    things: [footman as PlacedThing],
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
  await fireEvent.pointerMove(screen.getByLabelText(t("main.map")), { clientX: 5, clientY: 5 });
  await waitFor(() => expect(fake.highlights).toBeGreaterThan(0));
  expect(fake.selectMarks).toBe(0);
});
