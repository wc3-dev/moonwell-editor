// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { FakeApp, field, footmanEntry, later, unit } from "../../test/fakeApp.ts";
import TooltipEditor from "./TooltipEditor.svelte";

afterEach(() => {
  cleanup();
  delete window.chrome;
});

// The game reads a placeholder's key in any case (game facts, 10-29): `realhp` is `realHP`.
test("a chip names and fills a key written in another case", async () => {
  new FakeApp();
  const view = unit(footmanEntry, {
    fields: [
      field({ id: "utip", label: "Tooltip", value: "" }),
      field({ id: "utub", label: "Extended Tooltip", value: "Has <h000,realhp> life" }),
      field({ id: "uhpm", label: "Hit Points", value: "420" }),
    ],
  });
  render(TooltipEditor, { view, onfields: vi.fn(), onclose: vi.fn() });

  const chip = await screen.findByTitle(/<h000,realhp>/);
  expect(chip.textContent).toContain("420");
});

test("a chip naming a listed ability says its name once it is here, in the same text", async () => {
  const blizzard = later(unit(footmanEntry, { id: "AHbz", kind: "ability", name: "Blizzard" }));
  new FakeApp({ object: () => blizzard.answer });
  const view = unit(footmanEntry, {
    fields: [
      field({ id: "utip", label: "Tooltip", value: "" }),
      field({ id: "utub", label: "Extended Tooltip", value: "Casts <AHbz,Cool1>" }),
      field({
        id: "uabi",
        label: "Abilities",
        type: "objectList",
        listOf: "Ability",
        value: "AHbz",
      }),
    ],
  });
  render(TooltipEditor, { view, onfields: vi.fn(), onclose: vi.fn() });
  const text = screen.getByRole("textbox", { name: "Extended Tooltip" });
  const chip = await screen.findByTitle(/<AHbz,Cool1>/);
  expect(chip.textContent).toMatch(/^AHbz: /);

  blizzard.release();
  await waitFor(() => expect(chip.textContent).toMatch(/^Blizzard: /));
  expect(screen.getByRole("textbox", { name: "Extended Tooltip" })).toBe(text);
});
