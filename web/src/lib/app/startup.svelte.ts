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
import { chooseGameData, type GameDataState, gameData, newer, viewOf } from "../gameData.ts";
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
      this.#take(await chooseGameData());
    } catch (error) {
      this.problem = errorText(error);
    }
  };

  #take(state: GameDataState): void {
    this.data = newer(this.data, state);
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
