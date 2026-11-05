// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FakeApp, field, footmanEntry, knightEntry, unit } from "../../test/fakeApp.ts";
import type { FieldView } from "../api.ts";
import { loadState } from "../home/state.svelte.ts";
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
  loadState(null);
  onclose.mockClear();
});

afterEach(() => {
  cleanup();
  delete window.chrome;
  loadState(null);
});

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

  test("a text typed for one object never shows in or goes to another", async () => {
    const onfields = vi.fn(async (_edits: Edits): Promise<string | null> => null);
    const { rerender } = render(TooltipEditor, { view, onfields, onclose });
    await fireEvent.input(box(), { target: { value: "New" } });

    const knight = unit(knightEntry, {
      fields: [
        field({ id: "utip", label: "Tooltip", value: "Charge" }),
        field({ id: "utub", label: "Extended Tooltip", value: "Long" }),
      ],
    });
    await rerender({ view: knight });

    await waitFor(() => expect(box().value).toBe("Charge"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(onfields).not.toHaveBeenCalled();
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

  beforeEach(() => loadState(JSON.stringify({ tooltipColours: [colour] })));

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

  test("a right click removes it too, and state.json is told", async () => {
    const app = new FakeApp();
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
    expect(app.args("setState")).toEqual({ key: "tooltipColours", value: [] });
  });

  test("a colour picked in the picker is kept in state.json", async () => {
    const app = new FakeApp();
    open();
    await fireEvent.contextMenu(swatch());
    await fireEvent.click(
      await screen.findByRole("menuitem", { name: t("tooltipEditor.changeColour") }),
    );
    const input = await waitFor(() => {
      const found = code();
      if (!found) throw new Error("no picker yet");
      return found as HTMLInputElement;
    });
    await fireEvent.input(input, { target: { value: "#445566" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(app.args("setState")).toEqual({ key: "tooltipColours", value: ["#445566"] }),
    );
  });

  test("what the state holds that is not a colour is left out", async () => {
    loadState(JSON.stringify({ tooltipColours: [colour, "red", 3, "#abcdef"] }));
    open();
    expect(
      screen.getByRole("button", { name: t("tooltipEditor.ownTitle", { colour: "#abcdef" }) }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: t("tooltipEditor.ownTitle", { colour: "red" }) }),
    ).toBeNull();
  });

  test("state that is not a list holds no colours", () => {
    loadState(JSON.stringify({ tooltipColours: "#112233" }));
    open();
    expect(
      screen.queryByRole("button", { name: t("tooltipEditor.ownTitle", { colour }) }),
    ).toBeNull();
  });
});

describe("the inserted value's form", () => {
  test("the arrow keys move the choice", async () => {
    const withHitPoints = unit(footmanEntry, {
      fields: [...view.fields, field({ id: "uhpm", label: "Hit Points", value: "420" })],
    });
    render(TooltipEditor, { view: withHitPoints, onfields: vi.fn(), onclose });
    await fireEvent.click(screen.getByRole("button", { name: t("tooltipEditor.insert") }));
    const forms = within(
      await screen.findByRole("radiogroup", { name: t("tooltipEditor.form.label") }),
    );
    const asItIs = forms.getByRole("radio", { name: t("tooltipEditor.form.auto") });
    expect(asItIs.getAttribute("aria-checked")).toBe("true");
    asItIs.focus();
    await fireEvent.keyDown(asItIs, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        forms
          .getByRole("radio", { name: t("tooltipEditor.form.decimal") })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
  });
});
