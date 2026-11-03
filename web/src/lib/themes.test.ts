// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeApp, Refusal, themeFileText } from "../test/fakeApp.ts";
import { homeNotice } from "./home/notice.svelte.ts";
import { loadSettings, prefs } from "./prefs.svelte.ts";
import { colorKeys, parseTheme } from "./themes/format.ts";
import { shippedThemes } from "./themes/shipped.ts";
import {
  allThemes,
  applyTheme,
  copyTheme,
  cssName,
  defaultTheme,
  loadUserThemes,
  terminalTheme,
  themeChanged,
  themeFiles,
  themeOf,
  watchThemes,
} from "./themes.ts";

function fakeRoot() {
  const set: Record<string, string> = {};
  const root = {
    style: {
      setProperty: (name: string, value: string) => (set[name] = value),
      colorScheme: "",
    },
    dataset: {} as Record<string, string>,
  };
  return { set, root, element: root as unknown as HTMLElement };
}

describe("a theme's CSS names", () => {
  it("are its keys with dashes", () => {
    expect(cssName("background.panel")).toBe("--background-panel");
    expect(cssName("state.warningBackground")).toBe("--state-warning-background");
    expect(cssName("kind.destructable")).toBe("--kind-destructable");
  });
});

describe("the theme in use", () => {
  it("is Kanagawa Dragon when none is chosen", () => {
    expect(defaultTheme).toBe("kanagawa-dragon");
    expect(themeOf(null, shippedThemes).id).toBe("kanagawa-dragon");
    expect(themeOf("nope", shippedThemes).id).toBe("kanagawa-dragon");
  });

  it("is the one with the id chosen", () => {
    expect(themeOf("nord", shippedThemes).id).toBe("nord");
    expect(themeOf("github-light", shippedThemes).id).toBe("github-light");
  });

  it("takes over a choice saved from the palettes before", () => {
    expect(themeOf("gruvbox-dark", shippedThemes).id).toBe("gruvbox-dark-medium");
    expect(themeOf("one-dark", shippedThemes).id).toBe("one-dark-pro");
  });
});

describe("putting a theme on the page", () => {
  it("sets every colour but the terminal's as its variable", () => {
    const { set, element } = fakeRoot();
    const wave = themeOf("kanagawa-wave", shippedThemes);
    applyTheme(wave, element);
    expect(set["--background-panel"]).toBe(wave.colors["background.panel"]);
    expect(set["--state-warning-background"]).toBe(wave.colors["state.warningBackground"]);
    for (const key of colorKeys.filter((each) => !each.startsWith("terminal."))) {
      expect(set[cssName(key)], key).toBe(wave.colors[key]);
    }
    expect(Object.keys(set).filter((name) => name.startsWith("--terminal-"))).toEqual([]);
  });

  it("names the theme and its scheme", () => {
    const { root, element } = fakeRoot();
    applyTheme(themeOf("kanagawa-wave", shippedThemes), element);
    expect(root.dataset.theme).toBe("kanagawa-wave");
    expect(root.dataset.scheme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    applyTheme(themeOf("github-light", shippedThemes), element);
    expect(root.dataset.scheme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("the terminal's colours", () => {
  it("are the theme's terminal colours by xterm's names", () => {
    const theme = themeOf("dracula", shippedThemes);
    const colors = terminalTheme(theme);
    expect(colors.red).toBe(theme.colors["terminal.red"]);
    expect(colors.background).toBe(theme.colors["terminal.background"]);
    expect(colors.foreground).toBe(theme.colors["terminal.foreground"]);
    expect(colors.cursor).toBe(theme.colors["terminal.cursor"]);
    expect(colors.selectionBackground).toBe(theme.colors["terminal.selection"]);
    expect(colors.black).toBe(theme.colors["terminal.black"]);
    expect(colors.brightWhite).toBe(theme.colors["terminal.brightWhite"]);
    expect(Object.keys(colors)).toHaveLength(20);
  });
});

const themeWith = (id: string) => allThemes().find((each) => each.id === id);

describe("the user's themes", () => {
  beforeEach(() => {
    loadUserThemes([]);
    loadSettings(null);
  });

  afterEach(() => {
    loadUserThemes([]);
    loadSettings(null);
    homeNotice.text = "";
    delete window.chrome;
  });

  it("are the json files of the themes folder, by the file's name", () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine") }]);
    expect(themeWith("mine")).toMatchObject({ id: "mine", name: "Mine", source: "user" });
    expect(allThemes()).toHaveLength(shippedThemes.length + 1);
    expect(allThemes().slice(0, shippedThemes.length)).toEqual(shippedThemes);
    expect(themeFiles).toEqual([
      { file: "themes/mine.json", id: "mine", refused: false, replaces: false, problems: [] },
    ]);
  });

  it("take the place of a shipped theme with the same id, and say so", () => {
    loadUserThemes([{ file: "themes/nord.json", text: themeFileText("My Nord") }]);
    expect(allThemes()).toHaveLength(shippedThemes.length);
    expect(themeWith("nord")).toMatchObject({ name: "My Nord", source: "user" });
    expect(allThemes().findIndex((each) => each.id === "nord")).toBe(
      shippedThemes.findIndex((each) => each.id === "nord"),
    );
    expect(themeFiles).toMatchObject([{ id: "nord", refused: false, replaces: true }]);
  });

  it("can have spaces in the file's name, which is the id", () => {
    loadUserThemes([{ file: "themes/My Theme.json", text: themeFileText("Spaced") }]);
    expect(themeWith("My Theme")).toMatchObject({ name: "Spaced", source: "user" });
    expect(themeOf("My Theme", allThemes()).name).toBe("Spaced");
  });

  it("read the extension in any case", () => {
    loadUserThemes([{ file: "themes/Loud.JSON", text: themeFileText("Loud") }]);
    expect(themeWith("Loud")?.name).toBe("Loud");
  });

  it("with a warning load, and the warning is kept for Settings", () => {
    const text = themeFileText("Mine", "#101010", { colours: {} });
    loadUserThemes([{ file: "themes/mine.json", text }]);
    expect(themeWith("mine")).toBeDefined();
    expect(themeFiles).toMatchObject([
      { id: "mine", refused: false, problems: [{ code: "unknownKey", key: "colours" }] },
    ]);
  });

  it("that can't be loaded are listed with the reason, and are not themes", () => {
    loadUserThemes([
      { file: "themes/broken.json", text: '{"name": "Broken", "type": "dark", "colors": {}}' },
      { file: "themes/half.json", text: "{ oo" },
    ]);
    expect(themeWith("broken")).toBeUndefined();
    expect(themeWith("half")).toBeUndefined();
    expect(allThemes()).toEqual(shippedThemes);
    expect(themeFiles).toMatchObject([
      {
        id: "broken",
        refused: true,
        replaces: false,
        problems: [
          { code: "missing", key: "background.base" },
          { code: "missing", key: "background.panel" },
          { code: "missing", key: "text.normal" },
          { code: "missing", key: "accent.normal" },
        ],
      },
      { id: "half", refused: true, replaces: false, problems: [{ code: "notJson", line: 1 }] },
    ]);
  });

  it("that the app could not read are listed as unreadable", () => {
    loadUserThemes([], ["settings.json", "themes/held.json", "themes/notes.txt"]);
    expect(allThemes()).toEqual(shippedThemes);
    expect(themeFiles).toEqual([
      {
        file: "themes/held.json",
        id: "held",
        refused: true,
        replaces: false,
        problems: [{ code: "unreadable" }],
      },
    ]);
    themeChanged("themes/held.json", themeFileText("Held"));
    expect(themeWith("held")?.name).toBe("Held");
    expect(themeFiles).toMatchObject([{ id: "held", refused: false, problems: [] }]);
  });

  it("are all replaced when the folder is read again", () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine") }]);
    loadUserThemes([{ file: "themes/other.json", text: themeFileText("Other") }]);
    expect(themeWith("mine")).toBeUndefined();
    expect(themeFiles.map((each) => each.id)).toEqual(["other"]);
  });

  describe("saved while the editor runs", () => {
    it("are added, and changed at once", () => {
      themeChanged("themes/mine.json", themeFileText("Mine", "#101010"));
      expect(themeWith("mine")?.colors["background.base"]).toBe("#101010");
      themeChanged("themes/mine.json", themeFileText("Mine", "#303030"));
      expect(themeWith("mine")?.colors["background.base"]).toBe("#303030");
      expect(themeFiles).toHaveLength(1);
    });

    it("keep the last version that loaded when a save is half written, and show why", () => {
      loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine", "#101010") }]);
      const before = themeWith("mine");
      themeChanged("themes/mine.json", "{ oo");
      expect(themeWith("mine")).toBe(before);
      expect(themeFiles).toMatchObject([
        { id: "mine", refused: true, problems: [{ code: "notJson", line: 1 }] },
      ]);
      themeChanged("themes/mine.json", themeFileText("Mine", "#303030"));
      expect(themeWith("mine")?.colors["background.base"]).toBe("#303030");
      expect(themeFiles).toMatchObject([{ id: "mine", refused: false, problems: [] }]);
    });

    it("keep the shipped theme when a file with its id can't be loaded", () => {
      themeChanged("themes/nord.json", "{ oo");
      expect(themeWith("nord")).toBe(shippedThemes.find((each) => each.id === "nord"));
      expect(themeFiles).toMatchObject([{ id: "nord", refused: true, replaces: false }]);
    });

    it("leave the list when the file is deleted, and the shipped theme comes back", () => {
      loadUserThemes([
        { file: "themes/mine.json", text: themeFileText("Mine") },
        { file: "themes/nord.json", text: themeFileText("My Nord") },
      ]);
      themeChanged("themes/mine.json", null);
      themeChanged("themes/nord.json", null);
      expect(allThemes()).toEqual(shippedThemes);
      expect(themeFiles).toEqual([]);
    });

    it("are not changed again by a save with the same text", () => {
      const text = themeFileText("Mine");
      loadUserThemes([{ file: "themes/mine.json", text }]);
      const before = themeWith("mine");
      themeChanged("themes/mine.json", text);
      expect(themeWith("mine")).toBe(before);
    });

    it("are the files directly in the themes folder, and no others", () => {
      themeChanged("settings.json", themeFileText("Not one"));
      themeChanged("themes/inner/deep.json", themeFileText("Not one"));
      themeChanged("themes/notes.txt", themeFileText("Not one"));
      themeChanged("schemas/theme.schema.json", themeFileText("Not one"));
      expect(themeFiles).toEqual([]);
      expect(allThemes()).toEqual(shippedThemes);
    });

    it("follow the app's homeChanged event until stopped", async () => {
      const app = new FakeApp();
      const stop = watchThemes();
      await app.emit("homeChanged", { file: "themes/mine.json", text: themeFileText("Mine") });
      expect(themeWith("mine")?.name).toBe("Mine");
      await app.emit("homeChanged", { file: "settings.json", text: "{}" });
      await app.emit("homeChanged", { file: "themes/mine.json", text: null });
      expect(themeWith("mine")).toBeUndefined();
      stop();
      await app.emit("homeChanged", { file: "themes/mine.json", text: themeFileText("Mine") });
      expect(themeWith("mine")).toBeUndefined();
    });
  });

  describe("copied", () => {
    const written = (app: FakeApp, file: string): string | undefined =>
      app.log.find((each) => each.command === "writeHome" && each.args.file === file)?.args.text as
        | string
        | undefined;

    it("writes a new file with every colour, adds it, chooses it and opens it", async () => {
      const app = new FakeApp();
      loadSettings("{}");
      const kanagawa = themeOf("kanagawa-dragon", shippedThemes);
      const id = await copyTheme(kanagawa);
      expect(id).toBe("kanagawa-dragon-copy");

      const text = written(app, "themes/kanagawa-dragon-copy.json") as string;
      const { theme, problems } = parseTheme(id, text, "user");
      expect(problems).toEqual([]);
      expect(theme).toMatchObject({ name: "Kanagawa Dragon (copy)", type: kanagawa.type });
      expect(theme?.colors).toEqual(kanagawa.colors);
      const file = JSON.parse(text) as { colors: Record<string, string> };
      expect(Object.keys(file.colors)).toEqual([...colorKeys]);

      expect(app.args("openHome")).toEqual({ file: "themes/kanagawa-dragon-copy.json" });
      const commands = app.log.map((each) => each.command);
      expect(commands.indexOf("writeHome")).toBeLessThan(commands.indexOf("openHome"));
      expect(prefs.theme).toBe("kanagawa-dragon-copy");
      expect(themeWith("kanagawa-dragon-copy")).toMatchObject({ source: "user" });
      expect(themeFiles).toMatchObject([{ id: "kanagawa-dragon-copy", refused: false }]);
      await app.idle();
    });

    it("takes the next free name when the copy's is taken", async () => {
      const app = new FakeApp();
      const kanagawa = themeOf("kanagawa-dragon", shippedThemes);
      expect(await copyTheme(kanagawa)).toBe("kanagawa-dragon-copy");
      expect(await copyTheme(kanagawa)).toBe("kanagawa-dragon-copy-2");
      expect(await copyTheme(kanagawa)).toBe("kanagawa-dragon-copy-3");
      expect(written(app, "themes/kanagawa-dragon-copy-2.json")).toBeDefined();
      expect(prefs.theme).toBe("kanagawa-dragon-copy-3");
      await app.idle();
    });

    it("names later copies (copy 2) and on, so no two share a name", async () => {
      const app = new FakeApp();
      const kanagawa = themeOf("kanagawa-dragon", shippedThemes);
      const names: string[] = [];
      for (let each = 0; each < 3; each++) {
        const id = await copyTheme(kanagawa);
        names.push(themeOf(id, allThemes()).name);
      }
      expect(names).toEqual([
        "Kanagawa Dragon (copy)",
        "Kanagawa Dragon (copy 2)",
        "Kanagawa Dragon (copy 3)",
      ]);
      const text = written(app, "themes/kanagawa-dragon-copy-3.json") as string;
      expect(JSON.parse(text)).toMatchObject({ name: "Kanagawa Dragon (copy 3)" });
      await app.idle();
    });

    it("does not take the name of a file in another case, or of one that was refused", async () => {
      const app = new FakeApp();
      loadUserThemes([
        { file: "themes/Kanagawa-Dragon-Copy.json", text: "{ oo" },
        { file: "themes/kanagawa-dragon-copy-2.json", text: "{ oo" },
      ]);
      const id = await copyTheme(themeOf("kanagawa-dragon", shippedThemes));
      expect(id).toBe("kanagawa-dragon-copy-3");
      await app.idle();
    });

    it("keeps the theme's spaces, and leaves out what the folder won't take", async () => {
      const app = new FakeApp();
      loadUserThemes([
        { file: "themes/My Theme.json", text: themeFileText("Mine") },
        { file: "themes/Thème.json", text: themeFileText("Accent") },
      ]);
      expect(await copyTheme(themeOf("My Theme", allThemes()))).toBe("My Theme-copy");
      expect(await copyTheme(themeOf("Thème", allThemes()))).toBe("Th-me-copy");
      await app.idle();
    });

    it("does not go on when the file can't be written", async () => {
      const app = new FakeApp({ writeHome: new Refusal("failed", "Disk full") });
      loadSettings("{}");
      const id = await copyTheme(themeOf("kanagawa-dragon", shippedThemes));
      expect(id).toBe("");
      expect(themeFiles).toEqual([]);
      expect(prefs.theme).toBe(defaultTheme);
      expect(app.count("openHome")).toBe(0);
      expect(homeNotice.text).toContain("Disk full");
      await app.idle();
    });

    it("still makes the copy when its file can't be opened, and says so", async () => {
      const app = new FakeApp({ openHome: new Refusal("failed", "No program opens it") });
      loadSettings("{}");
      const id = await copyTheme(themeOf("kanagawa-dragon", shippedThemes));
      expect(id).toBe("kanagawa-dragon-copy");
      expect(prefs.theme).toBe("kanagawa-dragon-copy");
      await vi.waitFor(() => expect(homeNotice.text).toContain("No program opens it"));
      expect(homeNotice.text).toContain(".moonwell/themes/kanagawa-dragon-copy.json");
      await app.idle();
    });

    it("is one file each when asked twice before the first is written", async () => {
      const app = new FakeApp();
      const kanagawa = themeOf("kanagawa-dragon", shippedThemes);
      const ids = await Promise.all([copyTheme(kanagawa), copyTheme(kanagawa)]);
      expect(ids.toSorted()).toEqual(["kanagawa-dragon-copy", "kanagawa-dragon-copy-2"]);
      await app.idle();
    });
  });
});
