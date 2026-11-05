// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { field } from "../../test/fakeApp.ts";
import { t } from "../text.ts";
import IdsEditor from "./IdsEditor.svelte";

afterEach(cleanup);

test("a second × before the first one's answer takes out from the list as it is then", async () => {
  const sent: string[] = [];
  render(IdsEditor, {
    field: field({ id: "uabi", type: "objectList", listOf: "ability", value: "Aloc,Avul,Ainv" }),
    lookup: () => undefined,
    compact: false,
    onset: (value: string) => {
      sent.push(value);
      return new Promise(() => {});
    },
    onopen: () => {},
  });

  await fireEvent.click(screen.getByRole("button", { name: t("ids.takeOut", { name: "Aloc" }) }));
  await fireEvent.click(screen.getByRole("button", { name: t("ids.takeOut", { name: "Avul" }) }));

  expect(sent).toEqual(["Avul,Ainv", "Ainv"]);
});
