import { beforeEach, expect, type Mock, test, vi } from "vitest";
import { field, footmanEntry, unit } from "../../test/fakeApp.ts";
import type { FieldView, ObjectView } from "../api.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import type { DiceFields } from "./dice.ts";
import { FieldActions } from "./fieldActions.ts";
import { copyField } from "./fieldClip.ts";

const name = field({ id: "unam", label: "Name", value: "Footman", changed: true });
const speed = field({ id: "umvs", label: "Speed", type: "int", value: "270" });

const dice: DiceFields = {
  base: field({ id: "ua1b", label: "Attack 1 - Damage Base", type: "int", value: "11" }),
  dice: field({ id: "ua1d", label: "Attack 1 - Damage Number of Dice", type: "int", value: "1" }),
  sides: field({ id: "ua1s", label: "Attack 1 - Damage Sides per Die", type: "int", value: "2" }),
};

let notices: [string, boolean][];
let menus: MenuItem[][];
let set: Mock<(field: FieldView, value: string) => Promise<string | null>>;
let reset: Mock<(field: FieldView) => Promise<string | null>>;
let edits: Mock<(edits: { field: FieldView; value: string }[]) => Promise<string | null>>;

function actions(view: ObjectView = unit(footmanEntry)): FieldActions {
  return new FieldActions({
    view: () => view,
    notice: (text, warn) => notices.push([text, warn]),
    set,
    reset,
    fields: edits,
    menu: (_x, _y, items) => menus.push(items),
  });
}

const entry = (items: MenuItem[] | undefined, label: string) =>
  items?.find((item) => "label" in item && item.label === label) as
    | Exclude<MenuItem, { separator: true }>
    | undefined;

beforeEach(() => {
  notices = [];
  menus = [];
  set = vi.fn(async (): Promise<string | null> => null);
  reset = vi.fn(async (): Promise<string | null> => null);
  edits = vi.fn(async (): Promise<string | null> => null);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: vi.fn(async () => {}) } },
  });
  copyField(field({ id: "none", label: "Nothing", value: "" }));
});

test("a copy says what was copied, with the level of a per-level field", () => {
  actions().copy(name);
  expect(notices).toEqual([[t("details.copied", { field: "Name" }), false]]);
  actions().copy({ ...speed, level: 2 });
  expect(notices.at(-1)).toEqual([t("details.copiedLevel", { field: "Speed", level: 2 }), false]);
});

test("a paste sets the value copied and says so", async () => {
  actions().copy(name);
  await actions().paste(field({ id: "unam2", label: "Other", value: "" }));
  expect(set).toHaveBeenCalledOnce();
  expect(notices.at(-1)).toEqual([t("details.pasted", { from: "Name", to: "Other" }), false]);
});

test("a paste the app refuses says why", async () => {
  set.mockResolvedValue("Too long");
  actions().copy(name);
  await actions().paste(field({ id: "unam2", label: "Other", value: "" }));
  expect(notices.at(-1)).toEqual(["Too long", true]);
});

test("a paste into a read-only object says why not", async () => {
  actions().copy(name);
  await actions(unit(footmanEntry, { readOnly: "damaged" })).paste(name);
  expect(set).not.toHaveBeenCalled();
  expect(notices.at(-1)).toEqual([t("details.readOnly", { reason: "damaged" }), true]);
});

test("a value that does not fit says so", async () => {
  actions().copy(name);
  await actions().paste(speed);
  expect(set).not.toHaveBeenCalled();
  expect(notices.at(-1)).toEqual([t("details.doesNotFit", { from: "Name", to: "Speed" }), true]);
});

test("a total's range pastes as one edit", async () => {
  actions().copyTotal("Attack 1 - Damage", dice);
  await actions().pasteTotal("Attack 2 - Damage", {
    base: { ...dice.base, value: "1" },
    dice: { ...dice.dice, value: "1" },
    sides: { ...dice.sides, value: "1" },
  });
  expect(edits).toHaveBeenCalledOnce();
  expect(notices.at(-1)?.[1]).toBe(false);
});

test("a plain value does not paste into a total", async () => {
  actions().copy(name);
  await actions().pasteTotal("Attack 1 - Damage", dice);
  expect(edits).not.toHaveBeenCalled();
  expect(notices.at(-1)).toEqual([
    t("details.doesNotFit", { from: "Name", to: "Attack 1 - Damage" }),
    true,
  ]);
});

test("a field's menu offers Paste only for what fits", () => {
  actions().copy(name);
  actions().fieldMenu(speed, 0, 0);
  const pasted = t("details.menu.pasteField", { field: "Name" });
  expect(entry(menus[0], pasted)?.disabled).toBe(true);
  actions().fieldMenu(field({ id: "unam2", label: "Other", value: "" }), 0, 0);
  expect(entry(menus[1], pasted)?.disabled).toBe(false);
});

test("a field's Reset is for changed fields of an editable object", () => {
  actions().fieldMenu(name, 0, 0);
  expect(entry(menus[0], t("details.menu.reset"))?.disabled).toBe(false);
  actions().fieldMenu(speed, 0, 0);
  expect(entry(menus[1], t("details.menu.reset"))?.disabled).toBe(true);
  actions(unit(footmanEntry, { readOnly: "damaged" })).fieldMenu(name, 0, 0);
  expect(entry(menus[2], t("details.menu.reset"))?.disabled).toBe(true);
});

test("a total's Reset resets the changed parts", async () => {
  const changed: DiceFields = { ...dice, sides: { ...dice.sides, changed: true } };
  actions().totalMenu("Attack 1 - Damage", changed, 0, 0);
  await entry(menus[0], t("details.menu.reset"))?.run();
  expect(reset.mock.calls.map(([each]) => each.id)).toEqual(["ua1s"]);
});
