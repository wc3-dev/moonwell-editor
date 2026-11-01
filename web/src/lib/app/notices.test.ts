import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Notices } from "./notices.svelte.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("a notice shows for six seconds", () => {
  const notices = new Notices();
  notices.say("Saved");
  expect(notices.current).toEqual({ text: "Saved" });
  vi.advanceTimersByTime(5999);
  expect(notices.current).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(notices.current).toBeNull();
});

test("a warning shows for ten", () => {
  const notices = new Notices();
  notices.say("Not saved", { warn: true });
  vi.advanceTimersByTime(9999);
  expect(notices.current).toEqual({ text: "Not saved", warn: true });
  vi.advanceTimersByTime(1);
  expect(notices.current).toBeNull();
});

test("a caution shows for ten", () => {
  const notices = new Notices();
  notices.say("Saved", { caution: "The backup failed" });
  vi.advanceTimersByTime(6000);
  expect(notices.current).not.toBeNull();
});

test("a new notice replaces the last, with its own time", () => {
  const notices = new Notices();
  notices.say("First");
  vi.advanceTimersByTime(5000);
  notices.say("Second");
  vi.advanceTimersByTime(5000);
  expect(notices.current).toEqual({ text: "Second" });
});
