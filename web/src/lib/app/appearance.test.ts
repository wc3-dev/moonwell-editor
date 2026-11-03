// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import { FakeApp, themeFileText } from "../../test/fakeApp.ts";
import { homeNotice } from "../home/notice.svelte.ts";
import { loadState } from "../home/state.svelte.ts";
import { loadSettings, prefs, setPref } from "../prefs.svelte.ts";
import { shippedThemes } from "../themes/shipped.ts";
import {
  defaultTheme,
  loadUserThemes,
  terminalTheme,
  themeChanged,
  themeOf,
  themeVars,
} from "../themes.ts";
import { Appearance } from "./appearance.svelte.ts";

const second = shippedThemes[1] as (typeof shippedThemes)[0];

beforeEach(() => {
  loadSettings(null);
});

afterEach(() => {
  loadSettings(null);
  loadUserThemes([]);
  homeNotice.text = "";
  delete window.chrome;
});

test("it starts in the default theme, on the page at once", () => {
  const appearance = new Appearance();
  expect(appearance.theme.id).toBe(defaultTheme);
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe(
    appearance.theme.colors["background.base"],
  );
});

test("it starts in the theme settings.json names, on the page at once", () => {
  loadSettings('{"appearance.theme": "nord"}');
  const appearance = new Appearance();
  const nord = themeOf("nord", shippedThemes);
  expect(appearance.theme).toEqual(nord);
  expect(document.documentElement.dataset.theme).toBe("nord");
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe(
    nord.colors["background.base"],
  );
});

test("a theme settings.json has no theme for is the default one", () => {
  loadSettings('{"appearance.theme": "my-own"}');
  expect(new Appearance().theme.id).toBe(defaultTheme);
});

test("a theme chosen goes on the page and the window's frame, and into settings.json", async () => {
  const app = new FakeApp();
  loadSettings("{}");
  const appearance = new Appearance();
  appearance.use(second);
  expect(appearance.theme).toEqual(second);
  expect(prefs.theme).toBe(second.id);
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe(
    second.colors["background.base"],
  );
  expect(app.args("frameColors")).toEqual({
    surface: second.colors["background.panel"],
    border: second.colors["border.normal"],
  });
  await app.idle();
  expect(JSON.parse((app.args("writeHome") as { text: string }).text)).toEqual({
    "appearance.theme": second.id,
  });
});

test("a theme set in the file follows to the page and the window's frame, once", () => {
  const app = new FakeApp();
  const appearance = new Appearance();
  appearance.show();
  appearance.show();
  expect(app.count("frameColors")).toBe(1);
  setPref("theme", "dracula");
  appearance.show();
  appearance.show();
  expect(appearance.theme.id).toBe("dracula");
  expect(document.documentElement.dataset.theme).toBe("dracula");
  expect(app.count("frameColors")).toBe(2);
});

test("the theme shown is remembered in state.json for the next start's first paint, once", () => {
  const app = new FakeApp();
  loadState(null);
  const appearance = new Appearance();
  appearance.show();
  appearance.show();
  const kept = app.log.filter(
    (each) => each.command === "setState" && each.args.key === "lastTheme",
  );
  expect(kept).toHaveLength(1);
  const [first] = kept as [(typeof kept)[0]];
  const { value } = first.args as {
    value: { id: string; scheme: string; vars: Record<string, string> };
  };
  expect(value.id).toBe(defaultTheme);
  expect(value.scheme).toBe("dark");
  expect(value.vars["--background-panel"]).toBe(appearance.theme.colors["background.panel"]);
  expect(value.vars).toEqual(themeVars(appearance.theme));
  setPref("theme", "light-plus");
  appearance.show();
  expect(app.log.filter((each) => each.args.key === "lastTheme")).toHaveLength(2);
});

test("a theme file saved with new colours is remembered again, under the same id", () => {
  const app = new FakeApp();
  loadState(null);
  loadUserThemes([{ file: "themes/mine.json", text: mineText("#101010") }]);
  loadSettings('{"appearance.theme": "mine"}');
  const appearance = new Appearance();
  appearance.show();
  themeChanged("themes/mine.json", mineText("#303030"));
  appearance.show();
  const kept = app.log.filter((each) => each.args.key === "lastTheme");
  expect(kept).toHaveLength(2);
  const last = kept.at(-1)?.args as { value: { id: string; vars: Record<string, string> } };
  expect(last.value.id).toBe("mine");
  expect(last.value.vars["--background-base"]).toBe("#303030");
});

test("a theme already remembered is not sent again", () => {
  const app = new FakeApp();
  const theme = themeOf(defaultTheme, shippedThemes);
  loadState(
    JSON.stringify({ lastTheme: { id: theme.id, scheme: theme.type, vars: themeVars(theme) } }),
  );
  new Appearance().show();
  expect(app.log.filter((each) => each.args.key === "lastTheme")).toHaveLength(0);
});

test("scripts are in Dark Plus or Light Plus by the theme's kind until one is chosen", () => {
  new FakeApp();
  const appearance = new Appearance();
  appearance.use(themeOf("nord", shippedThemes));
  expect(appearance.codeTheme.id).toBe("dark-plus");
  appearance.use(themeOf("github-light", shippedThemes));
  expect(appearance.codeTheme.id).toBe("light-plus");
  setPref("codeTheme", "monokai");
  expect(appearance.codeTheme.id).toBe("monokai");
});

test("the terminal takes its colours from the theme", () => {
  new FakeApp();
  const appearance = new Appearance();
  const dracula = themeOf("dracula", shippedThemes);
  appearance.use(dracula);
  expect(appearance.terminalColors).toEqual(terminalTheme(dracula));
});

const mineText = (base: string) => themeFileText("Mine", base);

test("a theme of the user's can be the one in use, from the start", () => {
  loadUserThemes([{ file: "themes/mine.json", text: mineText("#101010") }]);
  loadSettings('{"appearance.theme": "mine"}');
  const appearance = new Appearance();
  expect(appearance.theme).toMatchObject({ id: "mine", source: "user" });
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#101010");
});

test("saving the theme in use changes the page at once, and a half-written save changes nothing", () => {
  new FakeApp();
  loadUserThemes([{ file: "themes/mine.json", text: mineText("#101010") }]);
  loadSettings('{"appearance.theme": "mine"}');
  const appearance = new Appearance();
  const before = appearance.theme;

  themeChanged("themes/mine.json", "{ oo");
  appearance.show();
  expect(appearance.theme).toBe(before);
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#101010");

  themeChanged("themes/mine.json", mineText("#303030"));
  appearance.show();
  expect(appearance.theme.colors["background.base"]).toBe("#303030");
  expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#303030");
});

test("a user theme with a shipped theme's id is the one in use in its place", () => {
  loadUserThemes([{ file: "themes/nord.json", text: mineText("#101010") }]);
  loadSettings('{"appearance.theme": "nord"}');
  expect(new Appearance().theme).toMatchObject({ id: "nord", name: "Mine", source: "user" });
});

test("a user theme taken away leaves the default one in use, and comes back with the file", () => {
  loadUserThemes([{ file: "themes/mine.json", text: mineText("#101010") }]);
  loadSettings('{"appearance.theme": "mine"}');
  const appearance = new Appearance();
  themeChanged("themes/mine.json", null);
  expect(appearance.theme.id).toBe(defaultTheme);
  expect(prefs.theme).toBe("mine");
  themeChanged("themes/mine.json", mineText("#101010"));
  expect(appearance.theme.id).toBe("mine");
});
