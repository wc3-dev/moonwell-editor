/**
 * The graphics mode the editor shows (Sven, 2026-10-27), as World Editor's: Classic (`sd`), Reforged (`hd`) or
 * Definitive Edition (`de`, the default). It picks the icons and models (each mode's own files first) and the values
 * the game keeps per mode (the Priest's icon is BTNPriest in Classic, BTNPriestV1 otherwise). Kept in
 * `settings.json` as `game.graphicsMode` (Sven, 2026-11-02).
 */
import type { FieldView, ObjectView } from "./api.ts";
import { prefs, setPref } from "./prefs.svelte.ts";
import { t } from "./text.ts";

export type GraphicsMode = "sd" | "hd" | "de";

/** The modes with World Editor's names, in its order. */
export const graphicsModes: { mode: GraphicsMode; name: string }[] = [
  { mode: "sd", name: t("graphics.sd") },
  { mode: "hd", name: t("graphics.hd") },
  { mode: "de", name: t("graphics.de") },
];

/** The mode on the page; reading it in a template follows its changes. */
export const graphics = {
  get mode(): GraphicsMode {
    return prefs.graphicsMode;
  },
};

/** Shows another mode, and remembers it. */
export function setGraphicsMode(mode: GraphicsMode): void {
  setPref("graphicsMode", mode);
}

/** A field as the mode shows it: a standard value the game keeps per mode is the mode's. */
export function fieldInMode(field: FieldView, mode: GraphicsMode): FieldView {
  const own = field.modes?.[mode];
  if (own === undefined) return field;
  return field.changed ? { ...field, base: own } : { ...field, value: own, base: own };
}

/** An object as the mode shows it. */
export function viewInMode(view: ObjectView, mode: GraphicsMode): ObjectView {
  return view.fields.some((field) => field.modes)
    ? { ...view, fields: view.fields.map((field) => fieldInMode(field, mode)) }
    : view;
}
