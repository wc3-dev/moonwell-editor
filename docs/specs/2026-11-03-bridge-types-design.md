# Generated bridge types: design

The page's types for everything that crosses the bridge, generated from the C# types instead of written twice.

Status: **approved by Sven, 2026-11-03.** Sven's decisions are
marked **Sven, 2026-11-03**. The agent's own calls are marked *(agent's call)* and listed together at the end ("Calls
to check").

## Why

The C# host and the Svelte page talk through a bridge of JSON strings (`Bridge.cs`, `web/src/lib/bridge.ts`). Every
type that crosses it is written twice: about 60 C# records in six projects, and the same types again by hand in
`api.ts`, `triggers/api.ts`, `terminal/api.ts`, `map/scene.ts` and `app/gameData.ts`. Command names, argument names
and error codes are plain strings on both sides with no type at all. The copies have already drifted: C# throws the
error codes `noAssets` and `noShell`, which the page's `ErrorCode` does not list.

The first idea was Tapper (`nenoNaninu/Tapper`). It was checked and set aside (**Sven, 2026-11-03**, approach B): it
writes C#'s `string?` as `title?: string` (missing), while the bridge writes `"title": null`, so every nullable field's
type would be wrong (Tapper issue #283; the fix, PR #284, unmerged since 2026-03); and it replaces each doc comment with
`Transpiled from string`. The notes from that check are in the session notes folder (`moonwell-editor-tapper.md`).

## Goals

1. Every type that crosses the bridge is written once, in C#. The page's copy is generated.
2. Command names, arguments, answers, events and error codes are checked on both sides: a mismatch fails the build or
   the tests, not the app at run time.
3. A generated type says exactly what the bridge writes (names, nulls, enum text), because it is read from the
   bridge's own serializer, not from the C# source.
4. The C# doc comments show on the page side too (hovering a field in the IDE).

## Non-goals

- **Changing what goes over the wire.** Command names, argument names, answer fields and their values, and event names
  stay as they are. The one exception is the message of a `badRequest` (see "Arguments").
- **The `.moonwell` files and their schemas.** The page owns `settings.json`, `hotkeys.json`, `state.json` and the
  themes; C# reads four keys by name. Generating the schemas is from TypeScript, not C# (the dependency audit's 1i).
- **The terrain bytes** (`TerrainBytes.cs` and the decode in `map/scene.ts`): a binary layout, not a type.
- **The graphics mode** (`sd`, `hd`, `de`) stays a string *(agent's call: not among the kinds Sven picked, and the page
  types it as `string` today)*.

## Anti-goals

- A generated type that says something the bridge does not do (an optional field where `null` comes).
- The page building against stale types with nothing failing.
- A change the user can see in the app.
- A new NuGet or npm package.

## Scope

All four extras were picked (**Sven, 2026-11-03**):

1. The ~60 answer and event records (the core).
2. **Error codes:** one list in C#; the page's `ErrorCode` is generated.
3. **Boot script:** `Home.BootScript`'s anonymous object becomes a record; the page's `HomeBoot` is generated.
4. **Kinds as enums:** the string kinds the page narrows by hand become C# enums written as today's text.
5. **Command arguments:** each command gets an argument record, and the command list itself is generated, so
   `call("tree", { kind })` is checked end to end.

## Design

### The generator

A console project, `tools/MoonwellEditor.BridgeTypes` *(agent's call on name and place)*, `net10.0-windows`,
referencing `MoonwellEditor.App`, added to `MoonwellEditor.slnx`. Its core is a class the tests can call without a
process (text in, text out). Run as a program it writes one file, `web/src/lib/bridge.gen.ts` *(agent's call)*.

It starts from roots, not from a marker attribute on each record *(agent's call)*: the command table's argument and
answer types, the event list's payload types, `ErrorCode`, and `HomeBoot`. From there it follows every type a property
holds.

For each type it asks the bridge's own `JsonSerializerOptions` (made reachable from the generator; how is the
builder's call) through `options.GetTypeInfo(type)`:

| What the serializer says | TypeScript |
|---|---|
| Object (`JsonTypeInfoKind.Object`) | `export type Name = { ... }`, properties in the serializer's order, by `JsonPropertyInfo.Name` |
| A property of an **answer** with `IsGetNullable` | `name: T \| null` |
| A property of an **argument** with a default value | `name?: T` (it may be left out); plus `\| null` when it is nullable |
| A property of an argument with no default | `name: T` (required), plus `\| null` when nullable |
| List (`Enumerable`) | `T[]` |
| Dictionary with string keys | `Record<string, V>` |
| Dictionary with enum keys | `Partial<Record<K, V>>` *(agent's call)* |
| `string`, `char` | `string` |
| `bool` | `boolean` |
| Every number type | `number` |
| `JsonElement` | `unknown` |
| An enum | the union of the texts the serializer writes: each value is serialised with the same options and the result read back (`"unit" \| "item"`, or numbers if it writes numbers) |

A type used only as an answer is an answer type; one used only as an argument is an argument type. A type used as
both (none today that matters, but `Column` and `CellEdit` are near it) is written once as an answer type when its
required and nullable fields agree, and the generator fails with a clear message when they don't *(agent's call)*.

It fails, naming the path from the root, on what it cannot map (an interface or `object` property, a generic type it
does not know) and on two reachable types with the same name.

Doc comments come from each project's XML documentation file (every `src` project already has
`GenerateDocumentationFile`): a type's `<summary>`, and a property's `<param>` on the record or its own `<summary>`.
`<c>x</c>` becomes `` `x` ``, `<see cref="X"/>` becomes `X`, `<paramref name="x"/>` becomes `x`, whitespace is
collapsed. A missing doc is no error.

The output is deterministic: types sorted by name, `\n` line ends, UTF-8 without a BOM, and a header saying it is
generated, by what, and to run `npm run types`. At the end the file has:

```ts
export type Commands = { tree: { args: TreeArgs; answer: TreeEntry[] }; /* ... */ };
export type Tells = { terminalWrite: TerminalWriteArgs; /* ... */ };
export type Events = { sessionChanged: SessionState; /* ... */ };
export type ErrorCode = "noObject" | "noField" | /* ... */;
```

Biome does not check or format the file *(agent's call)*; it is listed in `biome.json`'s `files.includes` as excluded.

### The command table

The 75 or so commands in `RunNow`, `RunTrigger` and `RunTerminal` become one table in `Commands`, each entry with its
name, its argument record, its answer type and its handler *(agent's call: a table, not attributes on methods or
reflection over methods)*. The shape is the builder's call; for example:

```csharp
Add<KindArgs, IReadOnlyList<TreeEntry>>("tree", args => Map().Tree(args.Kind));
Tell<TerminalWriteArgs>("terminalWrite", args => Terminals.Write(args.Id, args.Text));
```

- `Commands.Run(string command, JsonElement args)` stays the entry point (the bridge and the tests use it). It looks the
  command up, reads its arguments (below) and runs it. A name not in the table is still an `UnknownCommandException`.
- What `Run` does today stays: `choices` waits for the install to open, the model's exceptions map to their codes, and
  `Changed` sends `sessionChanged` after an edit.
- A command with no arguments uses one shared empty record; its page side takes no `args`. A command with no answer
  answers `null`.
- **Told commands** (`terminalWrite`, `terminalResize`, `terminalClose`) are marked as told in the table and go in
  `Tells`; the page's `tell` takes only those, `call` only the others.
- The terminal commands run beside the one-at-a-time queue (`RunsAlongside`, by name prefix today). That stays; it may
  become a flag on the table entry (builder's call).
- `MainForm` needs `RunsAlongside` and `Bridge.CommandOf` as now.

### Arguments

Each command's arguments are a record (`TreeArgs`, `SetFieldArgs`, ...), read from `args` by the serializer with
options of their own *(agent's call: kept apart from the options that write answers, so a null that slips into an
answer does not start throwing)*. They take the bridge's naming and converters, and are strict:

- `RespectNullableAnnotations` and `RespectRequiredConstructorParameters` on.
- `JsonSerializerDefaults.Web`'s looser reading turned off: names match exactly (no case-insensitive match), numbers
  must be JSON numbers (no `"3"`), and the enum converters do not take numbers.

The rule for every argument *(agent's call: the page already sends every argument this way, so nothing changes for
the user; only a malformed request answers differently)*:

- **An argument the page may leave out has a default, and only these do:**
  - `openMap`: `path` (null: the user picks), `archive` and `discard` (false);
  - `reload`: `discard` (false);
  - `createObject` and `copyObject`: `id` (null: the next free id); the page leaves it out when it has none;
  - `openHome`: `file` (null: the folder);
  - `assetList` and `mapScene`: `mode` (`de`);
  - `triggerOptions`: `enabled`, `initiallyOn`, `runOnInit` and `description` (null: leave it as it is);
  - `triggerVariableAdd` and `triggerVariableSet`: `initial` (`""`).
- **Every other argument is required.** That tightens three flags that today count as false when missing or null:
  `triggerFunctionEnable`'s `enabled`, `triggerFolded`'s `folded` and the variables' `isArray`.
- **`null` is taken only where the C# type is nullable:** `setCells`' `value` (required, and null resets; a missing one
  is still a `badRequest`, not a reset), the function place's `parent` (required; null is a trigger's own list), and
  the defaults above that are null. Today `null` also counts as the default for `mode`, `initial`, `archive` and
  `discard`; that goes.
- `setState`'s `value` is any JSON and required (`JsonElement`, `unknown` on the page). `table`'s `ids` is a list of
  text.
- A missing required argument, a `null` where none is taken, a value of the wrong type and an unknown enum text are
  each a `badRequest`. `Run` turns the serializer's `JsonException` into `CommandException(badRequest)`, so tests that
  call `Run` directly still see the code.
- The message of such a `badRequest` now comes from the serializer instead of the hand-written "The argument id is
  missing." *(agent's call; no test checks these messages, and a `badRequest` is a page bug, not something the user
  is told)*.
- Arguments are read before the command runs, so a request with bad arguments and no open map now answers
  `badRequest`, not `noMap`. No test or page path depends on the order.
- Unknown extra properties are ignored, as today.
- Arguments the page spreads in (`{ id, ...place, kind, name }`) are one flat record.
- The checks inside handlers stay: `uiScale`'s steps, `frameColors`' `#rrggbb`, `mapScene`'s mode.

Two answers can be `null`: `openMap` (the user cancelled) and `currentMap` (no map open). A nullable reference type
does not survive into a generic type argument at run time, so their table entries say so, and their answers are
`MapInfo | null` and `CurrentMap | null` on the page.

### Events

One C# list of the events the app sends, each with its name and payload type: `gameData` (`GameDataState`),
`sessionChanged` (`SessionState`), `homeChanged` (`HomeChange`), `closeRequested` (a new `CloseRequest` record instead
of `new { dirty }`), `windowState` (`WindowState`), `terminalOutput` (`TerminalOutput`) and `terminalExit`
(`TerminalExit`). `Bridge.Event` and `MainForm.Notify` take an entry of that list, so a payload of the wrong type does
not compile (shape is the builder's call). The builder checks every `Bridge.Event` and `Notify` call is covered.

### Kinds as enums

C# enums, written as exactly today's text (**Sven, 2026-11-03** on the kinds; the names below are the builder's call):

| Kind | Text | Where it is today |
|---|---|---|
| Trigger tree item | `root`, `category`, `trigger`, `custom`, `script`, `comment`, `variable` | `TriggerTreeItem.Kind`, `CardView.Kind`, `TriggerView.Kind`, `triggerAdd`'s `kind` |
| Function | `event`, `condition`, `action`, `call` | `CatalogFunction.Kind`, `FunctionView.Kind`, `triggerFunctionAdd`'s `kind` |
| Parameter | `preset`, `variable`, `function`, `value`, `none` | `ParameterView.Kind`, `ParamInput.Kind`, `triggerParameter`'s `kind` |
| Block | `condition`, `action` | `BlockView.Kind` |
| Script language | `jass`, `lua` | `TriggerTreeView.Language` (`Session.TriggerLanguage()`) |
| Field's asset | `icon`, `model`, `texture` | `FieldView.Asset` |
| Asset list | `icon`, `model` | `assetList`'s `kind` |
| Object | `unit`, `item`, `destructable`, `doodad`, `ability`, `buff`, `upgrade` | `ObjectView.Kind`, `Hit.Kind`, `Reference.Kind`, `MapInfo.Counts`' keys, every `kind` argument of the object commands |

- The object kind is Moonwell's `Kind` (`ObjectKind` in the editor), which the editor cannot put an attribute on: a
  converter in the bridge's options writes and reads it by `Kinds.Key` / `Kinds.FromKey`.
- The others write camelCase text. The converter goes on each enum, not on all enums in the options, so `ThingKind`
  keeps its PascalCase text (`StartLocation`) *(agent's call on that rule; the mechanism is the builder's)*.
- War3Net already has a `ScriptLanguage` enum; the editor's own enum needs a name that does not clash, or War3Net's is
  used with a converter (builder's call).
- The enum must be on the bridge's records and the argument records. How far it goes into the model (`TriggerDocument`,
  `Session`) is the builder's call, with two limits: the game-data cache file and the map files it writes keep their
  format, so `GameData`'s `FieldInfo.Asset` stays a string in the cache.

### Error codes

One `ErrorCode` enum in `MoonwellEditor.Model` *(agent's call on where: the lowest project both `EditException` and
`CommandException` can see)*, written as camelCase text. `EditException`, `CommandException` and the bridge's own
replies (`unknownCommand`, `badRequest`, `failed`) take it instead of a string. The builder finds every code thrown;
today they are `noObject`, `noField`, `notNumber`, `badValue`, `idTaken`, `idInvalid`, `readOnly`, `badText`,
`changedOnDisk`, `mapFile`, `noMap`, `unsaved`, `unknownCommand`, `badRequest`, `failed`, `gameDataMissing`,
`gameDataLoading`, `gameDataFailed`, `triggerEdit`, `noAssets` and `noShell`.

### The boot script

`Home.BootScript` serialises a `HomeBoot` record (with small records for a theme file and the legacy folder) instead of
an anonymous object, with the same JSON. `HomeBoot` is a root of the generator. `home.ts` keeps
`window.moonwellHome?: HomeBoot` and the empty default.

### The page

- `bridge.ts` gets typed functions (exact signatures are the builder's call):
  - `call<C extends keyof Commands>(command: C, args): Promise<Commands[C]["answer"]>`, where `args` is
    `Commands[C]["args"]` and may be left out for a command with no arguments;
  - `tell<C extends keyof Tells>(command: C, args: Tells[C])`;
  - `on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void)`;
  - `BridgeError.code` is an `ErrorCode`.
- The api files keep their functions and the docs on them; the hand-written types that copy C# go, replaced by imports
  from `bridge.gen.ts`. Types only the page has stay (`Terrain`, `OpenMapOptions`, `kinds`, the page's own aliases).
- `kinds` (the Object Editor's tab order) stays a hand list but is checked against the generated object kind when the
  page compiles: it `satisfies` the type, and a type-level check fails when a kind is missing from it (a union is not
  there at run time, so this is not a vitest test).
- The seven types whose page names differ take the C# names *(agent's call)*: `FieldInfo` → `FieldDescription`,
  `Catalog` → `TriggerCatalogView`, `TriggerTree` → `TriggerTreeView`, `TreeItem` → `TriggerTreeItem`, `Variable` →
  `VariableView`, `MapScene` → `MapSceneView`, `StartedTerminal` → `TerminalStarted`. The page's own `FunctionPlace`
  (`{ parent, branch, index }`) clashes with C#'s `FunctionPlace` (`{ path }`, the answer of `triggerFunctionAdd`), so
  the page's one is renamed or replaced by the generated argument type. The page's kind aliases (`TreeKind`,
  `FunctionKind`, `ParameterKind`, `Kind`) may stay as aliases of the generated unions if that keeps the change small
  (builder's call).
- Where a generated type is looser than the hand one, the page code changes, not the type: for example the light
  vectors are `number[]`, not `[number, number, number]`, and `MapInfo.counts` is `Partial<Record<...>>`.

### Running it, and the check

- `npm run types` runs the tool and writes `web/src/lib/bridge.gen.ts`. `npm run build` and `npm run check` run it
  first; `npm run dev` and `npm test` use the file as it is *(agent's call)*.
- The file is committed, so its changes show in review.
- A test in the C# suite generates the text in memory and compares it with the committed file. When they differ it
  fails with "bridge.gen.ts is out of date: run npm run types in web". So a C# change without regenerating fails
  `dotnet test`, and page code that no longer fits the types fails `svelte-check`.
- `docs/dev.md` says how to regenerate, and that `npm run build` needs the .NET SDK now.

## Testing

- **The generator**, on small sample types in its tests: a nullable answer field is `| null`; an argument with a
  default is optional; lists, both dictionary kinds; enum text read from the serializer (a PascalCase one, a camelCase
  one, one with a custom converter); doc tags converted; the order is stable; a name clash and an unmappable type each
  fail with the path in the message.
- **The wire is unchanged:** the existing App tests pass (`CommandsTests`, `CommandTests`, `BridgeTests`,
  `TerminalCommandTests`, `MapSceneCommandTests`, `HomeTests`). New tests: each new enum writes today's text and reads
  it back; an argument missing, null, of the wrong type or an unknown enum text is a `badRequest` by code; the
  behaviours listed under "Arguments" hold; `BootScript` writes the same JSON as before.
- **The page:** `npm run check` (Biome and svelte-check) and `npm test` pass.
- **In the exe**, with a test editor (its own debug port, `WEBVIEW2_USER_DATA_FOLDER` and `MOONWELL_EDITOR_HOME` in
  scratch folders): open a map; the Object Editor (a field, a new object, undo); the table (columns, a paste); the
  trigger editor (add, move, a parameter, a variable); the terminal; the map view; a settings change; save.

## Constraints

- No new packages.
- The repository's C# rules: `TreatWarningsAsErrors`, XML docs on public types in the house tone, nullable on.
- Build and test load: check `Get-Process dotnet` and add `-m:4` when other runs are going; run the area's tests while
  building, the full suite once before the pull request.
- Other sessions change the editor at the same time; whoever merges second rebases.
  - The dependency audit's pull request (wc3-dev/moonwell-editor#15) changes one line of `Commands.cs`
    (`OfferedLists.Strings` → `GameText.Strings`) and `package.json`.
  - A Svelte Flow session changes the trigger canvas on the page.
  - The Photino host session replaces the window. Agreed split: it owns `MainForm.cs`, `TitleBar.cs`, `PageOrigins.cs`,
    `Program.cs`, the App project file, `webview()` in `bridge.ts` and `Window.chrome` in `env.d.ts`; this work owns
    the records, `Bridge.cs`, `Commands*.cs`, `Home.cs`, `Shells.cs`, the api files and the rest of `bridge.ts`. The
    typed events change `MainForm`'s `Notify` calls by a word each; `CloseRequest` lives in this work's files; `About`'s
    `WebView2` field is the Photino session's to reshape (it then runs `npm run types`).
- Tests that compare an exception's `.Code` with a string (`CommandsTests`, the Model's `TableTests` and
  `ArchiveTests`) change to the enum.

## Left to the builder

The C# shapes (table entries, event entries, argument record names), the generator's internals, how the bridge's
options are reached, the enum names, how far the enums go into the model, the page's function signatures, and the order
of the work, as long as the bridge works after each step.

## Calls to check

The agent's calls, for Sven to read and correct:

1. A console tool at `tools/MoonwellEditor.BridgeTypes`, writing `web/src/lib/bridge.gen.ts`.
2. The branch is `bridge-types` in `../moonwell-editor-bridge-types`, not `tapper-bridge-types`, as Tapper is not used.
3. The generator starts from the commands, events, `ErrorCode` and `HomeBoot`, with no attribute on each record.
4. Commands become a table of entries, not methods found by reflection.
5. Arguments are read with options of their own, stricter than today: exact names, real numbers, enums only as
   text.
6. Only the arguments listed under "Arguments" may be left out; every other one is required, and `null` is taken only
   where the C# type is nullable. Three flags that count as false when missing today become required.
7. A `badRequest`'s message comes from the serializer.
8. The page takes the C# names for the seven types whose names differ.
9. Dictionaries with enum keys are `Partial<Record<K, V>>`; with string keys, `Record<string, V>`.
10. Only the kinds Sven picked become enums; `ThingKind` keeps its PascalCase text; the graphics mode stays a string.
11. `ErrorCode` lives in `MoonwellEditor.Model`.
12. `npm run build` and `npm run check` regenerate; `dev` and `test` don't. Biome skips the generated file.
