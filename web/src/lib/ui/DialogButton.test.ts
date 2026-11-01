// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import DialogButton from "./DialogButton.svelte";

afterEach(cleanup);

const label = createRawSnippet(() => ({ render: () => "<span>Save</span>" }));

function button(props: Record<string, unknown>): HTMLButtonElement {
  render(DialogButton, { onclick: () => {}, children: label, ...props });
  return screen.getByRole("button", { name: "Save" });
}

test("a click answers", async () => {
  const onclick = vi.fn();
  await fireEvent.click(button({ onclick }));
  expect(onclick).toHaveBeenCalledOnce();
});

test("the primary looks take the focus when the dialog opens", () => {
  expect(button({ look: "primary" }).hasAttribute("data-primary")).toBe(true);
  cleanup();
  expect(button({ look: "accent" }).hasAttribute("data-primary")).toBe(true);
});

test("the others do not, unless told to", () => {
  expect(button({ look: "plain" }).hasAttribute("data-primary")).toBe(false);
  cleanup();
  expect(button({ look: "outline", takesFocus: true }).hasAttribute("data-primary")).toBe(true);
});

test("it can be off", () => {
  expect(button({ disabled: true }).disabled).toBe(true);
});
