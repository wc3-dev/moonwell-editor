// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { arena, FakeApp, footmanEntry, knightEntry, unit } from "../../test/fakeApp.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { MapSession } from "./mapSession.svelte.ts";
import { Notices } from "./notices.svelte.ts";
import { hasTooltip, ObjectActions } from "./objectActions.svelte.ts";
import { Objects } from "./objects.svelte.ts";
import { Pages } from "./pages.svelte.ts";

afterEach(() => {
  delete window.chrome;
});

const standard = { ...knightEntry, id: "hkni", baseId: null, changed: false };

async function actions(): Promise<ObjectActions> {
  new FakeApp({ tree: [footmanEntry, knightEntry, standard], object: unit(footmanEntry) });
  const queue = new CommandQueue();
  const notices = new Notices();
  const pages = new Pages();
  const objects = new Objects({ queue, history: new History(), scrollPosition: () => undefined });
  const session = new MapSession({
    queue,
    notices,
    objects,
    pages,
    terminals: { mapChanged() {} },
  });
  await session.show(arena);
  return new ObjectActions({ queue, notices, objects, pages, session });
}

function entry(items: MenuItem[] | undefined, label: string) {
  return items?.find((item) => "label" in item && item.label === label) as
    | Exclude<MenuItem, { separator: true }>
    | undefined;
}

test("only objects with a tooltip open the tooltip editor", () => {
  expect(hasTooltip("unit")).toBe(true);
  expect(hasTooltip("destructable")).toBe(false);
  expect(hasTooltip("doodad")).toBe(false);
});

test("an id may be empty, which takes the next free one", async () => {
  expect((await actions()).idProblem("unit", "  ")).toBeNull();
});

test("an id is four plain characters", async () => {
  const each = await actions();
  expect(each.idProblem("unit", "h01")).toBe(t("notice.idInvalid"));
  expect(each.idProblem("unit", "h0 1")).toBe(t("notice.idInvalid"));
  expect(each.idProblem("unit", "h0,1")).toBe(t("notice.idInvalid"));
  expect(each.idProblem("unit", "h002")).toBeNull();
});

test("an id of another object says whose", async () => {
  expect((await actions()).idProblem("unit", "h001")).toBe(
    t("notice.idTaken", { id: "h001", name: "Knight" }),
  );
});

test("an object not in its tree has no menu", async () => {
  expect((await actions()).menuItems("unit", "none")).toBeNull();
});

test("a custom object can be reset and deleted", async () => {
  const items = (await actions()).menuItems("unit", "h001") ?? undefined;
  expect(entry(items, t("menu.reset"))?.disabled).toBe(false);
  expect(entry(items, t("menu.delete"))?.disabled).toBe(false);
});

test("a standard object the map leaves alone can do neither", async () => {
  const items = (await actions()).menuItems("unit", "hkni") ?? undefined;
  expect(entry(items, t("menu.reset"))?.disabled).toBe(true);
  expect(entry(items, t("menu.delete"))?.disabled).toBe(true);
});

test("Paste waits for a copy of the same kind", async () => {
  const each = await actions();
  expect(entry(each.menuItems("unit", "h001") ?? undefined, t("menu.paste"))?.disabled).toBe(true);
  each.clip("unit", "h000");
  const pasted = t("menu.pasteObject", { name: "Footman" });
  expect(entry(each.menuItems("unit", "h001") ?? undefined, pasted)?.disabled).toBe(false);
});
