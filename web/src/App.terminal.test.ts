// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import { codeThemes } from "./lib/codeThemes.ts";
import { prefs, setPref } from "./lib/prefs.svelte.ts";
import { t } from "./lib/text.ts";
import { type TerminalColors, terminalColors } from "./lib/themeColors.ts";
import { appTests, arena, later, openApp, press, Refusal, showObject } from "./test/fakeApp.ts";

type FakeView = {
  written: string[];
  colors: TerminalColors;
  focused: number;
  disposed: boolean;
  ontype: (text: string) => void;
};

const fake = vi.hoisted(() => ({ views: [] as FakeView[] }));

vi.mock("./lib/terminal/xterm.ts", () => ({
  openTerminal(
    _element: HTMLElement,
    options: { colors: TerminalColors; ontype: (text: string) => void },
  ) {
    const view: FakeView = {
      written: [],
      colors: options.colors,
      focused: 0,
      disposed: false,
      ontype: options.ontype,
    };
    fake.views.push(view);
    return {
      write: (text: string) => view.written.push(text),
      fit: () => ({ columns: 100, rows: 24 }),
      focus: () => view.focused++,
      setColors: (colors: TerminalColors) => (view.colors = colors),
      dispose: () => (view.disposed = true),
    };
  },
}));

appTests();

const shells = [
  { id: "pwsh", name: "PowerShell 7", path: "pwsh.exe", arguments: "-NoLogo" },
  { id: "bash", name: "Git Bash", path: "bash.exe", arguments: "--login -i" },
];

function terminalAnswers(): Record<string, unknown> {
  let nextId = 1;
  return {
    terminalShells: shells,
    terminalStart: ({ shell }: { shell: string }) => {
      const found = shells.find((each) => each.id === shell) ?? (shells[0] as (typeof shells)[0]);
      return { id: nextId++, shell: found.id, name: found.name };
    },
    terminalWrite: null,
    terminalResize: null,
    terminalClose: null,
  };
}

const panel = () => screen.queryByRole("region", { name: t("terminal.label") });
const shown = () => panel()?.classList.contains("hidden") === false;
const tabs = () => screen.queryAllByRole("tab").filter((tab) => panel()?.contains(tab));
const toggle = () => press("j", { ctrlKey: true });

async function openWithTerminal(answers: Record<string, unknown> = {}) {
  fake.views.length = 0;
  const app = await openApp({ ...terminalAnswers(), ...answers });
  await toggle();
  await waitFor(() => expect(app.count("terminalStart")).toBe(1));
  await waitFor(() => expect(tabs()[0]?.textContent).not.toContain(t("terminal.label")));
  return app;
}

describe("showing and hiding", () => {
  test("Ctrl J opens it in a shell the size of the panel, with the cursor in it", async () => {
    const app = await openWithTerminal();
    expect(shown()).toBe(true);
    expect(app.args("terminalStart")).toEqual({ shell: "", columns: 100, rows: 24 });
    await waitFor(() => expect(fake.views[0]?.focused).toBeGreaterThan(0));
  });

  test("Ctrl J hides it, and the shell keeps running", async () => {
    const app = await openWithTerminal();
    await toggle();
    expect(shown()).toBe(false);
    expect(app.count("terminalClose")).toBe(0);
    expect(fake.views[0]?.disposed).toBe(false);
  });

  test("showing it again finds the same shell", async () => {
    const app = await openWithTerminal();
    await toggle();
    await toggle();
    expect(shown()).toBe(true);
    expect(app.count("terminalStart")).toBe(1);
  });

  test("its hide button hides it", async () => {
    await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.hide") }));
    expect(shown()).toBe(false);
  });

  test("the main menu has it, with its key", async () => {
    const app = await openApp(terminalAnswers());
    await fireEvent.click(screen.getByRole("button", { name: t("header.menu") }));
    const entry = await screen.findByRole("menuitem", { name: /^Terminal/ });
    expect(entry.textContent).toContain("Ctrl J");
    await fireEvent.click(entry);
    await waitFor(() => expect(app.count("terminalStart")).toBe(1));
  });

  test("the command palette has it, with no map too", async () => {
    await openApp(terminalAnswers());
    await press("p", { ctrlKey: true, shiftKey: true });
    await screen.findByRole("option", {
      name: (name) => name.includes(t("hotkey.terminal")) && name.includes("Ctrl J"),
    });
  });
});

describe("a shell's text", () => {
  test("what it prints goes to its own tab", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.new") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    await waitFor(() => expect(fake.views).toHaveLength(2));
    await app.emit("terminalOutput", { id: 2, text: "second" });
    await app.emit("terminalOutput", { id: 1, text: "first" });
    expect(fake.views[0]?.written).toEqual(["first"]);
    expect(fake.views[1]?.written).toEqual(["second"]);
  });

  test("what it prints before its tab knows its id is kept", async () => {
    const start = later({ id: 7, shell: "pwsh", name: "PowerShell 7" });
    fake.views.length = 0;
    const app = await openApp({ ...terminalAnswers(), terminalStart: () => start.answer });
    await toggle();
    await waitFor(() => expect(app.count("terminalStart")).toBe(1));
    await app.emit("terminalOutput", { id: 7, text: "early" });
    start.release();
    await waitFor(() => expect(fake.views[0]?.written).toEqual(["early"]));
  });

  test("what is typed goes to its shell, in order", async () => {
    const app = await openWithTerminal();
    fake.views[0]?.ontype("d");
    fake.views[0]?.ontype("ir");
    await waitFor(() => expect(app.count("terminalWrite")).toBe(2));
    expect(
      app.log.filter((each) => each.command === "terminalWrite").map((each) => each.args),
    ).toEqual([
      { id: 1, text: "d" },
      { id: 1, text: "ir" },
    ]);
  });
});

describe("tabs", () => {
  test("a tab shows its shell's name, and a new one is the one shown", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.new") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    await waitFor(() => expect(tabs()).toHaveLength(2));
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs()[0]?.textContent).toContain("PowerShell 7");
  });

  test("the list beside the new tab starts another shell", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.pickShell") }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: "Git Bash" }));
    await waitFor(() => expect(app.args("terminalStart")).toMatchObject({ shell: "bash" }));
    await waitFor(() => expect(tabs()[1]?.textContent).toContain("Git Bash"));
  });

  test("a click shows a tab and puts the cursor there", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.new") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    await waitFor(() => expect(tabs()).toHaveLength(2));
    const before = fake.views[0]?.focused ?? 0;
    await fireEvent.click(tabs()[0] as HTMLElement);
    expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(fake.views[0]?.focused).toBeGreaterThan(before));
  });

  test("closing a tab ends its shell and shows the one beside it", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.new") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    await waitFor(() => expect(tabs()).toHaveLength(2));
    const last = tabs()[1] as HTMLElement;
    await fireEvent.click(within(last).getByRole("button"));
    await waitFor(() => expect(app.args("terminalClose")).toEqual({ id: 2 }));
    expect(tabs()).toHaveLength(1);
    expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(fake.views[1]?.disposed).toBe(true));
  });

  test("closing the last tab hides the panel, and the next opening starts anew", async () => {
    const app = await openWithTerminal();
    await fireEvent.click(within(tabs()[0] as HTMLElement).getByRole("button"));
    await waitFor(() => expect(shown()).toBe(false));
    await toggle();
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
  });

  test("a shell that ends takes its tab with it", async () => {
    const app = await openWithTerminal();
    await app.emit("terminalExit", { id: 1, code: 0 });
    await waitFor(() => expect(tabs()).toHaveLength(0));
    expect(shown()).toBe(false);
  });

  test("a shell that will not start says why and leaves no tab", async () => {
    fake.views.length = 0;
    await openApp({
      ...terminalAnswers(),
      terminalStart: new Refusal("noShell", "No shell was found on this PC."),
    });
    await toggle();
    expect((await screen.findByTestId("notice")).textContent).toContain(
      t("terminal.failed", { error: "No shell was found on this PC." }),
    );
    await waitFor(() => expect(tabs()).toHaveLength(0));
    expect(shown()).toBe(false);
  });
});

describe("the default shell", () => {
  test("a new terminal runs the one chosen in the settings", async () => {
    setPref("terminalShell", "bash");
    const app = await openWithTerminal();
    expect(app.args("terminalStart")).toMatchObject({ shell: "bash" });
  });

  test("a new tab runs it too", async () => {
    setPref("terminalShell", "bash");
    const app = await openWithTerminal();
    await fireEvent.click(screen.getByRole("button", { name: t("terminal.new") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    expect(app.args("terminalStart")).toMatchObject({ shell: "bash" });
  });
});

describe("another map", () => {
  test("opens a new tab there, and leaves the shells running", async () => {
    const app = await openWithTerminal({ openMap: arena });
    await fireEvent.click(screen.getByRole("button", { name: t("header.menu") }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: t("header.openFolder") }));
    await waitFor(() => expect(app.count("terminalStart")).toBe(2));
    expect(app.count("terminalClose")).toBe(0);
  });

  test("does not open the panel when no terminal runs", async () => {
    const app = await openApp({ ...terminalAnswers(), openMap: arena });
    await fireEvent.click(screen.getByRole("button", { name: t("header.menu") }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: t("header.openFolder") }));
    await waitFor(() => expect(app.count("openMap")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(app.count("terminalStart")).toBe(0);
  });
});

describe("keys in the terminal", () => {
  function terminalBox(): HTMLTextAreaElement {
    const box = document.createElement("textarea");
    const element = document.createElement("div");
    element.className = "xterm";
    element.append(box);
    element.addEventListener("keydown", (event) => event.stopPropagation());
    document.body.append(element);
    box.focus();
    return box;
  }

  test("Ctrl J hides it", async () => {
    await openWithTerminal();
    const box = terminalBox();
    await press("j", { ctrlKey: true });
    expect(shown()).toBe(false);
    box.parentElement?.remove();
  });

  test("the palette's key opens the palette", async () => {
    await openWithTerminal();
    const box = terminalBox();
    await press("p", { ctrlKey: true, shiftKey: true });
    await screen.findByPlaceholderText(t("palette.placeholder"));
    await fireEvent.keyDown(screen.getByPlaceholderText(t("palette.placeholder")), {
      key: "Escape",
    });
    expect(document.activeElement).toBe(box);
    box.parentElement?.remove();
  });

  test("Ctrl S stays the shell's", async () => {
    const app = await openWithTerminal({ save: { written: [], backup: "", note: "" } });
    const box = terminalBox();
    await press("s", { ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(app.count("save")).toBe(0);
    box.parentElement?.remove();
  });

  test("a key xterm leaves alone does not reach the object shown", async () => {
    await openApp(terminalAnswers());
    await showObject(/Footman/);
    const box = document.createElement("textarea");
    const element = document.createElement("div");
    element.className = "xterm";
    element.append(box);
    document.body.append(element);
    box.focus();
    await press("d", { ctrlKey: true });
    expect(
      screen.getByRole("button", { name: t("details.fieldIds") }).getAttribute("aria-pressed"),
    ).toBe("false");
    element.remove();
  });
});

describe("its top edge", () => {
  async function drag() {
    Element.prototype.setPointerCapture = () => {};
    const handle = screen.getByTitle(t("terminal.resize"));
    await fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    await fireEvent.pointerMove(handle, { clientY: 400, pointerId: 1 });
    await fireEvent.pointerUp(handle, { clientY: 400, pointerId: 1 });
  }

  test("changes the panel's height and remembers it", async () => {
    await openWithTerminal();
    await drag();
    expect(panel()?.style.height).toBe("340px");
    expect(prefs.terminalHeight).toBe(340);
  });

  test("leaves the cursor in the terminal", async () => {
    await openWithTerminal();
    const before = fake.views[0]?.focused ?? 0;
    await drag();
    await waitFor(() => expect(fake.views[0]?.focused).toBeGreaterThan(before));
  });
});

test("the terminal follows the theme", async () => {
  const app = await openWithTerminal();
  const dracula = codeThemes.find((each) => each.id === "dracula");
  await press("F10");
  await fireEvent.keyDown(await screen.findByRole("combobox", { name: t("settings.theme") }), {
    key: "Enter",
  });
  await fireEvent.pointerUp(await screen.findByRole("option", { name: dracula?.name }));
  await waitFor(() => expect(app.count("frameColors")).toBeGreaterThan(1));
  await waitFor(() => expect(fake.views[0]?.colors).toEqual(terminalColors(dracula as never)));
});
