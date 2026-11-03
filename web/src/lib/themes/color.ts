/**
 * Colour maths for the themes: mixing, WCAG contrast and OKLCH lightness. Colours are hex strings; what comes back is
 * a solid `#rrggbb` in lower case.
 */
type Rgba = { rgb: [number, number, number]; alpha: number };

/** A hex colour: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export function isHexColor(text: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text);
}

export function parsed(color: string): Rgba {
  const digits = color.slice(1);
  const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
  const part = (at: number) => Number.parseInt(full.slice(at, at + 2), 16);
  return {
    rgb: [part(0), part(2), part(4)],
    alpha: full.length === 8 ? part(6) / 255 : 1,
  };
}

export function written(rgb: [number, number, number]): string {
  return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of the way from one solid colour to the other, from 0 to 1. */
export function mix(from: string, to: string, amount: number): string {
  const a = parsed(from).rgb;
  const b = parsed(to).rgb;
  return written([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** A colour that may be see-through as it shows on `under`, which is solid. */
export function flattened(color: string, under: string): string {
  const { rgb, alpha } = parsed(color);
  return mix(under, written(rgb), alpha);
}

// sRGB's curve between a channel from 0 to 255 and the light it gives, from 0 to 1.
function linear(part: number): number {
  const value = part / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encoded(light: number): number {
  const value = Math.min(1, Math.max(0, light));
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);
}

export function luminance(color: string): number {
  const [r, g, b] = parsed(color).rgb.map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** How far apart two colours read, from 1 to 21: the WCAG's measure. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A colour moved toward `toward` until it reads `ratio` against `on`. */
export function readable(color: string, on: string, toward: string, ratio: number): string {
  for (let step = 0; step < 10; step++) {
    const moved = mix(color, toward, step / 10);
    if (contrast(moved, on) >= ratio) return moved;
  }
  return toward;
}

// Oklab (Björn Ottosson's): lightness, then how green-red and blue-yellow. CSS mixes `in oklab` the same way.
type Oklab = [l: number, a: number, b: number];

function toOklab(color: string): Oklab {
  const [r, g, b] = parsed(color).rgb.map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function lightOf([lightness, a, b]: Oklab): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// A colour sRGB cannot show keeps its lightness and hue and gives up chroma, as CSS maps one into a screen's gamut.
function fromOklab([lightness, a, b]: Oklab): string {
  const l = Math.min(1, Math.max(0, lightness));
  const inside = (scale: number) =>
    lightOf([l, a * scale, b * scale]).every((part) => part >= -1e-6 && part <= 1 + 1e-6);
  let kept = 1;
  if (!inside(1)) {
    let [low, high] = [0, 1];
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (inside(middle)) low = middle;
      else high = middle;
    }
    kept = low;
  }
  return written(lightOf([l, a * kept, b * kept]).map(encoded) as [number, number, number]);
}

/** `amount` of the way from one solid colour to the other, mixed as CSS's `color-mix(in oklab, ...)` does. */
export function mixOklab(from: string, to: string, amount: number): string {
  const a = toOklab(from);
  const b = toOklab(to);
  return fromOklab([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

/** A colour's OKLCH lightness, from 0 to 1. */
export function oklchLightness(color: string): number {
  return toOklab(color)[0];
}

/** A colour with its OKLCH lightness held to `min` and `max`, its chroma and hue kept. */
export function clampLightness(color: string, limit: { max?: number; min?: number }): string {
  const [light, a, b] = toOklab(color);
  const held = Math.max(limit.min ?? 0, Math.min(limit.max ?? 1, light));
  return held === light ? color : fromOklab([held, a, b]);
}
