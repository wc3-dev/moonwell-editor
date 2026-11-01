import { expect, test } from "vitest";
import { History, type Place } from "./history.svelte.ts";

const place = (id: string): Place => ({ kind: "unit", id });

function visited(...ids: string[]): History {
  const history = new History();
  for (const id of ids) history.visit(place(id));
  return history;
}

const ids = (list: { place: Place }[]) => list.map((each) => each.place.id);

test("a visit moves to the end", () => {
  const history = visited("a", "b");
  expect(history.at).toBe(1);
  expect(ids(history.behind)).toEqual(["a"]);
  expect(history.ahead).toEqual([]);
});

test("the same place twice is one step", () => {
  expect(visited("a", "a").places).toHaveLength(1);
});

test("the same id of another kind is another place", () => {
  const history = visited("a");
  history.visit({ kind: "item", id: "a" });
  expect(history.places).toHaveLength(2);
});

test("behind lists the nearest first, each with its place in the list", () => {
  const history = visited("a", "b", "c");
  expect(history.behind.map((each) => [each.place.id, each.at])).toEqual([
    ["b", 1],
    ["a", 0],
  ]);
});

test("ahead lists the nearest first, each with its place in the list", () => {
  const history = visited("a", "b", "c");
  history.move(-2);
  expect(history.ahead.map((each) => [each.place.id, each.at])).toEqual([
    ["b", 1],
    ["c", 2],
  ]);
});

test("move gives the place, or nothing past either end", () => {
  const history = visited("a", "b");
  expect(history.move(1)).toBeUndefined();
  expect(history.at).toBe(1);
  expect(history.move(-1)?.id).toBe("a");
  expect(history.at).toBe(0);
  expect(history.move(-1)).toBeUndefined();
});

test("a visit after moving back cuts what lay ahead", () => {
  const history = visited("a", "b", "c");
  history.move(-2);
  history.visit(place("d"));
  expect(history.places.map((each) => each.id)).toEqual(["a", "d"]);
  expect(history.at).toBe(1);
});

test("it keeps the last hundred", () => {
  const history = new History();
  for (let index = 0; index < 105; index++) history.visit(place(String(index)));
  expect(history.places).toHaveLength(100);
  expect(history.places[0]?.id).toBe("5");
  expect(history.at).toBe(99);
});

test("leaving a place keeps where it was scrolled to", () => {
  const history = visited("a");
  history.visit(place("b"), 120);
  expect(history.places[0]?.scroll).toBe(120);
  history.move(-1, 40);
  expect(history.places[1]?.scroll).toBe(40);
});

test("no scroll known leaves the place's own", () => {
  const history = visited("a");
  history.visit(place("b"), 120);
  history.visit(place("c"));
  expect(history.places[0]?.scroll).toBe(120);
});

test("clear starts again", () => {
  const history = visited("a", "b");
  history.clear();
  expect(history.places).toEqual([]);
  expect(history.at).toBe(-1);
});
