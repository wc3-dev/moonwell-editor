import { expect, test, vi } from "vitest";
import { Pages } from "./pages.svelte.ts";

function withEditors() {
  const pages = new Pages();
  const calls: string[] = [];
  pages.triggerEditor = {
    refresh: async () => void calls.push("triggers"),
    startRename() {},
    deleteSelected() {},
  };
  pages.scriptEditor = {
    refresh: async () => void calls.push("scripts"),
    open: async () => void calls.push("open"),
    hasScripts: () => false,
  };
  return { pages, calls };
}

test("the Object Editor's button goes back to the page last shown there", () => {
  const pages = new Pages();
  pages.show("table");
  pages.show("map");
  expect(pages.inObjectEditor).toBe(false);
  pages.showObjectEditor();
  expect(pages.page).toBe("table");
  expect(pages.inObjectEditor).toBe(true);
});

test("each script editor reads the scripts again when it shows", () => {
  const { pages, calls } = withEditors();
  pages.show("triggers");
  pages.show("scripts");
  pages.show("details");
  expect(calls).toEqual(["triggers", "scripts"]);
});

test("showing the page already shown reads nothing", () => {
  const { pages, calls } = withEditors();
  pages.show("scripts");
  pages.show("scripts");
  expect(calls).toEqual(["scripts"]);
});

test("a script opens before the rest are read", () => {
  const { pages, calls } = withEditors();
  pages.openScript({ id: 1, kind: "custom", name: "Spell" });
  expect(pages.page).toBe("scripts");
  expect(calls).toEqual(["open", "scripts"]);
});

test("an undo reads the scripts in both editors", async () => {
  const { pages, calls } = withEditors();
  await pages.refreshEditors();
  expect(calls).toEqual(["triggers", "scripts"]);
});

test("the trigger editor stays once shown, until another map", () => {
  const pages = new Pages();
  expect(pages.triggersShown).toBe(false);
  pages.show("triggers");
  pages.show("details");
  expect(pages.triggersShown).toBe(true);
  pages.mapChanged();
  expect(pages.triggersShown).toBe(false);
});

test("a map changed while the trigger editor shows keeps it", () => {
  const pages = new Pages();
  pages.show("triggers");
  pages.mapChanged();
  expect(pages.triggersShown).toBe(true);
});

test("a pick shows the map, and its end the page it came from", () => {
  const pages = new Pages();
  pages.show("triggers");
  pages.followPick(true, true);
  expect(pages.page).toBe("map");
  pages.followPick(false, true);
  expect(pages.page).toBe("triggers");
});

test("a pick keeps the map while it waits", () => {
  const pages = new Pages();
  pages.show("triggers");
  pages.followPick(true, true);
  pages.show("details");
  pages.followPick(true, true);
  expect(pages.page).toBe("map");
  pages.followPick(false, true);
  expect(pages.page).toBe("details");
});

test("a pick with no map stays where it is", () => {
  const pages = new Pages();
  pages.followPick(true, false);
  expect(pages.page).toBe("details");
});

test("a pick that ended leaves the page alone after", () => {
  const pages = new Pages();
  const show = vi.spyOn(pages, "show");
  pages.followPick(false, true);
  expect(show).not.toHaveBeenCalled();
});
