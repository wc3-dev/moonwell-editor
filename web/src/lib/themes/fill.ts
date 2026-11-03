/**
 * What a theme leaves out is worked out from what it sets (Sven, 2026-11-02). The amounts are the ones the interface
 * had before themes had files of their own (`app.css` and `themeColors.ts`), so a theme that sets only the four
 * required colours looks as an old palette did. A colour the theme sets is used as written; one that is worked out is
 * moved toward the normal text until it reads on its background.
 */
import { clampLightness, mix, mixOklab, readable } from "./color.ts";
import type { ColorKey, Colors, ThemeType } from "./format.ts";

// What VS Code's terminal shows for a colour a theme leaves out, which the kinds of object take.
const kindDefaults = {
  dark: {
    unit: "#2472c8",
    destructable: "#0dbc79",
    doodad: "#e5e510",
    ability: "#11a8cd",
    buff: "#bc3fbc",
    upgrade: "#cd3131",
  },
  light: {
    unit: "#0451a5",
    destructable: "#00bc00",
    doodad: "#949800",
    ability: "#0598bc",
    buff: "#bc05bc",
    upgrade: "#cd3131",
  },
};

/** Every colour of a theme: the ones in `set`, which are solid `#rrggbb`, and the rest worked out. */
export function fillColors(type: ThemeType, set: Partial<Colors>): Colors {
  const dark = type === "dark";
  const kinds = kindDefaults[type];
  const known: Partial<Colors> = {};
  // A colour is the theme's, else its rule, which asks for the colours it is worked out from.
  const c = (key: ColorKey): string => {
    known[key] ??= set[key] ?? rules[key]();
    return known[key];
  };
  const required = (key: ColorKey) => (): string => {
    throw new Error(`${key} is required`);
  };
  const reads = (color: string, on: string, ratio: number) =>
    readable(color, on, c("text.normal"), ratio);
  const onPanel = (color: string, ratio: number) => reads(color, c("background.panel"), ratio);
  const onTerminal = (color: string) => reads(color, c("terminal.background"), 3);
  const brighter = (color: string) => onTerminal(mix(color, c("text.normal"), 0.2));

  // In the order of `colorKeys`, which the colours come back in.
  const rules: Record<ColorKey, () => string> = {
    "background.base": required("background.base"),
    "background.panel": required("background.panel"),
    "background.gutter": () => mix(c("background.base"), "#000000", dark ? 0.22 : 0.07),
    "background.raised": () => mix(c("background.panel"), c("text.normal"), 0.09),
    "background.hover": () => c("background.raised"),
    "background.field": () => mix(c("background.base"), "#000000", dark ? 0.3 : 0.03),
    "background.selection": () =>
      clampLightness(
        mixOklab(c("background.panel"), c("accent.normal"), dark ? 0.32 : 0.28),
        dark ? { max: 0.44 } : { min: 0.84 },
      ),
    "background.button": () =>
      clampLightness(
        mixOklab(c("background.raised"), c("accent.normal"), dark ? 0.4 : 0.34),
        dark ? { max: 0.44 } : { min: 0.8 },
      ),

    "border.normal": () => mix(c("background.panel"), c("text.normal"), 0.18),
    "border.faint": () => mix(c("background.panel"), c("border.normal"), 0.7),

    "text.normal": required("text.normal"),
    "text.soft": () => onPanel(mix(c("text.normal"), c("background.panel"), 0.1), 4.5),
    "text.muted": () => onPanel(mix(c("text.normal"), c("background.panel"), 0.18), 3),
    "text.faint": () => onPanel(mix(c("text.normal"), c("background.panel"), 0.55), 2),

    "accent.normal": required("accent.normal"),
    "accent.text": () => onPanel(c("accent.normal"), 3),
    "accent.background": () => mix(c("background.panel"), c("accent.normal"), 0.18),

    "state.changed": () => onPanel(dark ? "#cca700" : "#bf8803", 3),
    "state.warning": () => onPanel(dark ? "#f14c4c" : "#e51400", 3),
    "state.warningBackground": () => mix(c("background.panel"), c("state.warning"), 0.18),

    "kind.unit": () => onPanel(kinds.unit, 3),
    "kind.item": () => onPanel(mix(c("kind.upgrade"), c("kind.doodad"), 0.5), 3),
    "kind.destructable": () => onPanel(kinds.destructable, 3),
    "kind.doodad": () => onPanel(kinds.doodad, 3),
    "kind.ability": () => onPanel(kinds.ability, 3),
    "kind.buff": () => onPanel(kinds.buff, 3),
    "kind.upgrade": () => onPanel(kinds.upgrade, 3),

    "terminal.background": () => c("background.panel"),
    "terminal.foreground": () => c("text.normal"),
    "terminal.cursor": () => c("text.normal"),
    "terminal.selection": () => c("background.selection"),
    "terminal.black": () => c("background.base"),
    "terminal.red": () => onTerminal(c("state.warning")),
    "terminal.green": () => onTerminal(c("kind.destructable")),
    "terminal.yellow": () => onTerminal(c("state.changed")),
    "terminal.blue": () => onTerminal(c("kind.unit")),
    "terminal.magenta": () => onTerminal(c("kind.buff")),
    "terminal.cyan": () => onTerminal(c("kind.ability")),
    "terminal.white": () => onTerminal(c("text.soft")),
    "terminal.brightBlack": () => c("text.faint"),
    "terminal.brightRed": () => brighter(c("terminal.red")),
    "terminal.brightGreen": () => brighter(c("terminal.green")),
    "terminal.brightYellow": () => brighter(c("terminal.yellow")),
    "terminal.brightBlue": () => brighter(c("terminal.blue")),
    "terminal.brightMagenta": () => brighter(c("terminal.magenta")),
    "terminal.brightCyan": () => brighter(c("terminal.cyan")),
    "terminal.brightWhite": () => c("text.normal"),
  };

  return Object.fromEntries(
    (Object.keys(rules) as ColorKey[]).map((key) => [key, c(key)]),
  ) as Colors;
}
