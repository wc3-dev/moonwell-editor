/**
 * What the filter bar remembers per kind of object (Sven, 2026-11-01): the fields starred as favourites and the named
 * presets. They are kept in the window's storage, so they are this PC's and the same in every map.
 */
import { type Kind, kinds } from "../api.ts";

/** A named set of filters: everything the filter bar can narrow by. */
export type FieldPreset = {
  name: string;
  text: string;
  changedOnly: boolean;
  favouritesOnly: boolean;
  categories: string[];
};

type OfKind = { favourites: string[]; presets: FieldPreset[] };

const storageKey = "moonwell-editor.field-filters";

const isText = (value: unknown): value is string => typeof value === "string";

function isPreset(value: unknown): value is FieldPreset {
  const preset = value as Partial<FieldPreset> | null;
  return (
    typeof preset === "object" &&
    preset !== null &&
    isText(preset.name) &&
    isText(preset.text) &&
    typeof preset.changedOnly === "boolean" &&
    typeof preset.favouritesOnly === "boolean" &&
    Array.isArray(preset.categories) &&
    preset.categories.every(isText)
  );
}

// What can be read of what was kept: an entry that does not fit is left out, and the rest stays.
function ofKind(value: unknown): OfKind {
  const { favourites, presets } = (value ?? {}) as Partial<Record<keyof OfKind, unknown>>;
  return {
    favourites: Array.isArray(favourites) ? favourites.filter(isText) : [],
    presets: Array.isArray(presets) ? presets.filter(isPreset) : [],
  };
}

function saved(): Partial<Record<Kind, OfKind>> {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Partial<
      Record<Kind, unknown>
    >;
    return Object.fromEntries(kinds.map((kind) => [kind, ofKind(stored[kind])]));
  } catch {
    return {};
  }
}

export class FieldFilters {
  #kinds = $state(saved());

  #of(kind: Kind): OfKind {
    return this.#kinds[kind] ?? { favourites: [], presets: [] };
  }

  #change(kind: Kind, change: Partial<OfKind>): void {
    this.#kinds[kind] = { ...this.#of(kind), ...change };
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.#kinds));
    } catch {
      // Not remembered: the next start does not have it.
    }
  }

  isFavourite(kind: Kind, id: string): boolean {
    return this.#of(kind).favourites.includes(id);
  }

  /** Stars a field, or takes its star off. */
  toggleFavourite(kind: Kind, id: string): void {
    const { favourites } = this.#of(kind);
    this.#change(kind, {
      favourites: favourites.includes(id)
        ? favourites.filter((each) => each !== id)
        : [...favourites, id],
    });
  }

  presets(kind: Kind): FieldPreset[] {
    return this.#of(kind).presets;
  }

  /** Saves a preset; one of the same name is replaced, where it stands in the list. */
  savePreset(kind: Kind, preset: FieldPreset): void {
    const { presets } = this.#of(kind);
    const known = presets.some((each) => each.name === preset.name);
    this.#change(kind, {
      presets: known
        ? presets.map((each) => (each.name === preset.name ? preset : each))
        : [...presets, preset],
    });
  }

  deletePreset(kind: Kind, name: string): void {
    this.#change(kind, { presets: this.#of(kind).presets.filter((each) => each.name !== name) });
  }
}
