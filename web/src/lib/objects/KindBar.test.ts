// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import KindBar from "./KindBar.svelte";
import { kindNames } from "./tree.ts";

afterEach(cleanup);

test.each([
  ["unit", "user"],
  ["item", "sword"],
  ["destructable", "trees"],
  ["doodad", "lamp"],
  ["ability", "hand-fist"],
  ["buff", "flame"],
  ["upgrade", "layers-plus"],
] as const)("the %s button shows Lucide's %s icon", (kind, icon) => {
  render(KindBar, { kind: "unit", disabled: false, onkind: () => {} });
  const button = screen.getByRole("button", { name: kindNames[kind] });
  expect(button.querySelector("svg")?.classList).toContain(`lucide-${icon}`);
});
