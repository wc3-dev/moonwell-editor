// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import { categoryName } from "./lib/objects/fields.ts";
import { t } from "./lib/text.ts";
import { appTests, field, footmanEntry, openApp, press, showObject, unit } from "./test/fakeApp.ts";

appTests();

const fields = [
  field({ id: "ugol", label: "Gold Cost", category: "stats", changed: true, value: "135" }),
  field({ id: "ulum", label: "Lumber Cost", category: "stats" }),
  field({ id: "umvs", label: "Speed", category: "move" }),
  field({ id: "unam", label: "Name", category: "text", value: "Footman" }),
];

const dice = [
  field({ id: "ua1b", label: "Attack 1 - Damage Base", category: "combat", value: "5" }),
  field({ id: "ua1d", label: "Attack 1 - Damage Number of Dice", category: "combat", value: "1" }),
  field({ id: "ua1s", label: "Attack 1 - Damage Sides per Die", category: "combat", value: "2" }),
];

const rows = (label: string) => screen.queryAllByRole("group", { name: label });
const shown = (label: string) => rows(label).length > 0;
const visible = () => fields.map((each) => each.label).filter(shown);
const button = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => button(name).getAttribute("aria-pressed") === "true";
const box = () => screen.getByRole<HTMLInputElement>("textbox", { name: t("details.filterLabel") });
const typeFilter = (text: string) => fireEvent.input(box(), { target: { value: text } });
const favourites = t("category.favourites");
const headings = () =>
  screen
    .getAllByRole("button", { expanded: true })
    .map((each) => each.textContent ?? "")
    .filter((text) => /\d+ fields?/.test(text));

async function open(): Promise<void> {
  await openApp({ object: unit(footmanEntry, { fields }) });
  await showObject(/Footman/);
}

async function eye(name: string): Promise<void> {
  await fireEvent.click(button(t("details.categories")));
  await fireEvent.click(await screen.findByRole("button", { name }));
  await fireEvent.click(button(t("details.categories")));
}

const hideCategory = (key: string) => eye(categoryName(key));

/** Adds a row to the favourites, or takes it off, from its context menu. */
async function menu(row: Element, item: string): Promise<void> {
  await fireEvent.contextMenu(row);
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

const favourite = (label: string) =>
  menu(screen.getByRole("group", { name: label }), t("details.menu.favourite"));

describe("the filter bar", () => {
  test("narrows by name", async () => {
    await open();
    await typeFilter("cost");
    expect(visible()).toEqual(["Gold Cost", "Lumber Cost"]);
  });

  test("shows only what changed", async () => {
    await open();
    await fireEvent.click(button(t("details.changedOnly")));
    expect(visible()).toEqual(["Gold Cost"]);
  });

  test("has Changed only, and the floating bar no longer does", async () => {
    await open();
    const bar = screen.getByRole("toolbar", { name: t("details.bar") });
    expect(within(bar).queryByRole("button", { name: t("details.changedOnly") })).toBeNull();
  });

  test("shows every category at first", async () => {
    await open();
    expect(visible()).toHaveLength(4);
    expect(button(t("details.categories")).textContent).toContain(t("details.allCategories"));
  });

  test("a click on a category's eye hides it", async () => {
    await open();
    await hideCategory("stats");
    expect(visible()).toEqual(["Speed", "Name"]);
  });

  test("hides several categories", async () => {
    await open();
    await hideCategory("stats");
    await hideCategory("text");
    expect(visible()).toEqual(["Speed"]);
  });

  test("a second click brings it back", async () => {
    await open();
    await hideCategory("move");
    await hideCategory("move");
    expect(visible()).toHaveLength(4);
  });

  test("a hidden category stays in the list, faded", async () => {
    await open();
    await hideCategory("move");
    await fireEvent.click(button(t("details.categories")));
    const row = await screen.findByRole("button", { name: categoryName("move") });
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(row.classList.contains("opacity-50")).toBe(true);
    expect(
      screen.getByRole("button", { name: categoryName("stats") }).classList.contains("opacity-50"),
    ).toBe(false);
  });

  test("its button says how many categories are hidden", async () => {
    await open();
    await hideCategory("move");
    await hideCategory("text");
    expect(button(t("details.categories")).textContent).toContain(
      t("details.categoriesHidden.other", { count: 2 }),
    );
  });

  test("the filters narrow together", async () => {
    await open();
    await hideCategory("move");
    await typeFilter("o");
    await hideCategory("text");
    expect(visible()).toEqual(["Gold Cost", "Lumber Cost"]);
  });

  test("clearing takes every filter off", async () => {
    await open();
    await hideCategory("stats");
    await typeFilter("speed");
    await fireEvent.click(button(t("details.changedOnly")));
    await fireEvent.click(button(t("details.clearFilters")));
    expect(visible()).toHaveLength(4);
    expect(box().value).toBe("");
    expect(pressed(t("details.changedOnly"))).toBe(false);
  });

  test("there is nothing to clear with no filter on", async () => {
    await open();
    expect(screen.queryByRole("button", { name: t("details.clearFilters") })).toBeNull();
  });

  test("Ctrl F still goes to the name box", async () => {
    await open();
    await press("f", { ctrlKey: true });
    expect(document.activeElement).toBe(box());
  });

  test("F2 shows a name field the filters hide", async () => {
    await open();
    await hideCategory("text");
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Footman/ }));
    box().focus();
    await press("F2");
    await waitFor(() => expect(shown("Name")).toBe(true));
    expect(visible()).toHaveLength(4);
  });
});

describe("favourites", () => {
  test("have no category until there is one", async () => {
    await open();
    expect(headings().join()).not.toContain(favourites);
  });

  test("the field's menu adds it, under Favourites at the very top", async () => {
    await open();
    await favourite("Speed");
    expect(headings()[0]).toContain(favourites);
  });

  test("the field is edited there, and left disabled where it usually is", async () => {
    await open();
    await favourite("Speed");
    const [there, usual] = rows("Speed") as [HTMLElement, HTMLElement];
    expect(within(there).getByRole("textbox", { name: "Speed" })).toBeTruthy();
    expect(within(usual).queryByRole("textbox")).toBeNull();
    expect(usual.classList.contains("opacity-50")).toBe(true);
  });

  test("either place's menu takes it off again", async () => {
    await open();
    await favourite("Speed");
    await menu(rows("Speed")[1] as Element, t("details.menu.unfavourite"));
    expect(rows("Speed")).toHaveLength(1);
    expect(within(rows("Speed")[0] as HTMLElement).getByRole("textbox")).toBeTruthy();
    expect(headings().join()).not.toContain(favourites);
  });

  test("there are no stars", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /to favourites/ })).toBeNull();
  });

  test("hiding Favourites puts the field back where it usually is", async () => {
    await open();
    await favourite("Speed");
    await eye(favourites);
    expect(rows("Speed")).toHaveLength(1);
    expect(within(rows("Speed")[0] as HTMLElement).getByRole("textbox")).toBeTruthy();
  });

  test("a category hidden leaves its favourite under Favourites", async () => {
    await open();
    await favourite("Speed");
    await hideCategory("move");
    expect(rows("Speed")).toHaveLength(1);
    expect(within(rows("Speed")[0] as HTMLElement).getByRole("textbox")).toBeTruthy();
  });

  test("survive a restart", async () => {
    await open();
    await favourite("Speed");
    cleanup();
    await open();
    expect(rows("Speed")).toHaveLength(2);
  });

  test("a read-only object can have them too", async () => {
    await openApp({ object: unit(footmanEntry, { fields, readOnly: "the file is damaged" }) });
    await showObject(/Footman/);
    await favourite("Speed");
    expect(rows("Speed")).toHaveLength(2);
  });

  test("a per-level field goes there from its name's menu, and its old row is shown only", async () => {
    const levels = [
      field({ id: "Hbz1", label: "Damage", category: "stats", level: 1, value: "10" }),
      field({ id: "Hbz1", label: "Damage", category: "stats", level: 2, value: "20" }),
    ];
    await openApp({ object: unit(footmanEntry, { fields: [...levels, ...fields] }) });
    await showObject(/Footman/);
    await menu(screen.getByRole("rowheader", { name: "Damage" }), t("details.menu.favourite"));
    expect(headings()[0]).toContain(favourites);
    const [there, usual] = screen.getAllByRole("rowheader", { name: "Damage" }) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(within(there.closest("tr") as HTMLElement).getAllByRole("textbox")).toHaveLength(2);
    expect(within(usual.closest("tr") as HTMLElement).queryByRole("textbox")).toBeNull();
  });

  test("a total's menu moves the whole total", async () => {
    await openApp({ object: unit(footmanEntry, { fields: [...dice, ...fields] }) });
    await showObject(/Footman/);
    await favourite("Attack 1 - Damage");
    expect(headings()[0]).toContain(favourites);
    const [there, usual] = rows("Attack 1 - Damage") as [HTMLElement, HTMLElement];
    expect(within(there).getByRole("textbox", { name: "Attack 1 - Damage" })).toBeTruthy();
    expect(within(usual).queryByRole("textbox")).toBeNull();
  });

  test("a part of a total moves the whole total too", async () => {
    await openApp({ object: unit(footmanEntry, { fields: [...dice, ...fields] }) });
    await showObject(/Footman/);
    await fireEvent.click(
      screen.getAllByRole("button", { name: t("dice.showParts") })[0] as Element,
    );
    await favourite("Attack 1 - Damage Sides per Die");
    expect(rows("Attack 1 - Damage")).toHaveLength(2);
  });
});

describe("gone", () => {
  test("the presets and Favourites only", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Presets" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Favourites only" })).toBeNull();
  });
});

describe("the command palette", () => {
  const openPalette = async () => {
    await press("p", { ctrlKey: true, shiftKey: true });
    await screen.findByPlaceholderText(t("palette.placeholder"));
  };
  const choose = async (name: string) => {
    await openPalette();
    await fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
  };

  test("clears the filters", async () => {
    await open();
    await typeFilter("gold");
    await choose(t("hotkey.clearFilters"));
    expect(box().value).toBe("");
  });

  test("does not list that with no object shown", async () => {
    await openApp();
    await openPalette();
    expect(screen.queryByRole("option", { name: new RegExp(t("hotkey.clearFilters")) })).toBeNull();
  });
});
