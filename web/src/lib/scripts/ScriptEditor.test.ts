// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { FakeApp } from "../../test/fakeApp.ts";
import { CommandQueue } from "../app/commandQueue.ts";
import type { TriggerTreeItem, TriggerTreeView } from "../triggers/api.ts";
import ScriptEditor from "./ScriptEditor.svelte";

const shown: number[] = [];

vi.mock("./monaco/scriptsEditor.ts", () => ({
  ScriptsEditor: {
    create: async () => ({
      show: async (id: number) => {
        shown.push(id);
      },
      setText: async () => {},
      close: async () => {},
      setTheme: async () => {},
      dispose: async () => {},
    }),
  },
}));

const item = (id: number, name: string): TriggerTreeItem => ({
  id,
  parent: 0,
  kind: "script",
  name,
  enabled: true,
  expanded: true,
  ref: "",
});

const tree: TriggerTreeView = {
  items: [{ ...item(0, "Arena"), parent: -1, kind: "root" }, item(1, "First"), item(2, "Second")],
  variables: [],
  readOnly: false,
  problem: null,
  headerComment: "",
  headerCode: "",
  references: [],
  language: "jass",
};

afterEach(() => {
  cleanup();
  delete window.chrome;
  shown.length = 0;
});

test("a script opened from the Trigger Editor stays the one shown while the editor reads the map again", async () => {
  new FakeApp({ triggerTree: tree, trigger: { code: "" } });
  const { component } = render(ScriptEditor, {
    codeTheme: { id: "dark", name: "Dark", type: "dark" },
    queued: new CommandQueue().run,
    onnotice: () => {},
  });
  await component.open(item(1, "First"));

  const opening = component.open(item(2, "Second"));
  await component.refresh();
  await opening;

  expect(shown.at(-1)).toBe(2);
  expect(screen.getByRole("button", { current: true }).textContent).toContain("Second");
});
