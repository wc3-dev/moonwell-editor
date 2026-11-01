// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { FieldFilters, type FieldPreset } from "./fieldFilters.svelte.ts";

const key = "moonwell-editor.field-filters";

const preset = (name: string, text = "gold"): FieldPreset => ({
  name,
  text,
  changedOnly: true,
  favouritesOnly: false,
  categories: ["stats"],
});

beforeEach(() => localStorage.clear());

describe("favourites", () => {
  test("a star goes on and off", () => {
    const filters = new FieldFilters();
    filters.toggleFavourite("unit", "ugol");
    expect(filters.isFavourite("unit", "ugol")).toBe(true);
    filters.toggleFavourite("unit", "ugol");
    expect(filters.isFavourite("unit", "ugol")).toBe(false);
  });

  test("are kept per kind", () => {
    const filters = new FieldFilters();
    filters.toggleFavourite("unit", "ugol");
    expect(filters.isFavourite("ability", "ugol")).toBe(false);
  });

  test("survive a restart", () => {
    new FieldFilters().toggleFavourite("unit", "ugol");
    expect(new FieldFilters().isFavourite("unit", "ugol")).toBe(true);
  });
});

describe("presets", () => {
  test("are saved and listed", () => {
    const filters = new FieldFilters();
    filters.savePreset("unit", preset("Costs"));
    expect(filters.presets("unit")).toEqual([preset("Costs")]);
  });

  test("a preset of the same name replaces the old one, in its place", () => {
    const filters = new FieldFilters();
    filters.savePreset("unit", preset("Costs", "gold"));
    filters.savePreset("unit", preset("Speed"));
    filters.savePreset("unit", preset("Costs", "lumber"));
    expect(filters.presets("unit").map((each) => [each.name, each.text])).toEqual([
      ["Costs", "lumber"],
      ["Speed", "gold"],
    ]);
  });

  test("a deleted one is gone", () => {
    const filters = new FieldFilters();
    filters.savePreset("unit", preset("Costs"));
    filters.savePreset("unit", preset("Speed"));
    filters.deletePreset("unit", "Costs");
    expect(filters.presets("unit").map((each) => each.name)).toEqual(["Speed"]);
  });

  test("are kept per kind", () => {
    const filters = new FieldFilters();
    filters.savePreset("unit", preset("Costs"));
    expect(filters.presets("item")).toEqual([]);
  });

  test("survive a restart", () => {
    new FieldFilters().savePreset("unit", preset("Costs"));
    expect(new FieldFilters().presets("unit")).toEqual([preset("Costs")]);
  });
});

describe("what storage holds", () => {
  test("nothing gives nothing", () => {
    expect(new FieldFilters().presets("unit")).toEqual([]);
  });

  test("something that is not JSON gives nothing", () => {
    localStorage.setItem(key, "{nope");
    expect(new FieldFilters().presets("unit")).toEqual([]);
    expect(new FieldFilters().isFavourite("unit", "ugol")).toBe(false);
  });

  test("a wrong shape is left out, and the rest kept", () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        unit: {
          favourites: ["ugol", 3],
          presets: [preset("Good"), { name: "Bad" }, "nonsense"],
        },
        item: "nonsense",
      }),
    );
    const filters = new FieldFilters();
    expect(filters.isFavourite("unit", "ugol")).toBe(true);
    expect(filters.presets("unit")).toEqual([preset("Good")]);
    expect(filters.presets("item")).toEqual([]);
  });
});
