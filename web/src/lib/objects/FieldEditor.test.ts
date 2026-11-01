// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import type { FieldView } from "../api.ts";
import FieldEditor from "./FieldEditor.svelte";

afterEach(cleanup);

const field = {
  id: "unam",
  label: "Name",
  category: "text",
  sort: "",
  type: "string",
  choice: null,
  listOf: null,
  level: 0,
  value: "Footman",
  base: "Footman",
  changed: false,
  skin: false,
  warning: null,
  modes: null,
} as FieldView;

function box(compact: boolean): HTMLElement {
  render(FieldEditor, {
    field,
    choices: null,
    lookup: () => undefined,
    compact,
    onset: async () => null,
    onopen: () => {},
  });
  return screen.getByRole("textbox");
}

// With two on one box, the order the CSS is generated in would pick the winner.
test("a box has one minimum width", () => {
  expect(box(false).className.match(/min-w-\S+/g)).toEqual(["min-w-[8ch]"]);
  cleanup();
  expect(box(true).className.match(/min-w-\S+/g)).toEqual(["min-w-0"]);
});
