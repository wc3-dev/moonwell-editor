/**
 * The app's commands for the open map, one typed function each. The types of what they take and answer are generated
 * from the C# records into `bridge.gen.ts`; the ones other files use are passed on from here.
 */

import type {
  About,
  AssetList,
  AssetListKind,
  CameraArgs,
  CellEdit,
  CellsChanged,
  ChoiceList,
  CliffKind,
  CliffPiece,
  CloseRequest,
  Column,
  CurrentMap,
  FieldDescription,
  GroundTile,
  Hit,
  Kind,
  MapInfo,
  MapMarks,
  MapSceneView,
  ObjectView,
  PlaceArgs,
  PlacedThing,
  PlacePlayer,
  RecentMap,
  Reference,
  RegionArgs,
  SaveReport,
  SessionState,
  Startup,
  TableRow,
  TerrainChange,
  TerrainStrokeArgs,
  TerrainUndone,
  ThingArgs,
  ThingChange,
  TreeEntry,
  WindowState,
} from "./bridge.gen.ts";
import { call, on } from "./bridge.ts";

export type {
  About,
  AssetList,
  CellEdit,
  ChainLink,
  ChoiceEntry,
  ChoiceList,
  CloseRequest,
  Column,
  CurrentMap,
  ErrorCode,
  FieldDescription,
  FieldView,
  Hit,
  Kind,
  MapInfo,
  MapOptions,
  ObjectView,
  RecentMap,
  Reference,
  SaveReport,
  SessionState,
  Startup,
  TableCell,
  TableRow,
  TreeEntry,
  WindowState,
} from "./bridge.gen.ts";

/** The seven kinds of object, by the key the app uses, in the Object Editor's tab order. */
export const kinds = [
  "unit",
  "item",
  "destructable",
  "doodad",
  "ability",
  "buff",
  "upgrade",
] as const satisfies readonly Kind[];

// The page fails to build when the app has a kind that is not in the tabs.
type MissingKind = Exclude<Kind, (typeof kinds)[number]>;
const everyKind: [MissingKind] extends [never] ? true : never = true;
void everyKind;

/** One field of one object at one level, for an edit. */
export type FieldRef = { kind: Kind; id: string; field: string; level: number };

/** Asks what the app was started with; the page opens `map` once the game data is ready. */
export function startup(): Promise<Startup> {
  return call("startup");
}

/** The maps opened lately, newest first. */
export function recentMaps(): Promise<RecentMap[]> {
  return call("recentMaps");
}

/** Takes a map off the recent maps, and gives the ones left. */
export function forgetMap(path: string): Promise<RecentMap[]> {
  return call("forgetMap", { path });
}

/** Asks the app for the versions the About page and the start screen show. */
export function about(): Promise<About> {
  return call("about");
}

/** What `openMap` opens: a path, or what the user picks in a dialog. */
export type OpenMapOptions = {
  /** A map folder or an archive file (`.w3x`, `.w3m`); left out, the user picks one. */
  path?: string;
  /** With no path: true asks for an archive in the Open File dialog, false (the default) for a folder. */
  archive?: boolean;
  /** Lets the app drop unsaved edits: pass it only once the user chose Discard (or saved). */
  discard?: boolean;
};

/**
 * Opens a map, a folder or an archive: `path`, or the one the user picks in the app's dialog (null when they cancel).
 * A map that cannot be opened (none there, an archive War3Net cannot read) fails with `failed` and the reason. While
 * the open map has unsaved edits it fails with `unsaved`, unless `discard` is true.
 */
export function openMap(options: OpenMapOptions = {}): Promise<MapInfo | null> {
  const { path, archive = false, discard = false } = options;
  return call("openMap", {
    ...(path === undefined ? {} : { path }),
    ...(archive ? { archive } : {}),
    ...(discard ? { discard } : {}),
  });
}

/** The map that is open in the app and where it stands, or null: a page loaded again shows it. */
export function currentMap(): Promise<CurrentMap | null> {
  return call("currentMap");
}

/** A kind's tree: the map's custom objects first, then every standard object. */
export function tree(kind: Kind): Promise<TreeEntry[]> {
  return call("tree", { kind });
}

/** An object with every field; also for a read-only kind (see `readOnly`). */
export function object(kind: Kind, id: string): Promise<ObjectView> {
  return call("object", { kind, id });
}

/** Every object, of any kind, whose fields name this one (Used by). */
export function usedBy(kind: Kind, id: string): Promise<Reference[]> {
  return call("usedBy", { kind, id });
}

/** Sets a field, typed as text, and answers with the object as it is now. */
export function setField(target: FieldRef, value: string): Promise<ObjectView> {
  const { kind, id, field, level } = target;
  return call("setField", { kind, id, field, level, value });
}

/** Resets a field to its standard value, and answers with the object as it is now. */
export function resetField(target: FieldRef): Promise<ObjectView> {
  const { kind, id, field, level } = target;
  return call("resetField", { kind, id, field, level });
}

/** Makes a custom object based on a standard one; answers with its id (the next free one when `id` is left out). */
export function createObject(kind: Kind, baseId: string, id?: string): Promise<string> {
  return call("createObject", { kind, baseId, id });
}

/** The id `createObject` would give a new object based on `baseId` when given none (nothing is made). */
export function nextId(kind: Kind, baseId: string): Promise<string> {
  return call("nextId", { kind, baseId });
}

/** Makes a custom object as a copy of another; answers with its id (the next free one when `id` is left out). */
export function copyObject(kind: Kind, fromId: string, id?: string): Promise<string> {
  return call("copyObject", { kind, fromId, id });
}

/** Deletes a custom object. */
export async function deleteObject(kind: Kind, id: string): Promise<void> {
  await call("deleteObject", { kind, id });
}

/** Undoes the last edit; false when there is none. */
export function undo(): Promise<boolean> {
  return call("undo");
}

/** Makes the last undone edit again; false when there is none. */
export function redo(): Promise<boolean> {
  return call("redo");
}

/**
 * Saves the edits. Fails with `changedOnDisk` when the map changed on disk since it was read, and with `mapFile` when
 * it could not be read or written (the message says why; the edits stay unsaved).
 */
export function save(): Promise<SaveReport> {
  return call("save");
}

/**
 * Reads the map again from disk, dropping the edits that were not saved. With unsaved edits it fails with `unsaved`,
 * unless `discard` is true: pass it only once the user chose Discard. A map that cannot be read fails with `mapFile`.
 */
export function reload(discard = false): Promise<MapInfo> {
  return call("reload", discard ? { discard } : {});
}

/** Searches the objects of every kind and the kinds' fields; at most `limit` hits, best first. */
export function search(query: string, limit: number): Promise<Hit[]> {
  return call("search", { query, limit });
}

/**
 * The names World Editor shows files by: by sort of file (`icon`, `model`, `pathing`, `shadow`, `splat`, `texture`),
 * then by the file's key (`assetKey`), the objects that use it, tagged by field ("Holy Light <Research>").
 */
export function assetNames(): Promise<Record<string, Record<string, string[]>>> {
  return call("assetNames");
}

/** Every choice list, by the key a `FieldView`'s `choice` names. */
export function choices(): Promise<Record<string, ChoiceList>> {
  return call("choices");
}

/** A kind's fields, by category and then World Editor's sort order. */
export function fields(kind: Kind): Promise<FieldDescription[]> {
  return call("fields", { kind });
}

/**
 * The table's rows: one for each object of `ids` that the kind has (an unknown id is left out), in the order of
 * `ids`, with one cell for each column.
 */
export function table(kind: Kind, ids: string[], columns: Column[]): Promise<TableRow[]> {
  return call("table", { kind, ids, columns });
}

/**
 * Sets (or, with a null `value`, resets) many cells as one edit: all or nothing, and one undo takes them all back.
 * Answers with `{ changed }`, how many cells changed; the page fetches its rows again with `table`. When a cell is refused the
 * error's message starts with the cell, and nothing changes.
 */
export function setCells(kind: Kind, edits: CellEdit[]): Promise<CellsChanged> {
  return call("setCells", { kind, edits });
}

/**
 * Listens to `sessionChanged`, which the app sends after a map is opened or reloaded and after every edit, undo,
 * redo and save. Returns a function that stops listening.
 */
export function onSessionChanged(handler: (state: SessionState) => void): () => void {
  return on("sessionChanged", handler);
}

/**
 * Listens to `closeRequested`, which the app sends when the user closes the window while the page is loaded. The
 * window stays open; the page answers with `closeAsking` at once, then `closeWindow` at once when nothing is typed or
 * unsaved, else once the user has saved or chosen to discard the edits. Returns a function that stops listening.
 */
export function onCloseRequested(handler: (request: CloseRequest) => void): () => void {
  return on("closeRequested", (payload) =>
    handler({ dirty: (payload as Partial<CloseRequest> | null)?.dirty === true }),
  );
}

/** Tells the app the page is asking the user about the unsaved edits (so the window does not ask on its own). */
export async function closeAsking(): Promise<void> {
  await call("closeAsking");
}

/** Closes the window, unsaved edits or not. */
export async function closeWindow(): Promise<void> {
  await call("closeWindow");
}

/** Whether the window is maximized. */
export function windowState(): Promise<WindowState> {
  return call("windowState");
}

/** Listens to `windowState`, which the app sends when the window is maximized or restored. */
export function onWindowState(handler: (state: WindowState) => void): () => void {
  return on("windowState", handler);
}

/** Minimizes the window. */
export async function minimizeWindow(): Promise<void> {
  await call("minimizeWindow");
}

/** Maximizes the window, or restores it when it is maximized. */
export async function maximizeWindow(): Promise<void> {
  await call("maximizeWindow");
}

/** Closes the window as its close button does: unsaved edits are asked about first (see `onCloseRequested`). */
export async function closeClicked(): Promise<void> {
  await call("closeClicked");
}

/** Scales the page, in percent (one of the settings' steps). */
export async function uiScale(percent: number): Promise<void> {
  await call("uiScale", { percent });
}

/** Gives the window's frame the theme's title bar and border colours (`#rrggbb`). */
export async function frameColors(surface: string, border: string): Promise<void> {
  await call("frameColors", { surface, border });
}

/** Where the page loads the game's and the map's files from (the window serves this host). */
const assetHost = "https://game.moonwelleditor";

/**
 * The URL of an icon (any texture) as PNG, by the path object data writes, in a graphics mode (`sd`, `hd`, `de`):
 * the mode's own files first.
 */
export function iconUrl(path: string, mode: string): string {
  return `${assetHost}/icon?path=${encodeURIComponent(path)}&mode=${mode}`;
}

/** The URL of a game or map file's bytes (a model, a texture), by the path object data writes, in a graphics mode. */
export function fileUrl(path: string, mode: string): string {
  return `${assetHost}/file?path=${encodeURIComponent(path)}&mode=${mode}`;
}

/** Lists the game's icons or models in a graphics mode, as object data writes their paths. */
export function assetList(kind: AssetListKind, mode: string): Promise<AssetList> {
  return call("assetList", { kind, mode });
}

/**
 * The map view's scene of the open map in a graphics mode (the app reads the map, and writes nothing). The terrain's
 * bytes of the same scene come from `terrainUrl` afterwards.
 */
export function mapScene(mode: string): Promise<MapSceneView> {
  return call("mapScene", { mode });
}

/**
 * Uses a ground brush once more in the Terrain Editor: the app changes the terrain and answers with the part the view
 * redraws. A stroke's first step has `first` set; `terrainStrokeEnd` closes it as one undo step.
 */
export function terrainStroke(args: TerrainStrokeArgs): Promise<TerrainChange> {
  return call("terrainStroke", args);
}

/** Closes the open ground stroke as one undo step. */
export function terrainStrokeEnd(): Promise<null> {
  return call("terrainStrokeEnd");
}

/** What the undos and redos since the view last asked changed, so it redraws just that. */
export function terrainUndone(mode: string): Promise<TerrainUndone> {
  return call("terrainUndone", { mode });
}

/** The map's cliff types, which the cliff tools offer, in a graphics mode. */
export function terrainCliffTypes(mode: string): Promise<CliffKind[]> {
  return call("terrainCliffTypes", { mode });
}

/** The cliff and ramp models as the terrain has them now, after a cliff or water stroke. */
export function terrainCliffs(mode: string): Promise<CliffPiece[]> {
  return call("terrainCliffs", { mode });
}

/** The placed things as the view draws them now, after a change to one. */
export function terrainThings(mode: string): Promise<PlacedThing[]> {
  return call("terrainThings", { mode });
}

/** The players a placed unit can belong to: the map's, then the neutral ones. */
export function terrainPlayers(): Promise<PlacePlayer[]> {
  return call("terrainPlayers");
}

/** Places a thing in the Terrain Editor: one undo step. */
export function terrainPlace(args: PlaceArgs): Promise<ThingChange> {
  return call("terrainPlace", args);
}

/** The changes to a placed thing, each one undo step: `args.number` is the thing's (see terrainThings). */
export const terrainThing = {
  move: (args: ThingArgs): Promise<ThingChange> => call("terrainMove", args),
  turn: (args: ThingArgs): Promise<ThingChange> => call("terrainTurn", args),
  resize: (args: ThingArgs): Promise<ThingChange> => call("terrainResize", args),
  own: (args: ThingArgs): Promise<ThingChange> => call("terrainOwn", args),
  remove: (args: ThingArgs): Promise<ThingChange> => call("terrainRemove", args),
};

/** The regions and cameras as the view draws them now, after a change to one. */
export function terrainMarks(): Promise<MapMarks> {
  return call("terrainMarks");
}

/** Makes a region (number 0) or changes one, as one undo step. */
export function terrainRegion(args: RegionArgs): Promise<ThingChange> {
  return call("terrainRegion", args);
}

/** Removes region `number`, as one undo step. */
export function terrainRegionRemove(number: number): Promise<ThingChange> {
  return call("terrainRegionRemove", { number });
}

/** Makes a camera (number 0) or changes one, as one undo step. */
export function terrainCamera(args: CameraArgs): Promise<ThingChange> {
  return call("terrainCamera", args);
}

/** Removes camera `number`, as one undo step. */
export function terrainCameraRemove(number: number): Promise<ThingChange> {
  return call("terrainCameraRemove", { number });
}

/** The tiles the paint brush offers in a graphics mode: the tileset's, then the map's others. */
export function terrainTiles(mode: string): Promise<GroundTile[]> {
  return call("terrainTiles", { mode });
}

/** The URL of the terrain bytes of the last `mapScene` in a graphics mode (404 before one). */
export function terrainUrl(mode: string): string {
  return `${assetHost}/terrain?mode=${mode}`;
}
