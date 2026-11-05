// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import type { FieldView } from "../api.ts";
import { hasTyped, sendTyped } from "../typing.ts";
import type { DiceFields } from "./dice.ts";
import DiceRow from "./DiceRow.svelte";

afterEach(cleanup);

function field(id: string, value: string): FieldView {
  return {
    id,
    label: id,
    category: "combat",
    sort: "",
    type: "int",
    choice: null,
    listOf: null,
    level: 0,
    value,
    base: value,
    changed: false,
    skin: false,
    warning: null,
    modes: null,
  } as FieldView;
}

function dice(): DiceFields {
  return { base: field("ua1b", "11"), dice: field("ua1d", "1"), sides: field("ua1s", "2") };
}

function props(edits: { field: FieldView; value: string }[][]) {
  return {
    label: "Damage",
    fields: dice(),
    showIds: false,
    choices: null,
    lookup: () => undefined,
    editable: true,
    onset: async () => null,
    onreset: async () => null,
    onopen: () => {},
    onfields: async (sent: { field: FieldView; value: string }[]) => {
      edits.push(sent);
      return null;
    },
    selected: null,
    onselect: () => {},
    onmenu: () => {},
    onselecttotal: () => {},
    ontotalmenu: () => {},
    open: false,
    ontoggle: () => {},
  };
}

test("a typed range is sent by a save and keeps the window from closing unasked", async () => {
  const edits: { field: FieldView; value: string }[][] = [];
  render(DiceRow, props(edits));
  await fireEvent.input(screen.getByRole("textbox"), { target: { value: "20 - 30" } });

  expect(hasTyped()).toBe(true);
  sendTyped();
  await Promise.resolve();
  expect(edits).toHaveLength(1);
});

test("a typed range stays when the same values come back as new objects", async () => {
  const { rerender } = render(DiceRow, props([]));
  const box = screen.getByRole("textbox") as HTMLInputElement;
  await fireEvent.input(box, { target: { value: "20 - 30" } });

  await rerender({ fields: dice() });

  expect(box.value).toBe("20 - 30");
});
