import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const page = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const head = page.slice(page.indexOf("<head>"), page.indexOf("</head>"));
const body = page.slice(page.indexOf("<body>"));
const bootScript = '<script src="https://game.moonwelleditor/home.js"></script>';
const firstPaintScript = '<script src="/first-paint.js"></script>';

describe("index.html", () => {
  test("runs the boot script as a plain, blocking script in <head>, so nothing paints before the theme", () => {
    expect(head).toContain(bootScript);
    expect(body).not.toContain("home.js");
  });

  test("runs the boot script before the page's module", () => {
    expect(page.indexOf(bootScript)).toBeLessThan(page.indexOf('type="module"'));
  });

  test("puts the last theme on the page in <head>, after the boot script that holds it", () => {
    expect(head).toContain(firstPaintScript);
    expect(page.indexOf(bootScript)).toBeLessThan(page.indexOf(firstPaintScript));
  });
});
