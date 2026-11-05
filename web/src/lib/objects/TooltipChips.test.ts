// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { FakeApp, field, footmanEntry, unit } from "../../test/fakeApp.ts";
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
