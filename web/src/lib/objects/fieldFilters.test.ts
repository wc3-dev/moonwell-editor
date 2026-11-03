// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeApp } from "../../test/fakeApp.ts";
import { loadState } from "../home/state.svelte.ts";
import { FieldFilters } from "./fieldFilters.svelte.ts";

beforeEach(() => loadState(null));

afterEach(() => {
  delete window.chrome;
  loadState(null);
});

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

  test("go to state.json as a list for each kind", async () => {
    const app = new FakeApp();
    const filters = new FieldFilters();
    filters.toggleFavourite("unit", "ugol");
    filters.toggleFavourite("unit", "uhpm");
    filters.toggleFavourite("item", "ides");
    filters.toggleFavourite("unit", "ugol");
    await app.idle();
    expect(app.log.map((each) => each.args)).toEqual([
      { key: "favourites", value: { unit: ["ugol"] } },
      { key: "favourites", value: { unit: ["ugol", "uhpm"] } },
      { key: "favourites", value: { unit: ["ugol", "uhpm"], item: ["ides"] } },
      { key: "favourites", value: { unit: ["uhpm"], item: ["ides"] } },
    ]);
  });
});

describe("what the state holds", () => {
  test("favourites from the file are there at start", () => {
    loadState('{"favourites": {"unit": ["ugol"], "ability": ["Aamk"]}}');
    const filters = new FieldFilters();
    expect(filters.isFavourite("unit", "ugol")).toBe(true);
    expect(filters.isFavourite("ability", "Aamk")).toBe(true);
    expect(filters.isFavourite("item", "ugol")).toBe(false);
  });

  test("something that is not an object gives nothing", () => {
    loadState('{"favourites": "nope"}');
    expect(new FieldFilters().isFavourite("unit", "ugol")).toBe(false);
    loadState('{"favourites": ["ugol"]}');
    expect(new FieldFilters().isFavourite("unit", "ugol")).toBe(false);
  });

  test("a wrong shape is left out, and the rest kept", () => {
    loadState('{"favourites": {"unit": ["ugol", 3], "item": "nonsense", "ability": ["Aamk"]}}');
    const filters = new FieldFilters();
    expect(filters.isFavourite("unit", "ugol")).toBe(true);
    expect(filters.isFavourite("item", "ugol")).toBe(false);
    expect(filters.isFavourite("ability", "Aamk")).toBe(true);
  });

  test("a kind the editor does not have is not kept again", async () => {
    const app = new FakeApp();
    loadState('{"favourites": {"hero": ["ugol"]}}');
    new FieldFilters().toggleFavourite("unit", "ugol");
    await app.idle();
    expect(app.args("setState")).toEqual({ key: "favourites", value: { unit: ["ugol"] } });
  });
});
