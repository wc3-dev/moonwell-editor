// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { appTests, FakeApp, later } from "../../test/fakeApp.ts";
import type { TreeEntry } from "../api.ts";
import TableView from "./TableView.svelte";
import { newTableState } from "./table.ts";

appTests();

function entry(id: string, name: string): TreeEntry {
  return {
    id,
    baseId: null,
    name,
    suffix: "",
    path: ["Custom"],
    changed: true,
    icon: "",
    iconModes: null,
  };
}

const archer = entry("h001", "Archer");
const footman = entry("h002", "Footman");
const knight = entry("h003", "Knight");
const names = new Map([archer, footman, knight].map((each) => [each.id, each.name]));

function selectedRow(): string | null {
  const cell = screen
    .getAllByRole("gridcell")
    .find((each) => each.getAttribute("aria-selected") === "true");
  return cell?.parentElement?.textContent ?? null;
}

function mount(onedit = async () => ({ changed: 0 })) {
  new FakeApp({
    fields: [
      {
        id: "ugol",
        label: "Gold",
        category: "stats",
        sort: "",
        type: "int",
        perLevel: false,
        choice: null,
        listOf: null,
        meta: "",
      },
    ],
    table: ({ ids }: { ids: string[] }) =>
      ids.map((id) => ({
        id,
        name: names.get(id) ?? id,
        baseId: "hfoo",
        readOnly: null,
        cells: [{ value: "10", base: "10", changed: false, applies: true, warning: null }],
      })),
  });
  const tableState = newTableState();
  tableState.chips.unit = { groups: [], changed: false };
  tableState.columns.unit = [{ field: "ugol", level: 0 }];
  const view = $state({
    kind: "unit" as const,
    entries: [archer, footman, knight],
    treeError: "",
    selected: null,
    filter: "",
    tableState,
    session: null,
    choices: null,
    lookup: () => undefined,
    onneed: () => {},
    onopen: () => {},
    onedit,
    onnotice: () => {},
  });
  render(TableView, view);
  return view;
}

const valueCells = () =>
  screen.getAllByRole("gridcell").filter((each) => each.hasAttribute("aria-selected"));

test("a selection that fell back onto another object follows that object", async () => {
  const view = mount();
  await waitFor(() => expect(screen.getAllByText("Footman").length).toBeGreaterThan(0));
  const values = screen
    .getAllByRole("gridcell")
    .filter((each) => each.hasAttribute("aria-selected"));
  await fireEvent.mouseDown(values[1] as HTMLElement);
  await waitFor(() => expect(selectedRow()).toContain("Footman"));
  await fireEvent.mouseUp(window);

  view.entries = [archer, knight];
  await waitFor(() => expect(screen.queryByText("Footman")).toBeNull());
  expect(selectedRow()).toContain("Knight");

  view.tableState.sort.unit = { key: "name", descending: true };
  await waitFor(() =>
    expect(screen.getAllByRole("gridcell")[0]?.parentElement?.textContent).toContain("Knight"),
  );
  expect(selectedRow()).toContain("Knight");
});

test("a click while an edit commits does not drag once the button is up", async () => {
  const answer = later({ changed: 1 });
  mount(() => answer.answer);
  await waitFor(() => expect(valueCells()).toHaveLength(3));
  const [first, , last] = valueCells() as HTMLElement[];
  await fireEvent.mouseDown(first as HTMLElement);
  await waitFor(() => expect(selectedRow()).toContain("Archer"));
  await fireEvent.mouseUp(window);
  await fireEvent.dblClick(first as HTMLElement);
  const box = await screen.findByRole("textbox", { name: "Gold" });
  await fireEvent.input(box, { target: { value: "20" } });

  await fireEvent.mouseDown(last as HTMLElement);
  await fireEvent.mouseUp(window);
  answer.release();
  await waitFor(() => expect(selectedRow()).toContain("Knight"));
  await fireEvent.mouseEnter(valueCells()[0] as HTMLElement);

  expect(valueCells().filter((each) => each.getAttribute("aria-selected") === "true")).toHaveLength(
    1,
  );
});
