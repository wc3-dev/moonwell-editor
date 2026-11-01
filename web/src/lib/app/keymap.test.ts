import { describe, expect, it } from "vitest";
import { actionOf, clashes, defaultKeymap, keyOf, shownKey } from "./keymap.ts";

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  ctrlKey: mods.ctrl ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
});

describe("the keymap", () => {
  it("writes a key press as its modifiers and key", () => {
    expect(keyOf(press("n", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+N");
    expect(keyOf(press("ArrowLeft", { alt: true }))).toBe("Alt+ArrowLeft");
    expect(keyOf(press("F2"))).toBe("F2");
    expect(keyOf(press("Shift", { shift: true }))).toBeNull();
  });

  it("finds the action of a key press, World Editor's keys out of the box", () => {
    const keymap = defaultKeymap();
    expect(actionOf(press("s", { ctrl: true }), keymap)).toBe("save");
    expect(actionOf(press("Z", { ctrl: true, shift: true }), keymap)).toBe("redo");
    expect(actionOf(press("d", { ctrl: true }), keymap)).toBe("fieldIds");
    expect(actionOf(press("q", { ctrl: true }), keymap)).toBeUndefined();
  });

  it("follows a changed key and tells what else uses a key", () => {
    const keymap = defaultKeymap();
    keymap.save = ["Ctrl+Alt+S"];
    expect(actionOf(press("s", { ctrl: true }), keymap)).toBeUndefined();
    expect(actionOf(press("s", { ctrl: true, alt: true }), keymap)).toBe("save");
    expect(clashes(keymap, "save", "Ctrl+Z")).toEqual(["undo"]);
  });

  it("opens the command palette with Ctrl Shift P out of the box", () => {
    expect(actionOf(press("P", { ctrl: true, shift: true }), defaultKeymap())).toBe(
      "commandPalette",
    );
  });

  it("shows the terminal with Ctrl J out of the box", () => {
    expect(actionOf(press("j", { ctrl: true }), defaultKeymap())).toBe("terminal");
  });

  it("finds a command that has no key until one is set", () => {
    const keymap = defaultKeymap();
    expect(keymap.showTriggers).toEqual([]);
    keymap.showTriggers = ["Ctrl+1"];
    expect(actionOf(press("1", { ctrl: true }), keymap)).toBe("showTriggers");
  });

  it("shows arrows as arrows", () => {
    expect(shownKey("Alt+ArrowRight")).toBe("Alt →");
  });
});
