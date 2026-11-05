// @vitest-environment jsdom
import { expect, test } from "vitest";
import { type PreviewView, showModel } from "./modelPreview.ts";

test("a new model turns by itself again after the last was dragged still", () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const panel: PreviewView = {
    status: "ready",
    error: "",
    missing: [],
    sequences: [],
    playing: 0,
    turning: false,
    lifted: false,
  };
  const into = document.createElement("div");
  showModel(into, "footman.mdx", (path) => path, 100, 0, panel).stop();
  expect(panel.turning).toBe(true);
});
