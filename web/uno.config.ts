import extractorSvelte from "@unocss/extractor-svelte";
import { defineConfig, presetWind4 } from "unocss";

// The theme colours and fonts as utilities: bg-panel, text-normal, border-line, font-mono and so on. The values are
// CSS variables, which app.css starts with and themes.ts sets from the theme in use. `line` is border.normal, `deep` is
// background.base (text-base is a font size), and `normal` and `soft` are text colours, so border-normal draws in the
// text colour.
const colors = {
  deep: "var(--background-base)",
  panel: "var(--background-panel)",
  gutter: "var(--background-gutter)",
  raised: "var(--background-raised)",
  hover: "var(--background-hover)",
  field: "var(--background-field)",
  selection: "var(--background-selection)",
  button: "var(--background-button)",
  line: { DEFAULT: "var(--border-normal)", faint: "var(--border-faint)" },
  normal: "var(--text-normal)",
  soft: "var(--text-soft)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
  accent: {
    DEFAULT: "var(--accent-normal)",
    text: "var(--accent-text)",
    background: "var(--accent-background)",
  },
  changed: "var(--state-changed)",
  warning: { DEFAULT: "var(--state-warning)", background: "var(--state-warning-background)" },
  kind: {
    unit: "var(--kind-unit)",
    item: "var(--kind-item)",
    destructable: "var(--kind-destructable)",
    doodad: "var(--kind-doodad)",
    ability: "var(--kind-ability)",
    buff: "var(--kind-buff)",
    upgrade: "var(--kind-upgrade)",
  },
};

// Wind4 mixes every colour for its opacity, even at full strength. Without an opacity, the colour itself is enough.
function plainColor(value: string): string {
  return value.replace(
    /^color-mix\(in \w+, (var\(--[\w-]+\)|#\w+) (var\(--un-[\w-]+-opacity\)|\d+%), transparent\)$/,
    (_, color: string, opacity: string) =>
      opacity.endsWith("%") ? `color-mix(in oklab, ${color} ${opacity}, transparent)` : color,
  );
}

const cssLayers: Record<string, string> = { default: "utilities", shortcuts: "components" };

export default defineConfig({
  presets: [presetWind4()],
  postprocess: (util) => {
    for (const entry of util.entries) {
      if (typeof entry[1] === "string") entry[1] = plainColor(entry[1]);
    }
  },
  theme: {
    colors,
    font: {
      sans: "var(--font-ui)",
      mono: "var(--font-mono)",
      tooltip: "var(--font-tooltip)",
    },
    // One size for the interface, the body's; these are the few others.
    text: {
      title: { fontSize: "13px", lineHeight: "18px" },
      small: { fontSize: "11px", lineHeight: "14px" },
      mono: { fontSize: "11.5px" },
      // A ratio, not Wind4's 1rem: text inside that sets its own size keeps the proportion.
      xs: { fontSize: "0.75rem", lineHeight: "calc(1 / 0.75)" },
    },
    radius: { ui: "var(--radius-ui)" },
    data: { disabled: "disabled", highlighted: "highlighted", selected: "selected" },
  },
  extractors: [extractorSvelte()],
  content: { pipeline: { include: [/\.(svelte|ts|html)($|\?)/] } },
  // Real cascade layers, in the order app.css sets, so that its rules outside the layers beat every class.
  outputToCssLayers: { cssLayerName: (layer) => cssLayers[layer] ?? layer },
});
