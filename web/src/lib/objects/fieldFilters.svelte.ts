/**
 * The favourite fields per kind of object (Sven, 2026-11-01). They are kept in the window's storage, so they are this
 * PC's and the same in every map.
 */
import { type Kind, kinds } from "../api.ts";

type OfKind = { favourites: string[] };

const storageKey = "moonwell-editor.field-filters";

const isText = (value: unknown): value is string => typeof value === "string";

// What can be read of what was kept: an entry that does not fit is left out, and the rest stays.
function ofKind(value: unknown): OfKind {
  const { favourites } = (value ?? {}) as Partial<Record<keyof OfKind, unknown>>;
  return { favourites: Array.isArray(favourites) ? favourites.filter(isText) : [] };
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

  isFavourite(kind: Kind, id: string): boolean {
    return this.#kinds[kind]?.favourites.includes(id) ?? false;
  }

  /** Adds a field to the favourites, or takes it off. */
  toggleFavourite(kind: Kind, id: string): void {
    const favourites = this.#kinds[kind]?.favourites ?? [];
    this.#kinds[kind] = {
      favourites: favourites.includes(id)
        ? favourites.filter((each) => each !== id)
        : [...favourites, id],
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(this.#kinds));
    } catch {
      // Not remembered: the next start does not have it.
    }
  }
}
