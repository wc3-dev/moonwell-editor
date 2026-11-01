// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Action } from "../keymap.ts";
import type { Page } from "./pages.svelte.ts";
import { answerKey, inMonaco, inPopup, type KeyPlace, typingIn } from "./windowKeys.ts";

const details: KeyPlace = {
  page: "details",
  dialogOpen: false,
  mapOpen: true,
  typing: false,
  inPopup: false,
  textSelected: false,
};

const on = (page: Page, more: Partial<KeyPlace> = {}): KeyPlace => ({ ...details, page, ...more });

const objectKeys: Action[] = ["rename", "fieldIds", "newObject", "copyObject", "back", "forward"];

describe("a dialog", () => {
  test.each<Action>(["save", "undo", "settings", "deleteObject"])("keeps %s", (action) => {
    expect(answerKey(action, false, on("details", { dialogOpen: true }))).toEqual({});
  });

  test("keeps Esc", () => {
    expect(answerKey(undefined, true, on("details", { dialogOpen: true }))).toEqual({});
  });
});

describe("on the details page", () => {
  test.each<Action>([
    "save",
    "newObject",
    "rename",
    "filterFields",
    "copyObject",
    "fieldIds",
    "back",
    "forward",
    "settings",
    "undo",
    "redo",
    "deleteObject",
  ])("%s runs and takes the key", (action) => {
    expect(answerKey(action, false, details)).toEqual({ command: action, prevent: true });
  });

  test.each<Action>(["undo", "redo", "deleteObject"])("%s is a box's own", (action) => {
    expect(answerKey(action, false, on("details", { typing: true }))).toEqual({});
  });

  test.each<Action>(["save", "newObject", "rename", "filterFields"])(
    "%s still runs in a box",
    (action) => {
      expect(answerKey(action, false, on("details", { typing: true })).command).toBe(action);
    },
  );

  test("Delete is a popup's own", () => {
    expect(answerKey("deleteObject", false, on("details", { inPopup: true }))).toEqual({});
  });

  test("copy and paste run", () => {
    expect(answerKey("copy", false, details)).toEqual({ command: "copy", prevent: true });
    expect(answerKey("paste", false, details)).toEqual({ command: "paste", prevent: true });
  });

  test.each<Partial<KeyPlace>>([{ typing: true }, { inPopup: true }, { mapOpen: false }])(
    "copy and paste leave %o alone",
    (place) => {
      expect(answerKey("copy", false, on("details", place))).toEqual({});
      expect(answerKey("paste", false, on("details", place))).toEqual({});
    },
  );

  test("text selected keeps copy, not paste", () => {
    expect(answerKey("copy", false, on("details", { textSelected: true }))).toEqual({});
    expect(answerKey("paste", false, on("details", { textSelected: true })).command).toBe("paste");
  });

  test("Esc dismisses", () => {
    expect(answerKey(undefined, true, details)).toEqual({ command: "dismiss" });
  });

  test("a key with no action does nothing", () => {
    expect(answerKey(undefined, false, details)).toEqual({});
  });
});

describe("on the table page", () => {
  const table = on("table");

  test("the filter key goes to the table's filter", () => {
    expect(answerKey("filterFields", false, table)).toEqual({
      command: "focusTableFilter",
      prevent: true,
    });
  });

  test.each(objectKeys)("%s does nothing, but takes the key", (action) => {
    expect(answerKey(action, false, table)).toEqual({ prevent: true });
  });

  test("Delete does nothing and leaves the key", () => {
    expect(answerKey("deleteObject", false, table)).toEqual({});
    expect(answerKey("deleteObject", false, on("table", { typing: true }))).toEqual({});
  });

  test.each<Action>(["save", "undo", "redo", "settings"])("%s still runs", (action) => {
    expect(answerKey(action, false, table)).toEqual({ command: action, prevent: true });
  });

  test("copy and paste are the grid's", () => {
    expect(answerKey("copy", false, table)).toEqual({});
  });

  test("Esc dismisses", () => {
    expect(answerKey(undefined, true, table)).toEqual({ command: "dismiss" });
  });
});

describe("on the map page", () => {
  const map = on("map");

  test.each<Action>(["save", "settings"])("%s runs", (action) => {
    expect(answerKey(action, false, map)).toEqual({ command: action, prevent: true });
  });

  test.each<Action>(["undo", "rename", "deleteObject", "back", "copy"])(
    "%s is the view's",
    (action) => {
      expect(answerKey(action, false, map)).toEqual({});
    },
  );

  test("Esc is the view's", () => {
    expect(answerKey(undefined, true, map)).toEqual({});
  });
});

describe("in the trigger editor", () => {
  const triggers = on("triggers");

  test("rename and delete are the editor's", () => {
    expect(answerKey("rename", false, triggers)).toEqual({
      command: "renameTrigger",
      prevent: true,
    });
    expect(answerKey("deleteObject", false, triggers)).toEqual({
      command: "deleteTrigger",
      prevent: true,
    });
  });

  test("in a box F2 is only taken, and Delete is the box's", () => {
    expect(answerKey("rename", false, on("triggers", { typing: true }))).toEqual({ prevent: true });
    expect(answerKey("deleteObject", false, on("triggers", { typing: true }))).toEqual({});
  });

  test("in a popup the same", () => {
    expect(answerKey("rename", false, on("triggers", { inPopup: true }))).toEqual({
      prevent: true,
    });
    expect(answerKey("deleteObject", false, on("triggers", { inPopup: true }))).toEqual({});
  });

  test("Esc dismisses", () => {
    expect(answerKey(undefined, true, triggers)).toEqual({ command: "dismiss" });
  });
});

describe.each<Page>(["triggers", "scripts"])("on %s", (page) => {
  test.each<Action>(["save", "settings", "undo", "redo"])("%s runs", (action) => {
    expect(answerKey(action, false, on(page))).toEqual({ command: action, prevent: true });
  });

  test.each<Action>(["newObject", "copyObject", "fieldIds", "filterFields", "back", "copy"])(
    "%s does nothing",
    (action) => {
      expect(answerKey(action, false, on(page))).toEqual({});
    },
  );
});

test("on the scripts page F2 and Delete are the editor's own", () => {
  expect(answerKey("rename", false, on("scripts"))).toEqual({});
  expect(answerKey("deleteObject", false, on("scripts"))).toEqual({});
});

describe("where a key goes", () => {
  const element = (html: string) => {
    document.body.innerHTML = html;
    return document.body.querySelector("#it");
  };

  test("boxes", () => {
    expect(typingIn(element(`<textarea id="it"></textarea>`))).toBe(true);
    expect(typingIn(element(`<input id="it" type="text" />`))).toBe(true);
    expect(typingIn(element(`<input id="it" />`))).toBe(true);
  });

  test("not boxes", () => {
    expect(typingIn(element(`<input id="it" type="checkbox" />`))).toBeFalsy();
    expect(typingIn(element(`<button id="it"></button>`))).toBeFalsy();
    expect(typingIn(window)).toBeFalsy();
  });

  test("Monaco counts as a box", () => {
    const inside = element(`<div class="monaco-editor"><span id="it"></span></div>`);
    expect(typingIn(inside)).toBe(true);
    expect(inMonaco(inside)).toBe(true);
    expect(inMonaco(element(`<span id="it"></span>`))).toBe(false);
  });

  test("popups", () => {
    expect(inPopup(element(`<div role="dialog"><span id="it"></span></div>`))).toBe(true);
    expect(inPopup(element(`<div data-popup><span id="it"></span></div>`))).toBe(true);
    expect(inPopup(element(`<span id="it"></span>`))).toBe(false);
  });
});
