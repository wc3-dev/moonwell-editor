// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { appTests, FakeApp, later } from "../../test/fakeApp.ts";
import { forgetAssetLists } from "../assets.ts";
import { setGraphicsMode } from "../graphics.svelte.ts";
import { t } from "../text.ts";
import AssetPicker from "./AssetPicker.svelte";

appTests();

test("a mode's list that comes after the next mode's does not replace it", async () => {
  forgetAssetLists();
  setGraphicsMode("sd");
  const classic = later({ ready: true, error: null, paths: ["ReplaceableTextures\\CommandButtons\\BTNSD.blp"] });
  new FakeApp({
    assetList: ({ mode }: { mode: string }) =>
      mode === "sd"
        ? classic.answer
        : { ready: true, error: null, paths: ["ReplaceableTextures\\CommandButtons\\BTNHD.blp"] },
  });
  render(AssetPicker, {
    kind: "icon",
    value: "",
    label: "Icon",
    onpick: async () => null,
    objectKind: "unit",
    fieldId: "uico",
  });
  await fireEvent.click(screen.getByRole("button", { name: t("assetPicker.pickThe", { field: "Icon" }) }));
  setGraphicsMode("hd");
  await waitFor(() => expect(screen.getByTitle(/BTNHD/)).toBeTruthy());
  classic.release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(screen.queryByTitle(/BTNSD/)).toBeNull();
  expect(screen.getByTitle(/BTNHD/)).toBeTruthy();
});
