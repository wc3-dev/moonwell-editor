// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeApp, Refusal } from "../../test/fakeApp.ts";
import { t } from "../text.ts";
import {
  homeBoot,
  homeNotice,
  keepState,
  onHomeChanged,
  openHome,
  writeHome,
  writeSchemas,
} from "./home.ts";
import hotkeysSchema from "./schemas/hotkeys.schema.json?raw";
import settingsSchema from "./schemas/settings.schema.json?raw";
import themeSchema from "./schemas/theme.schema.json?raw";

beforeEach(() => {
  homeNotice.text = "";
});

afterEach(async () => {
  delete window.chrome;
  delete window.moonwellHome;
  homeNotice.text = "";
});

describe("homeBoot", () => {
  test("is an empty boot when the app gave none", () => {
    expect(homeBoot()).toEqual({
      folder: "",
      settings: null,
      hotkeys: null,
      state: null,
      themes: [],
      legacy: null,
      unreadable: [],
    });
  });

  test("is what the app's script set before the page", () => {
    const boot = {
      folder: "C:/Users/me/.moonwell",
      settings: "{}",
      hotkeys: null,
      state: null,
      themes: [{ file: "themes/mine.json", text: "{}" }],
      legacy: { gameFolder: "D:/War3" },
      unreadable: ["state.json"],
    };
    window.moonwellHome = boot;
    expect(homeBoot()).toBe(boot);
  });
});

describe("writeHome", () => {
  test("sends the file and its text", async () => {
    const app = new FakeApp();
    expect(await writeHome("settings.json", "{}")).toBe(true);
    expect(app.args("writeHome")).toEqual({ file: "settings.json", text: "{}" });
    expect(homeNotice.text).toBe("");
  });

  test("a refusal sets the one notice and does not throw", async () => {
    new FakeApp({ writeHome: new Refusal("failed", "Disk full") });
    expect(await writeHome("settings.json", "{}")).toBe(false);
    expect(homeNotice.text).toContain("Disk full");
  });

  test("the notice is set the first time and stays as it was", async () => {
    let count = 0;
    new FakeApp({ writeHome: () => new Refusal("failed", `Failure ${++count}`) });
    await writeHome("settings.json", "{}");
    const first = homeNotice.text;
    await writeHome("settings.json", '{"a": 1}');
    expect(first).toContain("Failure 1");
    expect(homeNotice.text).toBe(first);
  });

  test("outside the window it is a notice too", async () => {
    expect(await writeHome("settings.json", "{}")).toBe(false);
    expect(homeNotice.text).not.toBe("");
  });
});

describe("keepState", () => {
  test("sends the key and its value, and answers true", async () => {
    const app = new FakeApp();
    expect(await keepState("favourites", { unit: ["hfoo"] })).toBe(true);
    expect(app.args("setState")).toEqual({ key: "favourites", value: { unit: ["hfoo"] } });
  });

  test("a refusal sets the notice and answers false, without rejecting", async () => {
    new FakeApp({ setState: new Refusal("failed", "state.json is held") });
    expect(await keepState("favourites", [])).toBe(false);
    expect(homeNotice.text).toContain("state.json is held");
  });
});

describe("openHome", () => {
  test("opens the folder, or one of its files", async () => {
    const app = new FakeApp();
    expect(await openHome()).toBe(true);
    expect(app.args("openHome")).toEqual({});
    expect(await openHome("themes")).toBe(true);
    expect(app.args("openHome")).toEqual({ file: "themes" });
  });

  test("a refusal sets the notice, with what could not be opened, and answers false", async () => {
    new FakeApp({ openHome: new Refusal("failed", "No program opens it") });
    expect(await openHome("themes/mine.json")).toBe(false);
    expect(homeNotice.text).toBe(
      t("home.notOpened", { where: ".moonwell/themes/mine.json", error: "No program opens it" }),
    );
    homeNotice.text = "";
    expect(await openHome()).toBe(false);
    expect(homeNotice.text).toContain(".moonwell:");
  });

  test("leaves the first notice as it is, as a write that failed does", async () => {
    new FakeApp({ openHome: new Refusal("failed", "No program opens it") });
    homeNotice.text = "An earlier notice";
    await openHome("themes");
    expect(homeNotice.text).toBe("An earlier notice");
  });
});

describe("onHomeChanged", () => {
  test("hands over what changed until it is stopped", async () => {
    const app = new FakeApp();
    const seen: { file: string; text: string | null }[] = [];
    const stop = onHomeChanged((change) => seen.push(change));
    await app.emit("homeChanged", { file: "settings.json", text: "{}" });
    await app.emit("homeChanged", { file: "themes/mine.json", text: null });
    stop();
    await app.emit("homeChanged", { file: "hotkeys.json", text: "{}" });
    expect(seen).toEqual([
      { file: "settings.json", text: "{}" },
      { file: "themes/mine.json", text: null },
    ]);
  });
});

describe("writeSchemas", () => {
  test("writes every schema in the page to the schemas folder", async () => {
    const app = new FakeApp();
    writeSchemas();
    await app.idle();
    const written = app.log
      .filter((each) => each.command === "writeHome")
      .map((each) => each.args as { file: string; text: string });
    expect(written.map((each) => each.file).sort()).toEqual([
      "schemas/hotkeys.schema.json",
      "schemas/settings.schema.json",
      "schemas/theme.schema.json",
    ]);
    expect(written.find((each) => each.file === "schemas/hotkeys.schema.json")?.text).toBe(
      hotkeysSchema,
    );
    expect(written.find((each) => each.file === "schemas/settings.schema.json")?.text).toBe(
      settingsSchema,
    );
    expect(written.find((each) => each.file === "schemas/theme.schema.json")?.text).toBe(
      themeSchema,
    );
  });
});
