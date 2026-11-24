// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { t } from "../text.ts";
import ColorPicker from "./ColorPicker.svelte";

afterEach(() => cleanup());

function square(): HTMLElement {
  Element.prototype.setPointerCapture = () => {};
  const element = screen.getByRole("slider", { name: t("colourPicker.square") });
  element.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
  return element;
}

test("a drag in the square picks the colour under the pointer until the button is let go", async () => {
  render(ColorPicker, { value: "#ff0000", action: "Add", onpick: vi.fn() });
  const element = square();
  await fireEvent.pointerDown(element, { clientX: 100, clientY: 50, pointerId: 1 });
  const dragged = element.getAttribute("aria-valuetext");
  await fireEvent.pointerUp(element, { clientX: 100, clientY: 50, pointerId: 1 });
  await fireEvent.pointerMove(element, { clientX: 0, clientY: 0, pointerId: 1 });
  expect(element.getAttribute("aria-valuetext")).toBe(dragged);
});

// The browser cancels a pointer when the window loses the focus mid-drag, or a pen's palm is rejected.
test("a drag the browser cancels ends there", async () => {
  render(ColorPicker, { value: "#ff0000", action: "Add", onpick: vi.fn() });
  const element = square();
  await fireEvent.pointerDown(element, { clientX: 100, clientY: 50, pointerId: 1 });
  const dragged = element.getAttribute("aria-valuetext");
  await fireEvent.pointerCancel(element, { pointerId: 1 });
  await fireEvent.pointerMove(element, { clientX: 0, clientY: 0, pointerId: 1 });
  expect(element.getAttribute("aria-valuetext")).toBe(dragged);
});
