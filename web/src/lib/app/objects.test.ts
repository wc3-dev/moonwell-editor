// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { FakeApp, footmanEntry, knightEntry, unit } from "../../test/fakeApp.ts";
import type { TreeEntry } from "../api.ts";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { Objects } from "./objects.svelte.ts";

afterEach(() => {
  delete window.chrome;
});

function objects(entries: TreeEntry[]): Objects {
  new FakeApp({ tree: entries, object: unit(footmanEntry) });
  return new Objects({
    queue: new CommandQueue(),
    history: new History(),
    scrollPosition: () => undefined,
  });
}

test("a name comes with its suffix, and bare", async () => {
  const each = objects([{ ...footmanEntry, suffix: "(Evil)" }]);
  await each.ensureTree("unit");
  expect(each.lookup("Unit", "h000")).toEqual({
    kind: "unit",
    name: "Footman (Evil)",
    bare: "Footman",
  });
});

test("an id no tree holds has no name", async () => {
  const each = objects([footmanEntry]);
  await each.ensureTree("unit");
  expect(each.lookup("Unit", "none")).toBeUndefined();
});

test("the kind's icons come in the tree's order, each once", async () => {
  const each = objects([
    { ...footmanEntry, icon: "b.blp" },
    { ...knightEntry, icon: "a.blp" },
    { ...footmanEntry, id: "h002", icon: "b.blp" },
  ]);
  await each.show("unit", "h000");
  await each.ensureTree("unit");
  expect(each.iconsOfKind).toEqual(["b.blp", "a.blp"]);
});

test("starting over forgets the trees and what was picked", async () => {
  const each = objects([footmanEntry]);
  await each.show("unit", "h000");
  await each.ensureTree("unit");
  each.startOver();
  expect(each.current).toBeNull();
  expect(each.trees).toEqual({});
  expect(each.picked).toEqual({});
});

test("switching to a kind shows what it last showed", async () => {
  const each = objects([footmanEntry]);
  await each.show("unit", "h000");
  each.switchKind("item");
  expect(each.current).toBeNull();
  each.switchKind("unit");
  expect(each.kind).toBe("unit");
  expect(each.picked.unit).toBe("h000");
});
