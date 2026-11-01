import { describe, expect, it } from "vitest";
import type { TreeItem, TreeKind } from "../triggers/api.ts";
import { closed, isScript, matched, type OpenScript, opened } from "./openScripts.ts";

const script = (id: number, name = `Script ${id}`): OpenScript => ({ id, name, kind: "script" });

function item(id: number, name: string, kind: TreeKind = "script"): TreeItem {
  return { id, parent: 0, kind, name, enabled: true, expanded: true, ref: "" };
}

describe("isScript", () => {
  it("is true for what holds a script", () => {
    for (const kind of ["root", "script", "custom"] as const) expect(isScript({ kind })).toBe(true);
  });

  it("is false for the rest", () => {
    for (const kind of ["category", "trigger", "comment", "variable"] as const) {
      expect(isScript({ kind })).toBe(false);
    }
  });
});

describe("opened", () => {
  it("adds a script at the end", () => {
    expect(opened([script(1)], script(2)).map((each) => each.id)).toEqual([1, 2]);
  });

  it("keeps one that is open where it is", () => {
    const list = [script(1), script(2)];
    expect(opened(list, script(1))).toBe(list);
  });
});

describe("closed", () => {
  const list = [script(1), script(2), script(3)];

  it("takes the script out, and leaves another active as it is", () => {
    const after = closed(list, 3, 2);
    expect(after.list.map((each) => each.id)).toEqual([1, 3]);
    expect(after.active).toBe(3);
  });

  it("makes the next one active when the active one closes", () => {
    expect(closed(list, 2, 2).active).toBe(3);
  });

  it("makes the one before active when the last one closes", () => {
    expect(closed(list, 3, 3).active).toBe(2);
  });

  it("leaves nothing active when the only one closes", () => {
    expect(closed([script(1)], 1, 1)).toEqual({ list: [], active: null });
  });
});

describe("matched", () => {
  it("takes the new name of a script renamed", () => {
    const after = matched([script(1, "Old")], [item(1, "New")], 1);
    expect(after.list[0]?.name).toBe("New");
    expect(after.active).toBe(1);
  });

  it("closes a script deleted", () => {
    const after = matched([script(1), script(2)], [item(2, "Script 2")], 1);
    expect(after.list.map((each) => each.id)).toEqual([2]);
    expect(after.active).toBe(2);
  });

  it("keeps Map Script, whose name the page writes itself", () => {
    const header: OpenScript = { id: 0, name: "Map Script", kind: "root" };
    expect(matched([header], [item(0, "", "root")], 0).list[0]?.name).toBe("Map Script");
  });
});
