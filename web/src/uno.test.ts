import { createGenerator } from "unocss";
import { expect, test } from "vitest";
import config from "../uno.config";

async function css(classes: string): Promise<string> {
  const uno = await createGenerator(config);
  return (await uno.generate(classes, { preflights: false })).css;
}

async function withTheme(classes: string): Promise<string> {
  const uno = await createGenerator(config);
  return (await uno.generate(classes)).css;
}

test("a theme colour is its variable, so a theme change reaches it", async () => {
  expect(await css("bg-panel")).toMatch(/background-color:\s*var\(--background-panel\);/);
  expect(await css("text-soft")).toMatch(/color:\s*var\(--text-soft\);/);
  expect(await css("border-line")).toMatch(/border-color:\s*var\(--border-normal\);/);
});

test("each class colour is the theme colour it names", async () => {
  const table = {
    "bg-deep": "--background-base",
    "bg-gutter": "--background-gutter",
    "bg-raised": "--background-raised",
    "bg-hover": "--background-hover",
    "bg-field": "--background-field",
    "bg-selection": "--background-selection",
    "bg-button": "--background-button",
    "bg-accent-background": "--accent-background",
    "bg-warning-background": "--state-warning-background",
    "border-line-faint": "--border-faint",
    "text-normal": "--text-normal",
    "text-muted": "--text-muted",
    "text-faint": "--text-faint",
    "text-accent": "--accent-normal",
    "text-accent-text": "--accent-text",
    "text-changed": "--state-changed",
    "text-warning": "--state-warning",
    "text-kind-unit": "--kind-unit",
    "text-kind-upgrade": "--kind-upgrade",
  };
  for (const [name, variable] of Object.entries(table)) {
    expect(await css(name), name).toContain(`var(${variable})`);
  }
  expect(await css("text-cyan text-purple")).not.toMatch(/var\(--(cyan|purple)\)/);
});

test("a fixed colour is itself", async () => {
  expect(await css("bg-[#0d0d12]")).toMatch(/background-color:\s*#0d0d12;/);
  expect(await css("text-white")).toMatch(/color:\s*var\(--colors-white\);/);
});

test("a theme colour takes an opacity", async () => {
  expect(await css("bg-panel/70")).toContain(
    "color-mix(in oklab, var(--background-panel) 70%, transparent)",
  );
});

test("the fonts are the variables in app.css", async () => {
  expect(await withTheme("font-sans")).toContain("--font-sans: var(--font-ui)");
  expect(await css("font-mono")).toContain("font-family:var(--font-mono)");
  expect(await css("font-tooltip")).toContain("font-family:var(--font-tooltip)");
});

test("the interface's few sizes carry their line height", async () => {
  const title = await withTheme("text-title");
  expect(title).toContain("--text-title-fontSize: 13px");
  expect(title).toContain("--text-title-lineHeight: 18px");
  const small = await withTheme("text-small");
  expect(small).toContain("--text-small-fontSize: 11px");
  expect(small).toContain("--text-small-lineHeight: 14px");
  expect(await withTheme("text-mono")).toContain("--text-mono-fontSize: 11.5px");
});

test("the small text's line height is a ratio, so what it holds can scale it", async () => {
  expect(await withTheme("text-xs")).toContain("--text-xs-lineHeight: calc(1 / 0.75)");
});

test("the interface's corner is the variable in app.css", async () => {
  expect(await css("rounded-ui")).toContain("border-radius:var(--radius-ui)");
});

test("Bits UI's states work as bare data variants", async () => {
  expect(await css("data-highlighted:bg-hover")).toContain("[data-highlighted]");
  expect(await css("data-selected:bg-hover")).toContain("[data-selected]");
  expect(await css("data-disabled:opacity-50")).toContain("[data-disabled]");
});

test("Svelte's class: directives are read", async () => {
  const uno = await createGenerator(config);
  const source = `<div class:z-[5]={on} class:shadow-[0_2px_0_var(--accent-normal)]={on}></div>`;
  const { matched } = await uno.generate(source, { id: "Row.svelte", preflights: false });
  expect(matched).toContain("z-[5]");
  expect(matched).toContain("shadow-[0_2px_0_var(--accent-normal)]");
});

test("the utilities sit in the cascade layers app.css orders, so its rules keep their place", async () => {
  const output = await css("flex");
  expect(output).toMatch(/@layer utilities\s*\{/);
  expect(output).not.toContain("@layer default");
  expect(await css("container")).toMatch(/@layer components\s*\{/);
});

test("classes in TypeScript files are scanned", () => {
  const pipeline = config.content?.pipeline;
  const include = pipeline ? [pipeline.include].flat() : [];
  expect(include.some((each) => each instanceof RegExp && each.test("styles.ts"))).toBe(true);
});
