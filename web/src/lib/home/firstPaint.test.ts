// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import script from "../../../public/first-paint.js?raw";
import { shippedThemes } from "../themes/shipped.ts";
import { themeVars } from "../themes.ts";

const root = document.documentElement;

function firstPaint(state: unknown): void {
  window.moonwellHome = {
    folder: "C:/Users/me/.moonwell",
    settings: null,
    hotkeys: null,
    state: typeof state === "string" ? state : JSON.stringify(state),
    themes: [],
    legacy: null,
    unreadable: [],
  };
  new Function(script)();
}

afterEach(() => {
  delete window.moonwellHome;
  root.removeAttribute("style");
  delete root.dataset.scheme;
});

test("puts the last theme's colours and scheme on the page", () => {
  firstPaint({
    lastTheme: {
      id: "light-plus",
      scheme: "light",
      vars: { "--background-panel": "#ffffff", "--text-normal": "#000000" },
    },
  });
  expect(root.style.getPropertyValue("--background-panel")).toBe("#ffffff");
  expect(root.style.getPropertyValue("--text-normal")).toBe("#000000");
  expect(root.dataset.scheme).toBe("light");
  expect(root.style.colorScheme).toBe("light");
});

test("leaves out what isn't a colour variable", () => {
  firstPaint({
    lastTheme: {
      scheme: "sepia",
      vars: { "--background-panel": "red", color: "#ffffff", "--text-normal": "#123456" },
    },
  });
  expect(root.style.getPropertyValue("--background-panel")).toBe("");
  expect(root.style.getPropertyValue("color")).toBe("");
  expect(root.style.getPropertyValue("--text-normal")).toBe("#123456");
  expect(root.dataset.scheme).toBeUndefined();
});

test.each([
  ["no state", null],
  ["no last theme", { recentMaps: [] }],
  ["a last theme with no colours", { lastTheme: { scheme: "dark" } }],
  ["a state that isn't JSON", "{ nope"],
])("changes nothing with %s", (_, state) => {
  expect(() => firstPaint(state)).not.toThrow();
  expect(root.getAttribute("style")).toBeNull();
});

test("takes every colour of every shipped theme", () => {
  for (const theme of shippedThemes) {
    const vars = themeVars(theme);
    firstPaint({ lastTheme: { id: theme.id, scheme: theme.type, vars } });
    for (const [name, color] of Object.entries(vars)) {
      expect(root.style.getPropertyValue(name), `${theme.id} ${name}`).toBe(color);
    }
    root.removeAttribute("style");
  }
});

test("changes nothing outside the app window", () => {
  expect(() => new Function(script)()).not.toThrow();
  expect(root.getAttribute("style")).toBeNull();
});
