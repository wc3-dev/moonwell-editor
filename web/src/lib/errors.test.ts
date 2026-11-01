import { expect, test } from "vitest";
import { errorText } from "./errors.ts";

test("an error gives its message", () => {
  expect(errorText(new Error("The disk is full"))).toBe("The disk is full");
});

test("anything else gives its text", () => {
  expect(errorText("Refused")).toBe("Refused");
  expect(errorText(404)).toBe("404");
});
