/** The scripts open in the Script Editor (Sven, 2026-10-31): what can be opened, and how the list changes. */
import type { TreeItem, TreeKind } from "../triggers/api.ts";

export type OpenScript = Pick<TreeItem, "id" | "kind" | "name">;

/** True for what holds a script: Map Script, a custom script, and a trigger written as text. */
export function isScript(item: { kind: TreeKind }): boolean {
  return item.kind === "root" || item.kind === "script" || item.kind === "custom";
}

/** The list with a script in it: a new one goes at the end, an open one stays where it is. */
export function opened(list: OpenScript[], script: OpenScript): OpenScript[] {
  return list.some((each) => each.id === script.id) ? list : [...list, script];
}

/** The list without a script, and what is active then: what came after it, or else what came before it. */
export function closed(
  list: OpenScript[],
  active: number | null,
  id: number,
): { list: OpenScript[]; active: number | null } {
  const at = list.findIndex((each) => each.id === id);
  const rest = list.filter((each) => each.id !== id);
  return { list: rest, active: active === id ? ((rest[at] ?? rest[at - 1])?.id ?? null) : active };
}

/** The list as the map has it now: a script deleted closes, and one renamed takes its new name. */
export function matched(
  list: OpenScript[],
  items: TreeItem[],
  active: number | null,
): { list: OpenScript[]; active: number | null } {
  let now = { list, active };
  for (const script of list) {
    if (!items.some((each) => each.id === script.id)) now = closed(now.list, now.active, script.id);
  }

  const named = now.list.map((script) => {
    const found = items.find((each) => each.id === script.id);
    return found && script.kind !== "root" ? { ...script, name: found.name } : script;
  });
  return { list: named, active: now.active };
}
