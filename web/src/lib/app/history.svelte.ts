import type { Kind } from "../api.ts";

/** A place in the visited-objects history, with where the details panel was scrolled to. */
export type Place = { kind: Kind; id: string; scroll?: number };

const longest = 100;

export class History {
  places = $state<Place[]>([]);
  at = $state(-1);

  readonly behind = $derived(
    this.places
      .slice(0, Math.max(0, this.at))
      .map((place, at) => ({ place, at }))
      .reverse(),
  );
  readonly ahead = $derived(
    this.places.slice(this.at + 1).map((place, index) => ({ place, at: this.at + 1 + index })),
  );

  clear(): void {
    this.places = [];
    this.at = -1;
  }

  visit(place: Place, scroll?: number): void {
    this.#remember(scroll);
    const here = this.places[this.at];
    if (here && here.kind === place.kind && here.id === place.id) return;
    this.places = this.places.slice(0, this.at + 1);
    this.places.push(place);
    if (this.places.length > longest) this.places.shift();
    this.at = this.places.length - 1;
  }

  /** Moves `by` places, keeping `scroll` with the place left; nothing when that runs past an end. */
  move(by: number, scroll?: number): Place | undefined {
    const place = this.places[this.at + by];
    if (!place) return undefined;
    this.#remember(scroll);
    this.at += by;
    return place;
  }

  #remember(scroll: number | undefined): void {
    const here = this.places[this.at];
    if (here && scroll !== undefined) here.scroll = scroll;
  }
}
