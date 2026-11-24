// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test } from "vitest";
import { appTests, FakeApp, later } from "../../test/fakeApp.ts";
import { forgetAssetLists } from "../assets.ts";
import { setGraphicsMode } from "../graphics.svelte.ts";
import { t } from "../text.ts";
import AssetPicker from "./AssetPicker.svelte";

appTests();

/** The model list's row of a path. */
function option(path: string): HTMLElement {
  const found = screen.queryAllByTitle(path).find((each) => each.getAttribute("role") === "option");
  if (!found) throw new Error(`No option ${path}`);
  return found;
}

test("a mode's list that comes after the next mode's does not replace it", async () => {
  forgetAssetLists();
  setGraphicsMode("sd");
  const classic = later({
    ready: true,
    error: null,
    paths: ["ReplaceableTextures\\CommandButtons\\BTNSD.blp"],
  });
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
  await fireEvent.click(
    screen.getByRole("button", { name: t("assetPicker.pickThe", { field: "Icon" }) }),
  );
  setGraphicsMode("hd");
  await waitFor(() => expect(screen.getByTitle(/BTNHD/)).toBeTruthy());
  classic.release();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(screen.queryByTitle(/BTNSD/)).toBeNull();
  expect(screen.getByTitle(/BTNHD/)).toBeTruthy();
});

// Art fields of the `modelList` type hold a comma list (Flame Strike's Special art, Revive's Target art).
test("a model list previews and marks its models, and a pick replaces its first one only", async () => {
  forgetAssetLists();
  setGraphicsMode("hd");
  const paths = ["Abilities\\A.mdl", "Abilities\\B.mdl", "Abilities\\C.mdl"];
  new FakeApp({ assetList: { ready: true, error: null, paths } });
  const picked: string[] = [];
  render(AssetPicker, {
    kind: "model",
    list: true,
    value: "Abilities\\A.mdl,Abilities\\B.mdl",
    label: "Art - Target",
    onpick: async (path: string) => {
      picked.push(path);
      return null;
    },
    objectKind: "ability",
    fieldId: "atat",
  });
  await fireEvent.click(
    screen.getByRole("button", { name: t("assetPicker.pickThe", { field: "Art - Target" }) }),
  );

  await waitFor(() => expect(option("Abilities\\C.mdl")).toBeTruthy());

  expect(option("Abilities\\A.mdl").getAttribute("aria-selected")).toBe("true");
  expect(option("Abilities\\B.mdl").getAttribute("aria-selected")).toBe("true");
  expect(option("Abilities\\C.mdl").getAttribute("aria-selected")).toBe("false");
  // The preview's caption names the list's first model, not the whole list.
  expect(screen.getAllByTitle("Abilities\\A.mdl").some((each) => each.tagName === "P")).toBe(true);

  await fireEvent.click(option("Abilities\\C.mdl"));
  expect(picked).toEqual(["Abilities\\C.mdl,Abilities\\B.mdl"]);
});

test("a single model field takes the picked path as its whole value", async () => {
  forgetAssetLists();
  setGraphicsMode("hd");
  const paths = ["Units\\A.mdl", "Units\\B.mdl"];
  new FakeApp({ assetList: { ready: true, error: null, paths } });
  const picked: string[] = [];
  render(AssetPicker, {
    kind: "model",
    value: "Units\\A.mdl",
    label: "Model",
    onpick: async (path: string) => {
      picked.push(path);
      return null;
    },
    objectKind: "unit",
    fieldId: "umdl",
  });
  await fireEvent.click(
    screen.getByRole("button", { name: t("assetPicker.pickThe", { field: "Model" }) }),
  );
  await waitFor(() => expect(option("Units\\B.mdl")).toBeTruthy());
  await fireEvent.click(option("Units\\B.mdl"));
  expect(picked).toEqual(["Units\\B.mdl"]);
});
