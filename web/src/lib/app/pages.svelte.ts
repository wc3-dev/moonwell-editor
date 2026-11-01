import { untrack } from "svelte";
import type { FieldView } from "../api.ts";
import type { OpenScript } from "../scripts/openScripts.ts";

type ObjectPage = "details" | "table";
export type Page = ObjectPage | "map" | "triggers" | "scripts";

type DetailsView = {
  focusFilter(): void;
  focusField(field: FieldView): Promise<boolean>;
  clipKey(key: "c" | "v"): boolean;
  scrollPosition(): number;
  scrollTo(top: number): void;
};
type TableView = { focusFilter(): void };
type TriggerEditor = { refresh(): Promise<void>; startRename(): void; deleteSelected(): void };
type ScriptEditor = {
  refresh(): Promise<void>;
  open(script: OpenScript): Promise<void>;
  hasScripts(): boolean;
};

/** Which page the middle of the window shows, and the page components that are there to act on. */
export class Pages {
  page = $state<Page>("map");
  /** Where the user last clicked or moved the focus: the tree (Ctrl C copies the object) or a field's value. */
  zone = $state<"tree" | "details">("tree");
  /** The trigger editor stays in the page once shown for a map, so its dialogs and place come back. */
  triggersShown = $state(false);
  details = $state<DetailsView>();
  tableView = $state<TableView>();
  triggerEditor = $state<TriggerEditor>();
  scriptEditor = $state<ScriptEditor>();

  readonly inObjectEditor = $derived(this.page === "details" || this.page === "table");
  readonly scriptsOpen = $derived(this.scriptEditor?.hasScripts() ?? false);

  #objectPage: ObjectPage = "details";
  #beforePick: Exclude<Page, "map"> | null = null;

  show = (next: Page): void => {
    if (next === this.page) return;
    this.page = next;
    if (next === "details" || next === "table") this.#objectPage = next;
    if (next === "triggers") this.triggersShown = true;
    // The two editors change the same scripts: each reads them again when it shows.
    untrack(() => {
      if (next === "triggers") this.triggerEditor?.refresh();
      if (next === "scripts") this.scriptEditor?.refresh();
    });
  };

  showObjectEditor = (): void => this.show(this.#objectPage);

  openScript = (script: OpenScript): void => {
    this.scriptEditor?.open(script);
    this.show("scripts");
  };

  triggerDeleted = (): void => {
    this.scriptEditor?.refresh();
  };

  refreshEditors(): Promise<unknown> {
    return Promise.all([this.triggerEditor?.refresh(), this.scriptEditor?.refresh()]);
  }

  mapChanged(): void {
    this.triggersShown = this.page === "triggers";
  }

  /** While something asks the map for a pick, the map shows; then the page it came from again. */
  followPick(asking: boolean, mapOpen: boolean): void {
    if (asking && this.page !== "map" && mapOpen) {
      this.#beforePick = this.page;
      this.show("map");
    } else if (!asking && this.#beforePick) {
      const back = this.#beforePick;
      this.#beforePick = null;
      this.show(back);
    }
  }
}
