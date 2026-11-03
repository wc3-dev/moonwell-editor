// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import { t } from "../text.ts";
import TeamColourGrid from "./TeamColourGrid.svelte";

afterEach(cleanup);

const player = (player: number, colour: string) =>
  screen.getByRole("radio", { name: t("model.playerLabel", { player, colour }) });

test("a click picks a player's colour", async () => {
  const onpick = vi.fn();
  render(TeamColourGrid, { value: 0, onpick });
  await fireEvent.click(player(2, "Blue"));
  expect(onpick).toHaveBeenCalledWith(1);
});

test("the arrow keys pick the colour beside", async () => {
  const onpick = vi.fn();
  render(TeamColourGrid, { value: 0, onpick });
  const red = player(1, "Red");
  expect(red.getAttribute("aria-checked")).toBe("true");
  red.focus();
  await fireEvent.keyDown(red, { key: "ArrowRight" });
  await waitFor(() => expect(onpick).toHaveBeenCalledWith(1));
});
