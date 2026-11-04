# Developing the Object Editor

Tools: .NET 10 SDK, Node 24 with npm, the WebView2 runtime. Commands run from the repository root unless a `cd` says
otherwise.

## First time

```
cd web
npm install
```

The game data is read by Moonwell's `Moonwell.GameData` package, and the map's object files by its `Moonwell.MapFiles`,
both restored from nuget.org like the other packages; `MoonwellVersion` in `Directory.Build.props` sets their version.

## Run the app with live reload

Two terminals. The first runs the Vite dev server (it stays on port 5173):

```
cd web
npm run dev
```

The second starts the window and points it at Vite (Debug build only):

```
# PowerShell
$env:MOONWELL_EDITOR_DEV_URL = "http://localhost:5173"
dotnet run --project src/MoonwellEditor.App

# Git Bash
MOONWELL_EDITOR_DEV_URL=http://localhost:5173 dotnet run --project src/MoonwellEditor.App
```

Without `MOONWELL_EDITOR_DEV_URL` the window shows the built page instead: run `npm run build` in `web/` first, then
`dotnet build` copies `web/dist` next to the exe as `wwwroot`. (`dotnet build` does not run npm.)

## Open a map at start

The app takes a map, a folder or an archive (`.w3x`, `.w3m`), as its first command-line argument and opens it once the
game data is ready, as if it had been picked with "Open map…" (handy for checking the window without the dialogs, and
for "open with"):

```
dotnet run --project src/MoonwellEditor.App -- "C:\Maps\Arena"
dotnet run --project src/MoonwellEditor.App -- "C:\Maps\Arena.w3x"
src/MoonwellEditor.App/bin/Debug/net10.0-windows/MoonwellEditor.exe "C:\Maps\Arena"
```

The page asks for it with the `startup` command, which gives the map once; a page loaded again (live reload) does
not open it again.

The page logs how long opening a map, a kind's tree and an object take to the console, as `[timing] …` lines.

## Build the exe

Build the page first, then publish a Release build:

```
cd web && npm run build
dotnet publish src/MoonwellEditor.App -c Release -r win-x64 --self-contained false
```

The app is then `src/MoonwellEditor.App/bin/Release/net10.0-windows/win-x64/publish/MoonwellEditor.exe`, about
6 MB with the DLLs and the page (`wwwroot`) next to it: copy the whole `publish` folder to move it. It needs the .NET
10 Desktop Runtime (the SDK includes it); `--self-contained true` bundles .NET instead, for a PC without it, at about
70 MB more.

A single-file exe (`-p:PublishSingleFile=true`) builds, but it is not one file yet: the page (`wwwroot`), WebView2's
`WebView2Loader.dll` and `runtimes` stay beside it. It has not been run.

## The game

The editor reads the game data (fields, standard objects, lists), the tree's icons and the icon and model pickers
from the Warcraft III install's own storage, with Moonwell's reader (`Moonwell.GameData`). It uses the folder chosen
in Settings → Game data, else the folder in `MOONWELL_WAR3`, else `C:\Program Files (x86)\Warcraft III`. Without one
it asks for the folder. It takes only the install's folder (the one with `.build.info`), never a `war3.w3mod` export,
which may be incomplete.

The game data is cached in `%LOCALAPPDATA%\MoonwellEditor\gamedata`, once per build of the game (its build key in
`.build.info`), so an update of the game builds it again.

The tests that need the game read the install the same way and check nothing when there is none. Only the
map-archive test that opens Blizzard's `(4)losttemple.w3m` takes it from a folder, `maps` in the folder in
`MOONWELL_EDITOR_GAME_DATA`.

## The .moonwell folder

Settings, hotkeys and the user's themes are files in `C:\Users\<name>\.moonwell\`, not in the page's storage:

```
settings.json   what Settings shows, the theme, the code theme, the Warcraft III folder
hotkeys.json    only the hotkeys that differ from the defaults
state.json      what the editor remembers on its own: recent maps, panel sizes, table columns, favourites
themes\         the user's own themes
schemas\        the JSON schemas for the files above, written by the editor
```

The page cannot touch the disk, so `Home.cs` owns the folder. `https://game.moonwelleditor/home.js` is a script made
from the files (`Home.BootScript`), which the page runs before it paints as `window.moonwellHome`; it is answered
before the game data is ready, and `index.html` has it in `<head>`. The page's own script runs only after the first
paint can happen, so `public/first-paint.js`, a plain script right after it, puts on the theme the page showed last
(`lastTheme` in `state.json`, which `Appearance.show` keeps), so a start paints first in the theme shown last. That is
the chosen one unless the choice or the theme's file changed while the editor was closed, when the page switches as
soon as its script runs; only a start with no `lastTheme` (the first) paints in app.css's defaults. The window starts in
that theme's colours too (`Home.LastPageColors`), so a light theme does not open on dark grey.
The `writeHome` and `setState` commands change the files (`writeHome` takes only `settings.json`, `hotkeys.json`,
`themes/<name>.json` and `schemas/<name>.schema.json`), and `openHome` opens the folder or one of its files in the
shell. A file watcher sends the `homeChanged` event when one of `settings.json`, `hotkeys.json` and `themes\*.json` is
saved or deleted, by another program or by the editor's own `writeHome`, so the page has to tell its own write coming
back from a change made elsewhere. A `game.folder` in `settings.json` that differs from the folder in use loads the new
one. While there is no `settings.json`, the old `%LOCALAPPDATA%\MoonwellEditor\settings.json` gives the Warcraft III
folder and the recent maps (`legacy` in the boot script), and the page moves what it kept in its storage. A file that is
there but stays held by another program is named in `unreadable` in the boot script, with no text, so the page does not
take it for a missing file and write over it. The game-data cache and WebView2's own data stay in
`%LOCALAPPDATA%\MoonwellEditor`.

`main.ts` gives the page what the boot script holds before it mounts: `loadSettings`, `loadHotkeys` (both honour
`unreadable`), `loadState` and `loadUserThemes`. The two files people edit, `settings.json` and `hotkeys.json`, follow
the same rules, which `home/homeFile.svelte.ts` keeps (`HomeFile`): the file's latest text, no write to a file that
could not be read until a text that reads arrives, the page's own writes coming back from the watcher taken for nothing
(each text written is remembered until its echo arrives, so a late echo of an older write cannot undo a newer one), and
a change edited into the latest text so the comments stay. `prefs.svelte.ts` and `app/keymap.ts` each have one. The
edits are `setKey` in `home/jsonc.ts`, which changes, adds or removes one property and leaves the rest of the text as it
was; `jsonc-parser` only reads.

In `app/keymap.ts`, `readKeymap` turns a text into a keymap and its problems, `loadHotkeys` gives the keymap a text
makes (none for a file that can't be read), and `saveKeymap` edits only the commands that changed into the latest text.
`Editor` starts from `loadedKeymap()`, what the file made when `main.ts` loaded it, and follows `homeChanged`; it never
reads the boot itself. `state.json` is `home/state.svelte.ts`: `loadState` takes the text at start, `stateOf` reads a
key (with a fallback for one that is missing or does not fit), and `setState` keeps the value in memory and sends
`setState`, which the app merges into the file. The page never writes `recentMaps`. The keys are `terminalHeight`,
`favourites` (a list of field ids for each kind), `tooltipColours`, `objectEditor.columns.<kind>` and `lastTheme` (the
theme shown last: its id, `dark` or `light`, and its CSS variables); `stateStore`
gives the Table view's columns the `getItem` and `setItem` they had in the window's storage. A write or an open that
fails (`writeHome`, `keepState`, `openHome`) answers `false`, never rejects, and sets `homeNotice` for Settings once.
The move to the folder (`home/move.ts`) writes `settings.json`, and so marks itself done, only when every write before
it went through.

The user's themes are `themes/user.svelte.ts`, which `themes.ts` re-exports: `loadUserThemes` takes the boot's
`themes` (and the `unreadable` ones, listed as refused), `themeChanged` a theme file saved or deleted, and
`watchThemes` follows `homeChanged`. `allThemes()` is the shipped themes with a user theme of the same id in each
one's place, then the other user themes, and `Appearance` reads the theme in use from it, so a saved file changes the
page at once. A file that can't be loaded keeps the last version of that theme that did load; `themeFiles` is what
Settings lists, with the problems. `copyTheme` is Settings' **Copy as new theme**. The file format is in
`docs/themes.md`.

`MOONWELL_EDITOR_HOME` names another folder to use instead of `.moonwell`. A test editor sets it and
`WEBVIEW2_USER_DATA_FOLDER` to scratch folders, so it never changes the files of an editor that is open (which picks a
change up at once) and never runs the move from today's storage in someone's place:

```
# PowerShell
$env:MOONWELL_EDITOR_HOME = "$env:TEMP\moonwell-test\home"
$env:WEBVIEW2_USER_DATA_FOLDER = "$env:TEMP\moonwell-test\webview"
```

## The map view

The Terrain Editor is the page a map opens on, and its button shows the whole map, read only (design: wc3-cs
`docs/plans/2026-10-29-map-view-design.md`).
`MoonwellEditor.Map` reads the map's `war3map.w3e`, `war3map.doo`, `war3mapUnits.doo`, `war3map.w3r`, `war3map.w3c`
and `war3map.w3i` with War3Net, and works out the corner heights, the tiles' texture pieces, the cliff and ramp
models and each placed thing's model and trigger name (`gg_unit_hfoo_0001`). The page asks for it with the `mapScene`
command (a graphics mode), then fetches the terrain's bytes from `https://game.moonwelleditor/terrain?mode=` (their
layout is in `TerrainBytes.cs`). It draws with its own WebGL2 code in `web/src/lib/map/`, war3-model only reading the
models, and picks by drawing each thing's number into a hidden picture. The page logs `[timing] map scene`, `map
ground` and `map models` lines.

war3-model is wc3-dev's fork (`wc3-dev/war3-model`, branch `moonwell-package`), which reads the game's version 1800
cameras, lights and skins. `web/package.json` takes it by its git tag; npm 12 refuses git dependencies unless a project
opts in, which `web/.npmrc` does for the project's own (`allow-git=root`).

It lights the map as World Editor's Lighting: Noon does: `DayLights.cs` reads the tileset's day and night light
models (version 1800 lights, read by hand) at the middle of their day, and HD and Definitive Edition add the
environment map's colours as the sky (`gl/lighting.ts` has the shading and its scales, set by eye against World
Editor). HD and Definitive Edition cast the sun's shadows from a depth map drawn around the camera's target before
each frame (`gl/shadows.ts`); Classic darkens the ground by the map's baked `war3map.shd` and lays each unit's shadow
picture under it (`gl/unitShadows.ts`). Each model's Stand animation is sampled into textures the shaders read
(`map/animation.ts`); while anything moves the view draws every frame, each pass only the copies it can see
(`gl/culling.ts`).

To look into the page of a running exe (its console, its WebGL calls), start it with WebView2's debugging port open
and attach Chrome's DevTools or a script to `http://127.0.0.1:9333`:

```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" src/MoonwellEditor.App/bin/Release/net10.0-windows/win-x64/publish/MoonwellEditor.exe "C:\Maps\Arena.w3x"
```

## The trigger editor

The Trigger Editor button shows the map's triggers.
`MoonwellEditor.Triggers` holds the logic: `TriggerCatalog` reads the game's `UI\TriggerData.txt` with World Editor's
strings (War3Net's bundled copy lags the game, and its reader stops at lines the game's file has, so `Cleaned` drops or
corrects them first); `TriggerDocument` is the map's `war3map.wtg` and `war3map.wct` with the edits and the views the page
draws; `TriggerScript` and `TriggerJass` write the script. `Session.Triggers.cs` reads the document when the view first
asks, makes each edit one undo step and adds the files to a save. The bridge commands are in `Commands.Triggers.cs` and
the page in `web/src/lib/triggers/`, from `TriggerEditor.svelte`: `triggerState.svelte.ts` keeps the state and makes the
edits, `triggerDrag.svelte.ts` has the drags and `triggerMenus.ts` the context menus.

An edit never changes an item in place: it copies the item, so a snapshot taken before stays as it was and an undo step
costs a list of references. A file War3Net does not write back to the same bytes, an older format or a pair of files that
do not match shows read only and is never written.

A save of a JASS map keeps its `war3map.j` and replaces only what triggers decide (`TriggerScript.Splice`): the user's
variables and `gg_trg_` lines in `globals`, `InitGlobals`, the custom script code, the trigger functions,
`InitCustomTriggers` and `RunInitializationTriggers`, and the calls in `main`. War3Net's own builder is not used for
this: it differs from World Editor outside the triggers, and its renderer has no multiple-action loops and drops the
quotes of some values. `TriggerScriptTests` compares the result with World Editor's script on every JASS map of the
install. World Editor declares and sets a placed unit, item or destructable only when a trigger names it, so a unit or
item picked for the first time gets its variable there (`AddPlaced`, found by its type and place). A destructable cannot:
the game makes it from `war3map.doo` unless that says not to, so the script would make a second one, and the editor does
not write that file yet. In that case, for a Lua map and for vJass (only JassHelper's output is in the script) the
triggers are saved, the script is left as it is, and the save says so.

A function's place in a trigger is a path of steps split by `/`: a number is a function of the trigger, `cN` a function
inside the one before it, `pN` a parameter, `i` an array's index (`3/c1/p2/p0`).

A category shows as a grid of cards (`TriggerCanvas.svelte`) on Svelte Flow (`@xyflow/svelte`), which pans, zooms,
snaps and moves the cards. Each card is a node (`CardNode.svelte`) that reads the rest from the grid (`setGrid` in
`cards.ts`), and moves by its title bar (`data-grip`; what is marked `nodrag` there stays a button or a box). Two things
stay the grid's own: Svelte Flow pans on the right button but then opens no menu, so a right click that did not move
opens the grid's menu here; and in 1.7.0 a view set from outside never reaches its zoom, so the view moves only through
`setViewport`.

A trigger is the outer card (`TriggerCard.svelte`) and its events, conditions and actions are cards inside it
(`FunctionCard.svelte`), with World Editor's sentence and a chip for each parameter. A card's place and fold are in
`war3map.triggerlayout.json` in the map, read and written by `TriggerDocument.Layout.cs` and named in `war3map.imp`, as
World Editor's save drops a file no import names (it shows in its Import Manager). The first save of a layout adds that
entry. A card with no place stands in columns (`canvas.ts`), counted when the category first shows; moving one card
keeps the places of all of them, so nothing else jumps. There is one selection, as in the object editor, and `zone`
says where the user is, the side panel or the grid: the selection shows strong there and faintly on the other side, and
F2 and Delete act there (`actedOn`). An edit to a function asks again for that card only, the rest for the whole grid.
On the largest category of the install's maps (BlizzardTD's Initialization, 1520 functions) a step of a pan takes 9 to
15 ms of the page's main thread with every card drawn, nearly all of it the browser painting; the canvas's own script
takes under 1 ms, as it did before Svelte Flow, measured the same way.

A script shows in `ScriptBox.svelte`, a CodeMirror 6 editor. Lua and C# are CodeMirror's own modes, and JASS is a stream
parser in `jass.ts`, as CodeMirror has none. `scriptLanguages.ts` holds the languages and the colours. The map's language
comes with the tree (`Session.TriggerLanguage`), from the script language chosen in World Editor, so a map is JASS or Lua
and never both. Nothing picks C# yet, as no script in a map's triggers is in C#. CodeMirror reads the grid's CSS scale, so
a click lands on the right character at every zoom, and it draws only the lines in view: 150 scripts of 300 lines open in
1.3 s, where textareas took 2.2 s. The caret and the selection stay the browser's.

The editor's own themes are files of the same kind as the user's: `web/src/themes/<id>.json`, 64 of them, one for
each code theme, with its id and name, loaded by `themes/shipped.ts`. `npm run themes` (`scripts/make-themes.ts`) writes
a file for each code theme that has none, from `node_modules/tm-themes`, with every colour written
(`scripts/vscodeColors.ts` picks which of a VS Code file's colours each key takes), and never overwrites a file: the
shipped themes can be tuned by hand, and a code theme added later gets its twin. `themes/format.ts` reads and checks a
theme file, `themes/fill.ts` works out the colours a file leaves out, and `themes.ts` puts the chosen theme's colours
on the page as CSS variables (`--background-panel` and so on). `app.css` starts them in Kanagawa Dragon, and
`uno.config.ts` turns them into the classes (`bg-panel`, `text-normal`, `border-line`; `deep` is `background.base`).

The code themes (`codeThemes.ts`) are VS Code's own theme files, from Shiki's `tm-themes` package, whose `NOTICE` has
each one's licence; Aurora X is left out for its GPL. Monaco reads a file as it is. A script box reads one colour per
kind of word from it, as VS Code would pick it for that scope, into the `--code-*` tokens in `app.css`. Settings has a
code theme of its own (`appearance.codeTheme`); until one is chosen scripts are drawn in Dark Plus, or in Light Plus
under a light editor theme (`codeThemeOf`).

The Script Editor (`ScriptEditor.svelte`) is a page of its own, with the scripts opened from the Trigger Editor down the
side (`openScripts.ts`). It stays in the page for as long as the map is open, and so does the trigger editor once shown:
the two editors read the map's scripts again when they show, as both change them. Its header button is off with no
script open, so a delete in the Trigger Editor has it read them too, as a deleted script closes.

Its editor is Monaco in monaco-languageclient's extended mode, on `@codingame/monaco-vscode-api`, which is VS Code's own
services in the page. The cards stay on CodeMirror, as the grid scales them with CSS and Monaco has reports of clicks
landing wrong there. `web/src/lib/scripts/monaco/` holds it, and the page loads it when a script first opens, so a map
that never opens one does not pay for it (about 15 MB of the page's 16). `setup.ts` starts it once. VS Code's extensions
bring Lua and C#, and JASS comes as an extension of ours with Drake53's TextMate grammar, kept unchanged with its licence;
`editorThemes.ts` gives VS Code the code themes as an extension. `scriptsEditor.ts` has one editor and a document per open
script, so each keeps its caret, scroll and undo. A document is a file in VS Code's in-memory file system, held by a
reference (`createModelReference`): VS Code disposes a model made with `editor.createModel`, and a language server will
want files. Monaco keeps the keys it knows from the window, so `Editor.onkeydowncapture` takes the window's own keys
(`keysEverywhere`) before it does. No language server runs yet.

All the `@codingame/monaco-vscode-*` packages must be the one version that `monaco-languageclient` asks for, and the
`vscode` package is an alias of `@codingame/monaco-vscode-extension-api` at that version: move them together.

## The terminal

The terminal panel (Ctrl `, or Ctrl Ö on a Swedish keyboard) runs real shells. `Shells.cs` finds them, `ConsoleProcess.cs` runs one in a Windows pseudo
console (ConPTY, called directly, so there is no NuGet package), and `Terminals.cs` keeps the running ones by id. The page
draws each in xterm.js (`web/src/lib/terminal/`), which it loads when a terminal first opens. A new terminal opens in the
map's folder, or the folder an archive sits in, or the home folder with no map.

The bridge answers the page's requests one at a time, and a save can take a while, so the `terminal…` commands go through
a line of their own (`OrderedLine`, strictly in order). `terminalWrite` and `terminalResize` have no answer (`tell` in
`bridge.ts`), so a stream of keys never shows as the app working. In a terminal only the palette's and the panel's own
keys stay the window's; every other key is the shell's (`keysOutOfTheTerminal`).

Closing a pseudo console ends what is attached to it, but a shell that has only just started is not attached yet, so
`ConsoleProcess.End` ends it by force after a moment. A page that loads again closes all the shells, as it has no tabs for
them.

## The page's code

`web/src/lib` has a folder for each part of the editor, with what several of them use at its top (`api.ts`, `bridge.ts`,
`text.ts`, `themes.ts`, `prefs.svelte.ts`):

| Folder | What is in it |
| --- | --- |
| `app` | The window: the state below, the header, title bar, status bar, settings and the dialogs about the map |
| `objects` | The Object Editor: the tree, the details, the table, the tooltip editor, the model preview |
| `triggers` | The Trigger Editor |
| `scripts` | The Script Editor and Monaco |
| `map` | The Terrain Editor's view and its WebGL |
| `ui` | Dialogs, menus and pickers any part can use |

The state is in classes with `$state` fields, in `.svelte.ts` files, so it can be tested without a page. `Editor`
(`app/editor.svelte.ts`) makes one of each for the window: `Pages` (which page shows), `Objects` (the trees, the object
shown, its edits), `MapSession` (opening, saving, reloading, unsaved edits, closing), `ObjectActions` (new, copy, delete,
reset, rename), `History`, `Notices`, `Startup`, `Appearance` and the `CommandQueue`. `App.svelte` puts it in the context
and lays out the window. The components under it that belong to the app ask with `getEditor()`; the small ones (a field's
row, the tree) take props and know nothing of it. What a key means where it was pressed is the plain function `answerKey`
in `app/windowKeys.ts`, and `Editor.onkeydown` carries it out.

`actionList` in `app/keymap.ts` is the one list of commands: the settings' Hotkeys tab shows it, and the command palette
(`app/CommandPalette.svelte`) lists what `Editor.commands` keeps of it. A command runs the way its key does, so a new one
is an entry in `actionList`, its place in `answerKey` and its case in `Editor`: `#windowCommands` when it has no key out
of the box, and `#canRun` when it can only run in some places.

The filter bar over an object's fields is `objects/FilterBar.svelte`. What it narrows by now is in `Objects`, with the
categories hidden kept per kind, as each kind has its own; `Details` applies them to what `groupFields` gives. The
favourites are in `objects/fieldFilters.svelte.ts`, per kind and in `state.json`, so they are this PC's and the
same in every map. A field is a favourite by its id, so one only some abilities have counts wherever that field exists.
A total of dice is one favourite, by its base. `Details` puts the favourites in a category of their own at the top, and
shows each disabled where it usually is; hiding that category puts them back.

An `$effect` here is for following something outside the state classes: the theme onto the page, the title onto the window,
a pick asked of the map, a setting turned off. What the classes do to each other they do by calling each other.

The look is in `app.css`. The interface has one size, the body's, so most text has no size class; the others are
`text-title`, `text-small` and `text-mono`. There is one corner, `rounded-ui`. The colours are the theme's keys
(`bg-gutter`, `bg-field`, `bg-selection`, `bg-button`, `border-line`), each a CSS variable `themes.ts` sets, so a new
theme needs no CSS. A light theme sets `data-scheme="light"` on the page, and what cannot follow by itself goes under
`:root[data-scheme="light"]`. The game's
tooltips and the map stay as the game draws them, whatever the theme. The header bar's shading is `.toolbar` and
`.tool-button`, the only shading there is. A dropdown's button and list are one shape, `.dropdown`
and `.dropdown-list`: use `ui/Select.svelte` for one choice, or `ui/Popover.svelte`'s `dropdown` for anything else. The trigger canvas stays out of all of it: its files
(`TriggerCanvas`, `TriggerCard`, `FunctionCard`, `ScriptBox`, `cards.ts`) keep their own classes, and `.canvas-look` gives
it its font.

## Interface text

Every text the page writes itself (buttons, tooltips, headings, dialogs, notices, errors) is in
`web/src/text/strings.json`, one key per text, named for where it shows (`titleBar.back`, `settings.tab.hotkeys`).
Change the text after the colon and keep each `{name}`, which the page fills in; a count has two keys, `.one` for 1
and `.other` for any other. Rebuild with `npm run build` (in `web`). The code reads them with `t(key)` from
`web/src/lib/text.ts`, and `npm test` checks that each call fills the placeholders its text has.

## The bridge's types

The page's types for everything that crosses the bridge are made from the C# types, never written by hand:
`web/src/lib/bridge.gen.ts` has every answer, argument and event payload, the command list (`Commands` for `call`,
`Tells` for `tell`), the events (`Events` for `on`) and `ErrorCode`. `tools/MoonwellEditor.BridgeTypes` writes it: it
asks the bridge's own serializer (`BridgeJson`) what each type looks like when written, so the names, the nulls and the
enums' text are what the app sends, and it copies the C# docs.

```
cd web && npm run types
```

`npm run build` and `npm run check` run it first, so they need the .NET SDK, and it builds the App's Debug output (it
fails while a Debug build of the editor is running). The file is committed; a test in
`tests/MoonwellEditor.BridgeTypes.Tests` fails when it is out of date.

A command is one entry in `Commands.Table` (`Commands.cs`, `Commands.Triggers.cs`, `Commands.Terminals.cs`,
`Commands.Home.cs`): its name, a record its arguments are read into (`CommandArgs.cs`, `TriggerArgs.cs`) and what it
answers. Arguments are read strictly (`BridgeJson.Arguments`): one with no default must be there, `null` only where the
record takes it, numbers as numbers and enums as their exact text; anything else is a `badRequest`. An event is one entry
in `BridgeEvents`. A kind the page compares is a C# enum with `CamelCaseEnum<T>`, so the page gets its values as a union.

## Tests and checks

```
dotnet test
cd web && npm test
cd web && npm run check
```

`dotnet test` runs every test project in the solution. `npm run check` writes the bridge's types, then runs Biome and
svelte-check.

`src/App.*.test.ts` run the whole page in jsdom against `FakeApp` (`src/test/fakeApp.ts`), which stands in for the C# side
of the bridge: it answers commands from a table, keeps what was asked and sends events. jsdom has no layout, WebGL or
Monaco, so the map view, the grid's pan and zoom, and what Monaco draws show only in the real window.
