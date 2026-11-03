import {
  type About,
  about,
  type ChoiceList,
  choices,
  currentMap,
  onCloseRequested,
  onSessionChanged,
  openMap,
  startup,
} from "../api.ts";
import { loadAssetNames } from "../assetNames.svelte.ts";
import { call, on } from "../bridge.ts";
import { errorText } from "../errors.ts";
import { setPref, watchSettings } from "../prefs.svelte.ts";
import { watchThemes } from "../themes.ts";
import { chooseGameData, type GameDataState, gameData, newer, viewOf } from "./gameData.ts";
import type { MapSession } from "./mapSession.svelte.ts";

/** Reaching the app and its game data: everything else waits for this. */
export class Startup {
  /** Why the page cannot talk to the app; "" when it can. */
  connection = $state("");
  data = $state<GameDataState | null>(null);
  /** Why choosing the game's folder failed. */
  problem = $state("");
  versions = $state.raw<About | null>(null);
  choices = $state.raw<Record<string, ChoiceList> | null>(null);

  readonly view = $derived(this.data ? viewOf(this.data) : null);

  readonly #session: MapSession;
  #gameDataReady = false;
  /** The folder the user chose, until it has loaded and is written to `settings.json`. */
  #chosen: string | null = null;

  constructor(session: MapSession) {
    this.#session = session;
  }

  /** Listens first, then asks: a load that ends in between still reaches the page. Gives the way to stop listening. */
  start(): () => void {
    let stops: (() => void)[] = [];
    try {
      stops = [
        on("gameData", (payload) => this.#take(payload as GameDataState)),
        onSessionChanged((state) => (this.#session.state = state)),
        onCloseRequested(this.#session.closeRequested),
        watchSettings(),
        watchThemes(),
      ];
    } catch (error) {
      this.connection = errorText(error);
      return () => {};
    }
    this.#connect();
    return () => {
      for (const stop of stops) stop();
    };
  }

  async #connect(): Promise<void> {
    try {
      await call<string>("ping");
      about()
        .then((answer) => (this.versions = answer))
        .catch(() => {});
      this.#take(await gameData());
      // A page loaded again (reloaded, or after its process failed) shows the map the app has open, edits and all.
      const open = await currentMap();
      if (open && !this.#session.map) {
        this.#session.state = open.session;
        await this.#session.show(open.map);
      }
    } catch (error) {
      this.connection = errorText(error);
    }
  }

  choose = async (): Promise<void> => {
    this.problem = "";
    try {
      const before = this.data;
      const state = await chooseGameData();
      // A dialog closed with no choice answers with the state as it was.
      if (
        state.source !== null &&
        (state.source !== before?.source || state.version !== before?.version)
      ) {
        this.#chosen = state.source;
      }
      this.#take(state);
    } catch (error) {
      this.problem = errorText(error);
    }
  };

  #take(state: GameDataState): void {
    this.data = newer(this.data, state);
    // The folder is kept once it has loaded, so a wrong choice does not replace a working one.
    if (this.data.loaded && this.data.source !== null && this.data.source === this.#chosen) {
      this.#chosen = null;
      setPref("gameFolder", this.data.source);
    }
    if (this.view === "ready" && !this.#gameDataReady) {
      this.#gameDataReady = true;
      this.#whenReady();
    }
  }

  /** The choice lists, and the map the app was started with, if any. */
  async #whenReady(): Promise<void> {
    try {
      this.choices = await choices();
      void loadAssetNames();
      const started = await startup();
      const path = started.map;
      if (path) await this.#session.openWith(() => openMap({ path }));
    } catch (error) {
      this.#session.problem = errorText(error);
    }
  }
}
