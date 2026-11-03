// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import App from "./App.svelte";
import { loadSettings, prefs } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import { shippedThemes } from "./lib/themes/shipped.ts";
import { loadUserThemes, themeOf } from "./lib/themes.ts";
import { appTests, FakeApp, press, Refusal, themeFileText } from "./test/fakeApp.ts";

appTests();

beforeEach(() => loadUserThemes([]));
afterEach(() => loadUserThemes([]));

/** Settings are loaded the way main.ts does, then the page is mounted and Settings opened. */
async function openSettings(settings = "{}", answers: Record<string, unknown> = {}) {
  const app = new FakeApp(answers);
  loadSettings(settings);
  render(App);
  await press("F10");
  const dialog = within(await screen.findByRole("dialog", { name: t("settings.title") }));
  return { app, dialog };
}

const noNotice = (text: string): string =>
  JSON.stringify({ "editor.alphaNotice": false, ...JSON.parse(text) });

const themeBox = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole("combobox", { name: t("settings.theme") });

describe("the theme in Settings", () => {
  test("has a button that opens the themes folder", async () => {
    const { app, dialog } = await openSettings(noNotice("{}"));
    await fireEvent.click(dialog.getByRole("button", { name: t("settings.themesFolder") }));
    await waitFor(() => expect(app.args("openHome")).toEqual({ file: "themes" }));
  });

  test("says so in Settings when the themes folder can't be opened", async () => {
    const { dialog } = await openSettings(noNotice("{}"), {
      openHome: new Refusal("failed", "No program opens it"),
    });
    await fireEvent.click(dialog.getByRole("button", { name: t("settings.themesFolder") }));
    const notice = await dialog.findByTestId("home-notice");
    expect(notice.textContent).toBe(
      t("home.notOpened", { where: ".moonwell/themes", error: "No program opens it" }),
    );
  });

  test("lists the user's themes with the editor's own", async () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine") }]);
    const { dialog } = await openSettings(noNotice("{}"));
    await fireEvent.keyDown(themeBox(dialog), { key: "Enter" });
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(shippedThemes.length + 1);
    expect(screen.getByRole("option", { name: "Mine" })).toBeTruthy();
  });

  test("shows the user's theme chosen, and the one it replaces", async () => {
    loadUserThemes([{ file: "themes/nord.json", text: themeFileText("My Nord") }]);
    const { dialog } = await openSettings(noNotice('{"appearance.theme": "nord"}'));
    expect(themeBox(dialog).textContent).toContain("My Nord");
    expect(
      dialog.getByText(t("settings.themeFile.replaces", { file: "themes/nord.json" })),
    ).toBeTruthy();
    expect(dialog.queryByText(/default theme/)).toBeNull();
  });

  test("says so when the chosen theme is gone, and shows the default", async () => {
    const { dialog } = await openSettings(noNotice('{"appearance.theme": "gone"}'));
    expect(themeBox(dialog).textContent).toContain("Kanagawa Dragon");
    expect(
      dialog.getByText(t("settings.theme.missing", { id: "gone", name: "Kanagawa Dragon" })),
    ).toBeTruthy();
    expect(prefs.theme).toBe("gone");
  });

  test("says why when the chosen theme's file can't be loaded", async () => {
    loadUserThemes([{ file: "themes/mine.json", text: "{ oo" }]);
    const { dialog } = await openSettings(noNotice('{"appearance.theme": "mine"}'));
    expect(themeBox(dialog).textContent).toContain("Kanagawa Dragon");
    expect(
      dialog.getByText(
        t("settings.theme.refused", { file: "themes/mine.json", name: "Kanagawa Dragon" }),
      ),
    ).toBeTruthy();
    expect(
      dialog.getByText(
        t("settings.problem.at", { line: 1, text: t("settings.themeProblem.notJson") }),
      ),
    ).toBeTruthy();
  });

  test("says nothing when the chosen theme loads", async () => {
    const { dialog } = await openSettings(noNotice('{"appearance.theme": "dracula"}'));
    expect(themeBox(dialog).textContent).toContain("Dracula");
    expect(dialog.queryByText(/default theme/)).toBeNull();
  });

  test("lists what is wrong with each theme file, with the line", async () => {
    loadUserThemes([
      { file: "themes/half.json", text: "{ oo" },
      { file: "themes/broken.json", text: '{"name": "B", "type": "dark", "colors": {}}' },
      {
        file: "themes/warned.json",
        text: themeFileText("Warned", "#101010", { colours: {}, "background.base": 1 }),
      },
    ]);
    const { dialog } = await openSettings(noNotice("{}"));
    const files = dialog.getAllByTestId("theme-file");
    expect(files).toHaveLength(3);

    const [broken, half, warned] = files.map((each) => each.textContent ?? "");
    expect(broken).toContain(t("settings.themeFile.left", { file: "themes/broken.json" }));
    expect(broken).toContain(t("settings.themeProblem.missing", { key: "background.base" }));
    expect(half).toContain(t("settings.themeFile.left", { file: "themes/half.json" }));
    expect(half).toContain(
      t("settings.problem.at", { line: 1, text: t("settings.themeProblem.notJson") }),
    );
    expect(warned).toContain(t("settings.themeFile.warnings", { file: "themes/warned.json" }));
    expect(warned).toContain(t("settings.themeProblem.unknownKey", { key: "colours" }));
    expect(warned).toContain(t("settings.themeProblem.unknownKey", { key: "background.base" }));
  });

  test("names the earlier version a file with a mistake keeps", async () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine") }]);
    const app = new FakeApp();
    loadSettings(noNotice("{}"));
    render(App);
    await press("F10");
    await app.emit("homeChanged", { file: "themes/mine.json", text: "{ oo" });
    const dialog = within(await screen.findByRole("dialog", { name: t("settings.title") }));
    await waitFor(() =>
      expect(dialog.getByTestId("theme-file").textContent).toContain(
        t("settings.themeFile.kept", { file: "themes/mine.json" }),
      ),
    );
  });

  test("code themes are the 64 of VS Code, whatever the editor's themes are", async () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine") }]);
    const { dialog } = await openSettings(noNotice("{}"));
    await fireEvent.keyDown(
      await dialog.findByRole("combobox", { name: t("settings.codeTheme") }, { timeout: 5000 }),
      {
        key: "Enter",
      },
    );
    expect(await screen.findAllByRole("option")).toHaveLength(64);
  });
});

describe("Copy as new theme", () => {
  test("writes the theme shown, chooses the copy, opens its file and shows it", async () => {
    const { app, dialog } = await openSettings(noNotice('{"appearance.theme": "dracula"}'));
    await fireEvent.click(dialog.getByRole("button", { name: t("settings.copyTheme") }));
    await waitFor(() => expect(app.args("openHome")).toEqual({ file: "themes/dracula-copy.json" }));
    const name = `${themeOf("dracula", shippedThemes).name} (copy)`;
    const file = app.log.find(
      (each) => each.command === "writeHome" && each.args.file === "themes/dracula-copy.json",
    );
    expect(JSON.parse(file?.args.text as string)).toMatchObject({ name });
    expect(prefs.theme).toBe("dracula-copy");
    await waitFor(() => expect(themeBox(dialog).textContent).toContain(name));
    expect(document.documentElement.dataset.theme).toBe("dracula-copy");
  });

  test("still makes the copy when its file can't be opened, and says so", async () => {
    const { dialog } = await openSettings(noNotice('{"appearance.theme": "dracula"}'), {
      openHome: new Refusal("failed", "No program opens it"),
    });
    await fireEvent.click(dialog.getByRole("button", { name: t("settings.copyTheme") }));
    await waitFor(() => expect(prefs.theme).toBe("dracula-copy"));
    const notice = await dialog.findByTestId("home-notice");
    expect(notice.textContent).toBe(
      t("home.notOpened", {
        where: ".moonwell/themes/dracula-copy.json",
        error: "No program opens it",
      }),
    );
  });
});

describe("a theme file saved while the editor runs", () => {
  test("changes the page at once when it is the theme in use", async () => {
    loadUserThemes([{ file: "themes/mine.json", text: themeFileText("Mine", "#101010") }]);
    const app = new FakeApp();
    loadSettings(noNotice('{"appearance.theme": "mine"}'));
    render(App);
    expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#101010");

    await app.emit("homeChanged", {
      file: "themes/mine.json",
      text: themeFileText("Mine", "#303030"),
    });
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#303030"),
    );

    await app.emit("homeChanged", { file: "themes/mine.json", text: "{ oo" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.documentElement.style.getPropertyValue("--background-base")).toBe("#303030");
  });

  test("brings a theme that was missing", async () => {
    const app = new FakeApp();
    loadSettings(noNotice('{"appearance.theme": "mine"}'));
    render(App);
    expect(document.documentElement.dataset.theme).toBe("kanagawa-dragon");
    await app.emit("homeChanged", { file: "themes/mine.json", text: themeFileText("Mine") });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("mine"));
  });
});
