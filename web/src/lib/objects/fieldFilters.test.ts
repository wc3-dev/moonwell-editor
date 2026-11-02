// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { FieldFilters } from "./fieldFilters.svelte.ts";

const key = "moonwell-editor.field-filters";

beforeEach(() => localStorage.clear());

describe("favourites", () => {
  test("go on and off", () => {
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

describe("what storage holds", () => {
  test("something that is not JSON gives nothing", () => {
    localStorage.setItem(key, "{nope");
    expect(new FieldFilters().isFavourite("unit", "ugol")).toBe(false);
  });

  test("a wrong shape is left out, and the rest kept", () => {
    localStorage.setItem(
      key,
      JSON.stringify({ unit: { favourites: ["ugol", 3], presets: [] }, item: "nonsense" }),
    );
    const filters = new FieldFilters();
    expect(filters.isFavourite("unit", "ugol")).toBe(true);
    expect(filters.isFavourite("item", "ugol")).toBe(false);
  });
});
