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

const shown = (label: string) => screen.queryByRole("group", { name: label }) !== null;
const visible = () => fields.map((each) => each.label).filter(shown);
const button = (name: string) => screen.getByRole("button", { name });
const pressed = (name: string) => button(name).getAttribute("aria-pressed") === "true";
const box = () => screen.getByRole<HTMLInputElement>("textbox", { name: t("details.filterLabel") });
const star = (label: string) => t("details.favourite", { field: label });
const unstar = (label: string) => t("details.unfavourite", { field: label });
const typeFilter = (text: string) => fireEvent.input(box(), { target: { value: text } });

async function open(): Promise<void> {
  await openApp({ object: unit(footmanEntry, { fields }) });
  await showObject(/Footman/);
}

async function pickCategory(key: string): Promise<void> {
  await fireEvent.click(button(t("details.categories")));
  await fireEvent.click(await screen.findByRole("checkbox", { name: categoryName(key) }));
  await fireEvent.click(button(t("details.categories")));
}

async function savePreset(name: string): Promise<void> {
  await fireEvent.click(button(t("details.presets")));
  const input = await screen.findByRole("textbox", { name: t("details.presetName") });
  await fireEvent.input(input, { target: { value: name } });
  await fireEvent.click(button(t("details.savePreset")));
}

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

  test("narrows by category", async () => {
    await open();
    await pickCategory("move");
    expect(visible()).toEqual(["Speed"]);
  });

  test("takes several categories", async () => {
    await open();
    await pickCategory("move");
    await pickCategory("text");
    expect(visible()).toEqual(["Speed", "Name"]);
  });

  test("takes a category off again", async () => {
    await open();
    await pickCategory("move");
    await pickCategory("move");
    expect(visible()).toHaveLength(4);
  });

  test("its button says how many categories are picked", async () => {
    await open();
    await pickCategory("move");
    await pickCategory("text");
    expect(button(t("details.categories")).textContent).toContain(
      t("details.categoryCount.other", { count: 2 }),
    );
  });

  test("the filters narrow together", async () => {
    await open();
    await pickCategory("stats");
    await typeFilter("lumber");
    expect(visible()).toEqual(["Lumber Cost"]);
  });

  test("clearing takes every filter off", async () => {
    await open();
    await pickCategory("stats");
    await typeFilter("gold");
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
    await pickCategory("move");
    await fireEvent.click(await screen.findByRole("treeitem", { name: /Footman/ }));
    box().focus();
    await press("F2");
    await waitFor(() => expect(shown("Name")).toBe(true));
    expect(visible()).toHaveLength(4);
  });
});

describe("favourites", () => {
  test("a star marks a field, and shows only favourites narrows to them", async () => {
    await open();
    await fireEvent.click(button(star("Speed")));
    expect(button(unstar("Speed")).getAttribute("aria-pressed")).toBe("true");
    await fireEvent.click(button(t("details.favouritesOnly")));
    expect(visible()).toEqual(["Speed"]);
  });

  test("a second click takes the star off", async () => {
    await open();
    await fireEvent.click(button(star("Speed")));
    await fireEvent.click(button(unstar("Speed")));
    await fireEvent.click(button(t("details.favouritesOnly")));
    expect(visible()).toEqual([]);
  });

  test("with none, it says how to add one", async () => {
    await open();
    await fireEvent.click(button(t("details.favouritesOnly")));
    await screen.findByText(t("details.noFavourites"));
  });

  test("the field's menu stars it too", async () => {
    await open();
    await fireEvent.contextMenu(screen.getByRole("group", { name: "Speed" }));
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: t("details.menu.favourite") }),
    );
    expect(button(unstar("Speed"))).toBeTruthy();
    await fireEvent.contextMenu(screen.getByRole("group", { name: "Speed" }));
    await screen.findByRole("menuitem", { name: t("details.menu.unfavourite") });
  });

  test("survive a restart", async () => {
    await open();
    await fireEvent.click(button(star("Speed")));
    cleanup();
    await open();
    expect(button(unstar("Speed"))).toBeTruthy();
  });

  test("a read-only object can be starred too", async () => {
    await openApp({ object: unit(footmanEntry, { fields, readOnly: "the file is damaged" }) });
    await showObject(/Footman/);
    await fireEvent.click(button(star("Speed")));
    expect(button(unstar("Speed"))).toBeTruthy();
  });

  test("a per-level field gets a star", async () => {
    const levels = [
      field({ id: "Hbz1", label: "Damage", category: "stats", level: 1, value: "10" }),
      field({ id: "Hbz1", label: "Damage", category: "stats", level: 2, value: "20" }),
    ];
    await openApp({ object: unit(footmanEntry, { fields: [...levels, ...fields] }) });
    await showObject(/Footman/);
    await fireEvent.click(button(star("Damage")));
    await fireEvent.click(button(t("details.favouritesOnly")));
    expect(visible()).toEqual([]);
    await screen.findByText("Damage");
  });

  test("a total's star keeps the total shown", async () => {
    const dice = [
      field({ id: "ua1b", label: "Attack 1 - Damage Base", category: "combat", value: "5" }),
      field({
        id: "ua1d",
        label: "Attack 1 - Damage Number of Dice",
        category: "combat",
        value: "1",
      }),
      field({
        id: "ua1s",
        label: "Attack 1 - Damage Sides per Die",
        category: "combat",
        value: "2",
      }),
    ];
    await openApp({ object: unit(footmanEntry, { fields: [...dice, ...fields] }) });
    await showObject(/Footman/);
    await fireEvent.click(button(star("Attack 1 - Damage")));
    await fireEvent.click(button(t("details.favouritesOnly")));
    expect(shown("Attack 1 - Damage")).toBe(true);
    expect(visible()).toEqual([]);
  });
});

describe("presets", () => {
  test("hold every filter, and applying one brings them back", async () => {
    await open();
    await pickCategory("stats");
    await typeFilter("gold");
    await fireEvent.click(button(t("details.changedOnly")));
    await savePreset("Costs");
    await fireEvent.click(button(t("details.clearFilters")));
    expect(visible()).toHaveLength(4);

    await fireEvent.click(button("Costs"));
    expect(box().value).toBe("gold");
    expect(pressed(t("details.changedOnly"))).toBe(true);
    expect(visible()).toEqual(["Gold Cost"]);
  });

  test("hold Favourites only", async () => {
    await open();
    await fireEvent.click(button(star("Speed")));
    await fireEvent.click(button(t("details.favouritesOnly")));
    await savePreset("Mine");
    await fireEvent.click(button(t("details.clearFilters")));
    await fireEvent.click(button("Mine"));
    expect(visible()).toEqual(["Speed"]);
  });

  test("applying one closes the list", async () => {
    await open();
    await savePreset("All");
    await fireEvent.click(button("All"));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: t("details.presetName") })).toBeNull(),
    );
  });

  test("a saved one is listed, and a deleted one is not", async () => {
    await open();
    await savePreset("Costs");
    expect(button("Costs")).toBeTruthy();
    await fireEvent.click(button(t("details.deletePreset", { name: "Costs" })));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Costs" })).toBeNull());
  });

  test("a preset needs a name", async () => {
    await open();
    await fireEvent.click(button(t("details.presets")));
    await screen.findByRole("textbox", { name: t("details.presetName") });
    expect(button(t("details.savePreset")).hasAttribute("disabled")).toBe(true);
  });

  test("Enter in the name saves it", async () => {
    await open();
    await fireEvent.click(button(t("details.presets")));
    const input = await screen.findByRole("textbox", { name: t("details.presetName") });
    await fireEvent.input(input, { target: { value: "Quick" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(button("Quick")).toBeTruthy();
  });

  test("survive a restart", async () => {
    await open();
    await typeFilter("gold");
    await savePreset("Costs");
    cleanup();
    await open();
    await fireEvent.click(button(t("details.presets")));
    await fireEvent.click(await screen.findByRole("button", { name: "Costs" }));
    expect(box().value).toBe("gold");
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

  test("turns favourites on", async () => {
    await open();
    await choose(t("hotkey.favouritesOnly"));
    expect(pressed(t("details.favouritesOnly"))).toBe(true);
  });

  test("clears the filters", async () => {
    await open();
    await typeFilter("gold");
    await choose(t("hotkey.clearFilters"));
    expect(box().value).toBe("");
  });

  test("lists neither with no object shown", async () => {
    await openApp();
    await openPalette();
    expect(
      screen.queryByRole("option", { name: new RegExp(t("hotkey.favouritesOnly")) }),
    ).toBeNull();
    expect(screen.queryByRole("option", { name: new RegExp(t("hotkey.clearFilters")) })).toBeNull();
  });
});
