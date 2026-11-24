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
import { clearHomeNotice } from "./notice.svelte.ts";
import hotkeysSchema from "./schemas/hotkeys.schema.json?raw";
import settingsSchema from "./schemas/settings.schema.json?raw";
import themeSchema from "./schemas/theme.schema.json?raw";

beforeEach(() => {
  clearHomeNotice();
});

afterEach(async () => {
  delete window.chrome;
  delete window.moonwellHome;
  clearHomeNotice();
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

  test("the notice shows the latest failure", async () => {
    let count = 0;
    new FakeApp({ writeHome: () => new Refusal("failed", `Failure ${++count}`) });
    await writeHome("settings.json", "{}");
    expect(homeNotice.text).toContain("Failure 1");
    await writeHome("hotkeys.json", "{}");
    expect(homeNotice.text).toContain("Failure 2");
    expect(homeNotice.text).not.toContain("Failure 1");
  });

  test("a write of the file that went through takes its notice away", async () => {
    let refuse = true;
    new FakeApp({
      writeHome: () => (refuse ? new Refusal("failed", "settings.json is held") : null),
    });
    await writeHome("settings.json", "{}");
    expect(homeNotice.text).toContain("settings.json is held");
    refuse = false;
    expect(await writeHome("settings.json", '{"a": 1}')).toBe(true);
    expect(homeNotice.text).toBe("");
  });

  test("a write of another file leaves the notice, and an earlier failure shows again once the latest is put right", async () => {
    const held = new Set(["settings.json", "hotkeys.json"]);
    new FakeApp({
      writeHome: ({ file }: { file: string }) =>
        held.has(file) ? new Refusal("failed", `${file} is held`) : null,
    });
    await writeHome("settings.json", "{}");
    await writeHome("hotkeys.json", "{}");
    expect(homeNotice.text).toContain("hotkeys.json is held");
    await writeHome("themes/mine.json", "{}");
    expect(homeNotice.text).toContain("hotkeys.json is held");
    held.delete("hotkeys.json");
    await writeHome("hotkeys.json", "{}");
    expect(homeNotice.text).toContain("settings.json is held");
    held.delete("settings.json");
    await writeHome("settings.json", "{}");
    expect(homeNotice.text).toBe("");
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

  test("a value kept after a refusal takes the notice away", async () => {
    let refuse = true;
    new FakeApp({ setState: () => (refuse ? new Refusal("failed", "state.json is held") : null) });
    await keepState("favourites", []);
    refuse = false;
    expect(await keepState("tooltipColours", [])).toBe(true);
    expect(homeNotice.text).toBe("");
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
    clearHomeNotice();
    expect(await openHome()).toBe(false);
    expect(homeNotice.text).toContain(".moonwell:");
  });

  test("shows over an earlier failure, and an open that went through takes it away", async () => {
    let refuse = true;
    new FakeApp({
      writeHome: new Refusal("failed", "Disk full"),
      openHome: () => (refuse ? new Refusal("failed", "No program opens it") : null),
    });
    await writeHome("settings.json", "{}");
    await openHome("themes");
    expect(homeNotice.text).toContain("No program opens it");
    refuse = false;
    await openHome("themes");
    expect(homeNotice.text).toContain("Disk full");
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
