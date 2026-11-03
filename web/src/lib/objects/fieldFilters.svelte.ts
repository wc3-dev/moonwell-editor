/**
 * The favourite fields per kind of object (Sven, 2026-11-01). They are kept in `state.json`, so they are this PC's and
 * the same in every map.
 */
import { type Kind, kinds } from "../api.ts";
import { isRecord } from "../home/jsonc.ts";
import { setState, stateOf } from "../home/state.svelte.ts";

type Favourites = Partial<Record<Kind, string[]>>;

// What can be read of what was kept: a kind that does not fit is left out, and the rest stays.
function saved(): Favourites {
  const stored = stateOf("favourites", {}, isRecord);
  return Object.fromEntries(
    kinds.flatMap((kind): [Kind, string[]][] => {
      const ids = stored[kind];
      return Array.isArray(ids)
        ? [[kind, ids.filter((id): id is string => typeof id === "string")]]
        : [];
    }),
  );
}

export class FieldFilters {
  #kinds = $state.raw<Favourites>(saved());

  isFavourite(kind: Kind, id: string): boolean {
    return this.#kinds[kind]?.includes(id) ?? false;
  }

  /** Adds a field to the favourites, or takes it off. */
  toggleFavourite(kind: Kind, id: string): void {
    const favourites = this.#kinds[kind] ?? [];
    this.#kinds = {
      ...this.#kinds,
      [kind]: favourites.includes(id)
        ? favourites.filter((each) => each !== id)
        : [...favourites, id],
    };
    setState("favourites", this.#kinds);
  }
}
