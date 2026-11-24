// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import RichText from "./RichText.svelte";

afterEach(() => cleanup());

function open(markup: string) {
  const onchange = vi.fn();
  render(RichText, {
    markup,
    describe: (token: string) => ({ label: token, title: token }),
    onchange,
    label: "Tooltip",
  });
  return { onchange, text: screen.getByRole("textbox", { name: "Tooltip" }) };
}

/** A paste of a clipboard holding `types`, each with its text. */
async function paste(target: HTMLElement, types: Record<string, string>): Promise<void> {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { types: Object.keys(types), getData: (type: string) => types[type] ?? "" },
  });
  await fireEvent(target, event);
}

test("a paste is read as the game's markup over the selection", async () => {
  const { onchange, text } = open("Hello world");
  await fireEvent.keyDown(text, { key: "a", ctrlKey: true });
  await paste(text, { "text/plain": "|cffff0000Red|r" });
  await waitFor(() => expect(onchange).toHaveBeenLastCalledWith("|cffff0000Red|r"));
});

// An image, or files copied in Explorer: the browser pastes nothing then.
test("a paste with no text leaves the selection as it was", async () => {
  const { onchange, text } = open("Hello world");
  await fireEvent.keyDown(text, { key: "a", ctrlKey: true });
  await paste(text, { Files: "" });
  expect(text.textContent).toBe("Hello world");
  expect(onchange).not.toHaveBeenCalled();
});
