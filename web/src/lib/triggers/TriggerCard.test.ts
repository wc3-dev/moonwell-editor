// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { t } from "../text.ts";
import type { CardView } from "./api.ts";
import type { CardActions } from "./cards.ts";
import TriggerCard from "./TriggerCard.svelte";

afterEach(cleanup);

const card: CardView = {
  id: 2,
  kind: "trigger",
  name: "Start",
  place: null,
  trigger: {
    id: 2,
    kind: "trigger",
    name: "Start",
    description: "",
    enabled: true,
    initiallyOn: true,
    runOnInit: false,
    events: [],
    conditions: [],
    actions: [],
    code: null,
  },
  variable: null,
  count: 0,
};

function eventsTitle(dropKey: string | null): HTMLElement {
  render(TriggerCard, {
    card,
    catalog: { categories: [], types: [], presets: [], functions: [] },
    mode: "",
    language: "jass",
    readOnly: false,
    selected: false,
    active: false,
    renaming: false,
    folded: false,
    commenting: false,
    dropKey,
    actions: {} as CardActions,
    onfold: () => {},
  });
  return screen.getByRole("region", { name: t("triggers.events") })
    .firstElementChild as HTMLElement;
}

// With two on one element, the order the CSS is generated in would pick the winner.
test("a section's title shows a drop with one text colour", () => {
  const colours = /\btext-(normal|soft|muted|faint)\b/g;
  expect(eventsTitle(null).className.match(colours)).toEqual(["text-muted"]);
  cleanup();
  expect(eventsTitle("2:section:event").className.match(colours)).toEqual(["text-normal"]);
});
