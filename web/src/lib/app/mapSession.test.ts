// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { arena, FakeApp, later } from "../../test/fakeApp.ts";
import { terrainTools } from "../map/terrainTools.svelte.ts";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { MapSession } from "./mapSession.svelte.ts";
import { Notices } from "./notices.svelte.ts";
import { Objects } from "./objects.svelte.ts";
import { Pages } from "./pages.svelte.ts";

afterEach(() => {
  delete window.chrome;
});

function session(): MapSession {
  const queue = new CommandQueue();
  const pages = new Pages();
  const objects = new Objects({
    queue,
    history: new History(),
    scrollPosition: () => undefined,
  });
  return new MapSession({
    queue,
    notices: new Notices(),
    objects,
    pages,
    terminals: { mapChanged() {} },
  });
}

test("with no map there is nothing to save", async () => {
  const app = new FakeApp();
  expect(await session().save()).toBe(false);
  expect(app.count("save")).toBe(0);
});

test("a save while one runs does nothing", async () => {
  const report = later({ written: [], backup: "", note: "" });
  const app = new FakeApp({ save: report.answer, tree: [] });
  const each = session();
  await each.show(arena);
  const first = each.save();
  await expect(each.save()).resolves.toBe(false);
  report.release();
  await expect(first).resolves.toBe(true);
  expect(app.count("save")).toBe(1);
});

test("another map or a reload lets go of what was chosen on the map", async () => {
  new FakeApp({ tree: [], reload: arena });
  const each = session();
  await each.show(arena);
  const choose = () => {
    terrainTools.chosen = { number: 5, kind: "Unit", name: "Footman", owner: 0, scale: 1 };
    terrainTools.mark = { kind: "region", number: 2, name: "Spawn", detail: "" };
    terrainTools.place.type = "h000";
  };
  choose();
  await each.show({ ...arena, path: "C:/maps/Other.w3x" });
  expect([terrainTools.chosen, terrainTools.mark, terrainTools.place.type]).toEqual([null, null, null]);
  choose();
  await each.reloadFromDisk(true);
  expect([terrainTools.chosen, terrainTools.mark, terrainTools.place.type]).toEqual([null, null, null]);
});

test("a map shows with its problems open", async () => {
  new FakeApp({ tree: [] });
  const each = session();
  await each.show({ ...arena, problems: ["A file is damaged"] });
  expect(each.problemsOpen).toBe(true);
  await each.show(arena);
  expect(each.problemsOpen).toBe(false);
});
