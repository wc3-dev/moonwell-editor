import { expect, test } from "vitest";
import { placeOf } from "./recent.ts";

test.each([
  ["D:\\Maps\\Arena", "Arena", "D:\\Maps"],
  ["D:\\Maps\\Troll Valley.w3x", "Troll Valley.w3x", "D:\\Maps"],
  ["C:/Maps/Arena", "Arena", "C:/Maps"],
  ["D:\\Maps\\Arena\\", "Arena", "D:\\Maps"],
  ["D:\\Arena", "Arena", "D:\\"],
  ["Arena", "Arena", ""],
])("%s is %s in %s", (path, name, folder) => {
  expect(placeOf(path)).toEqual({ name, folder });
});
