// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { field, footmanEntry, unit } from "../../test/fakeApp.ts";
import type { FieldView } from "../api.ts";
import { t } from "../text.ts";
import { sendTyped } from "../typing.ts";
import TooltipEditor from "./TooltipEditor.svelte";

vi.mock("./RichText.svelte", async () => ({
  default: (await import("../../test/PlainText.svelte")).default,
}));

const view = unit(footmanEntry, {
  fields: [
    field({ id: "utip", label: "Tooltip", value: "Old" }),
    field({ id: "utub", label: "Extended Tooltip", value: "Long" }),
  ],
});

type Edits = { field: FieldView; value: string }[];

// The texts are made again once the listed abilities are here.
const settled = () => new Promise((resolve) => setTimeout(resolve));
const onclose = vi.fn();
const close = () =>
  within(screen.getByRole("dialog")).getByRole("button", { name: t("dialog.close") });
const box = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Tooltip" });
const sent = (call: unknown[]) =>
  (call[0] as Edits).map((edit) => [edit.field.id, edit.value] as const);

function open(answer: string | null = null) {
  const onfields = vi.fn(async (_edits: Edits): Promise<string | null> => answer);
  render(TooltipEditor, { view, onfields, onclose });
  return onfields;
}

beforeEach(() => {
  localStorage.clear();
  onclose.mockClear();
});

afterEach(cleanup);

describe("saving", () => {
  test("a text goes to the object a moment after it is typed", async () => {
    const onfields = open();
    await fireEvent.input(box(), { target: { value: "New" } });
    expect(onfields).not.toHaveBeenCalled();
    await waitFor(() => expect(onfields).toHaveBeenCalledOnce());
    expect(sent(onfields.mock.calls[0] as unknown[])).toEqual([["utip", "New"]]);
  });

  test("closing sends what is waiting, once, and closes", async () => {
    const onfields = open();
    await fireEvent.input(box(), { target: { value: "New" } });
    await fireEvent.click(close());
    await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
    expect(onfields).toHaveBeenCalledOnce();
  });

  test("a save of the map sends it first", async () => {
    const onfields = open();
    await fireEvent.input(box(), { target: { value: "New" } });
    sendTyped();
    expect(onfields).toHaveBeenCalledOnce();
  });

  test("a text refused says why, and a second close gives it up", async () => {
    open("Too long");
    await fireEvent.input(box(), { target: { value: "New" } });
    await fireEvent.click(close());
    await screen.findByText("Too long");
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(close());
    await waitFor(() => expect(onclose).toHaveBeenCalledOnce());
  });

  test("there are no Save and Cancel buttons", () => {
    open();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByRole("button", { name: "Save" })).toBeNull();
    expect(dialog.queryByRole("button", { name: t("dialog.cancel") })).toBeNull();
  });
});

describe("the user's own colours", () => {
  const colour = "#112233";
  const swatch = () =>
    screen.getByRole("button", { name: t("tooltipEditor.ownTitle", { colour }) });
  const code = () => screen.queryByRole("textbox", { name: t("colourPicker.code") });

  beforeEach(() => localStorage.setItem("moonwell-editor.tooltip-colours", `["${colour}"]`));

  test("a click colours the selection and opens no picker", async () => {
    open();
    await settled();
    box().focus();
    await fireEvent.click(swatch());
    expect(box().dataset.colour).toBe(colour);
    expect(code()).toBeNull();
  });

  test("a right click changes it, in the picker", async () => {
    open();
    await fireEvent.contextMenu(swatch());
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: t("tooltipEditor.changeColour") }),
    );
    await waitFor(() => expect(code()).not.toBeNull());
  });

  test("a right click removes it too", async () => {
    open();
    await fireEvent.contextMenu(swatch());
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: t("tooltipEditor.removeColour") }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: t("tooltipEditor.ownTitle", { colour }) }),
      ).toBeNull(),
    );
  });
});
