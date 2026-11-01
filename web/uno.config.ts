import extractorSvelte from "@unocss/extractor-svelte";
import { defineConfig, presetWind4 } from "unocss";

// The colours and fonts as utilities: bg-surface, text-fg, border-line, font-mono and so on. The values stay in app.css.
const colors = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  raised: "var(--raised)",
  hover: "var(--hover)",
  line: "var(--border)",
  fg: "var(--fg)",
  body: "var(--text)",
  muted: "var(--muted)",
  faint: "var(--faint)",
  accent: { DEFAULT: "var(--accent)", hi: "var(--accent-hi)", lo: "var(--accent-lo)" },
  changed: "var(--changed)",
  warn: { DEFAULT: "var(--warn)", lo: "var(--warn-lo)" },
  cyan: "var(--cyan)",
  purple: "var(--purple)",
  kind: {
    unit: "var(--kind-unit)",
    item: "var(--kind-item)",
    destructable: "var(--kind-destructable)",
    doodad: "var(--kind-doodad)",
    ability: "var(--kind-ability)",
    buff: "var(--kind-buff)",
    upgrade: "var(--kind-upgrade)",
  },
  gutter: "var(--gutter)",
  field: "var(--field)",
  select: "var(--select)",
  primary: "var(--primary)",
  hairline: "var(--hairline)",
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
