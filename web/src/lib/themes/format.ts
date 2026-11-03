/**
 * The editor's theme files (Sven, 2026-11-02): one JSON file per theme, whose `colors` set any of the colours below and
 * leave the rest to be worked out. The keys are a public format: they are never renamed or removed.
 */
import { isRecord, lineOfKey, type Problem, parseJsonc } from "../home/jsonc.ts";
import { flattened, isHexColor } from "./color.ts";
import { fillColors } from "./fill.ts";

// biome-ignore format: one group to a line
export const colorKeys = [
  "background.base", "background.panel", "background.gutter", "background.raised", "background.hover",
  "background.field", "background.selection", "background.button",
  "border.normal", "border.faint",
  "text.normal", "text.soft", "text.muted", "text.faint",
  "accent.normal", "accent.text", "accent.background",
  "state.changed", "state.warning", "state.warningBackground",
  "kind.unit", "kind.item", "kind.destructable", "kind.doodad", "kind.ability", "kind.buff", "kind.upgrade",
  "terminal.background", "terminal.foreground", "terminal.cursor", "terminal.selection",
  "terminal.black", "terminal.red", "terminal.green", "terminal.yellow",
  "terminal.blue", "terminal.magenta", "terminal.cyan", "terminal.white",
  "terminal.brightBlack", "terminal.brightRed", "terminal.brightGreen", "terminal.brightYellow",
  "terminal.brightBlue", "terminal.brightMagenta", "terminal.brightCyan", "terminal.brightWhite",
] as const;

export type ColorKey = (typeof colorKeys)[number];

/** The colours every theme sets, which the rest are worked out from. */
export const requiredKeys: readonly ColorKey[] = [
  "background.base",
  "background.panel",
  "text.normal",
  "accent.normal",
];

export type ThemeType = "dark" | "light";

export type Colors = Record<ColorKey, string>;

export type Theme = {
  /** The file's name without `.json`. */
  id: string;
  name: string;
  type: ThemeType;
  /** Every colour, each a solid `#rrggbb`. */
  colors: Colors;
  source: "shipped" | "user";
  /** What is wrong with the file without stopping it from loading. */
  problems: Problem[];
};

const known = new Set<string>(colorKeys);
const topKeys = new Set(["$schema", "name", "type", "colors"]);

/**
 * A theme from the text of its file. A file that can't be read, has no name or type, or lacks a required colour gives
 * no theme; any other mistake is a problem and that key is worked out instead.
 */
export function parseTheme(
  id: string,
  text: string,
  source: Theme["source"],
): { theme: Theme | null; problems: Problem[] } {
  const { value, problems } = parseJsonc(text);
  if (problems.length > 0) return { theme: null, problems };

  const file = isRecord(value) ? value : {};
  const at = (key: string): { line?: number } => {
    const line = lineOfKey(text, key);
    return line === undefined ? {} : { line };
  };

  const name = typeof file.name === "string" && file.name.trim() !== "" ? file.name : undefined;
  const type = file.type === "dark" || file.type === "light" ? file.type : undefined;
  if (name === undefined) problems.push({ code: "noName", ...at("name") });
  if (type === undefined) problems.push({ code: "badType", ...at("type") });
  for (const key of Object.keys(file)) {
    if (!topKeys.has(key)) problems.push({ code: "unknownKey", key, ...at(key) });
  }

  const given: Partial<Colors> = {};
  for (const [key, color] of Object.entries(isRecord(file.colors) ? file.colors : {})) {
    if (!known.has(key)) problems.push({ code: "unknownKey", key, ...at(key) });
    else if (typeof color !== "string" || !isHexColor(color)) {
      problems.push({ code: "badColor", key, ...at(key) });
    } else given[key as ColorKey] = color;
  }
  const lacking = requiredKeys.filter((key) => given[key] === undefined);
  for (const key of lacking) {
    if (!problems.some((problem) => problem.code === "badColor" && problem.key === key)) {
      problems.push({ code: "missing", key });
    }
  }
  if (name === undefined || type === undefined || lacking.length > 0)
    return { theme: null, problems };

  // A see-through colour is laid over the panel, the panel over the base, and the base over black or white.
  const base = flattened(
    given["background.base"] as string,
    type === "dark" ? "#000000" : "#ffffff",
  );
  const panel = flattened(given["background.panel"] as string, base);
  const set: Partial<Colors> = {};
  for (const key of colorKeys) {
    const color = given[key];
    if (color !== undefined) set[key] = flattened(color, panel);
  }
  set["background.base"] = base;
  set["background.panel"] = panel;

  return {
    theme: { id, name, type, colors: fillColors(type, set), source, problems },
    problems,
  };
}

/**
 * The text of a theme file with every colour written, 2-space indented. `header` goes first, as `//` comments.
 */
export function themeText(theme: Pick<Theme, "name" | "type" | "colors">, header?: string): string {
  const comments = header
    ? `${header
        .split("\n")
        .map((line) => (line === "" ? "//" : `// ${line}`))
        .join("\n")}\n`
    : "";
  const colors = Object.fromEntries(colorKeys.map((key) => [key, theme.colors[key]]));
  const file = {
    $schema: "../schemas/theme.schema.json",
    name: theme.name,
    type: theme.type,
    colors,
  };
  return `${comments}${JSON.stringify(file, null, 2)}\n`;
}
