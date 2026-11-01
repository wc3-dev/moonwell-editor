// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import { FakeApp } from "../../test/fakeApp.ts";
import { setPref } from "../prefs.svelte.ts";
import { savedTheme, themes } from "../themes.ts";
import { Appearance } from "./appearance.svelte.ts";

const [first, second] = themes as [(typeof themes)[0], (typeof themes)[0]];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  setPref("codeTheme", "");
  delete window.chrome;
});

test("it starts in the theme saved, on the page at once", () => {
  localStorage.clear();
  const appearance = new Appearance();
  expect(appearance.theme).toEqual(savedTheme());
  expect(document.documentElement.style.getPropertyValue("--bg")).toBe(savedTheme().colors.bg);
});

test("a theme chosen goes on the page and the window's frame, and is remembered", () => {
  const app = new FakeApp();
  const appearance = new Appearance();
  appearance.use(second);
  expect(appearance.theme).toEqual(second);
  expect(document.documentElement.style.getPropertyValue("--bg")).toBe(second.colors.bg);
  expect(savedTheme().id).toBe(second.id);
  expect(app.args("frameColors")).toEqual({
    surface: second.colors.surface,
    border: second.colors.border,
  });
});

test("scripts follow the theme until one is chosen for them", () => {
  new FakeApp();
  const appearance = new Appearance();
  appearance.use(first);
  expect(appearance.codeTheme.id).toBe(first.id);
  setPref("codeTheme", second.id);
  expect(appearance.codeTheme.id).toBe(second.id);
});
