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

The Trigger Editor button shows the map's triggers (design: wc3-cs `docs/plans/2026-10-31-trigger-editor-design.md`).
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

A category shows as a grid of cards (`TriggerCanvas.svelte`), which pans and zooms with a CSS transform. A trigger is the
outer card (`TriggerCard.svelte`) and its events, conditions and actions are cards inside it (`FunctionCard.svelte`), with
World Editor's sentence and a chip for each parameter. A card's place and fold are in `war3map.triggerlayout.json` in the
map, read and written by `TriggerDocument.Layout.cs` and named in `war3map.imp`, as World Editor's save drops a file no
import names (it shows in its Import Manager). The first save of a layout adds that entry. A card with no place stands
in columns (`canvas.ts`), counted when the category first shows; moving one card keeps the places of all of them, so
nothing else jumps. There is one selection, as in the object editor, and `zone` says where the user is, the side panel
or the grid: the selection shows strong there and faintly on the other side, and F2 and Delete act there (`actedOn`). An
edit to a function asks again for that card only, the rest for the whole grid. On the largest
category of the install's maps (1520 functions) it pans at a median of 6 ms a frame, with every card drawn.

A script shows in `ScriptBox.svelte`, a CodeMirror 6 editor. Lua and C# are CodeMirror's own modes, and JASS is a stream
parser in `jass.ts`, as CodeMirror has none. `scriptLanguages.ts` holds the languages and the colours. The map's language
comes with the tree (`Session.TriggerLanguage`), from the script language chosen in World Editor, so a map is JASS or Lua
and never both. Nothing picks C# yet, as no script in a map's triggers is in C#. CodeMirror reads the grid's CSS scale, so
a click lands on the right character at every zoom, and it draws only the lines in view: 150 scripts of 300 lines open in
1.3 s, where textareas took 2.2 s. The caret and the selection stay the browser's.

The code themes (`codeThemes.ts`) are VS Code's own theme files, from Shiki's `tm-themes` package, whose `NOTICE` has
each one's licence; Aurora X is left out for its GPL. Monaco reads a file as it is. A script box reads one colour per
kind of word from it, as VS Code would pick it for that scope, into the `--code-*` tokens in `app.css`. Settings has a
code theme of its own, which follows the interface's theme until one is chosen (`prefs.codeTheme`).

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

An `$effect` here is for following something outside the state classes: the theme onto the page, the title onto the window,
a pick asked of the map, a setting turned off. What the classes do to each other they do by calling each other.

The look is in `app.css`. The interface has one size, the body's, so most text has no size class; the others are
`text-title`, `text-small` and `text-mono`. There is one corner, `rounded-ui`. `bg-gutter`, `bg-field`, `bg-select`,
`bg-primary` and `border-hairline` are worked out from each theme's colours, so a new theme gets them. The header bar's
shading is `.toolbar` and `.tool-button`, the only shading there is. A dropdown's button and list are one shape, `.dropdown`
and `.dropdown-list`: use `ui/Select.svelte` for one choice, or `ui/Popover.svelte`'s `dropdown` for anything else. The trigger canvas stays out of all of it: its files
(`TriggerCanvas`, `TriggerCard`, `FunctionCard`, `ScriptBox`, `cards.ts`) keep their own classes, and `.canvas-look` gives
it its font.

## Interface text

Every text the page writes itself (buttons, tooltips, headings, dialogs, notices, errors) is in
`web/src/text/strings.json`, one key per text, named for where it shows (`titleBar.back`, `settings.tab.hotkeys`).
Change the text after the colon and keep each `{name}`, which the page fills in; a count has two keys, `.one` for 1
and `.other` for any other. Rebuild with `npm run build` (in `web`). The code reads them with `t(key)` from
`web/src/lib/text.ts`, and `npm test` checks that each call fills the placeholders its text has.

## Tests and checks

```
dotnet test
cd web && npm test
cd web && npm run check
```

`dotnet test` runs every test project in the solution. `npm run check` is Biome plus svelte-check.

`src/App.*.test.ts` run the whole page in jsdom against `FakeApp` (`src/test/fakeApp.ts`), which stands in for the C# side
of the bridge: it answers commands from a table, keeps what was asked and sends events. jsdom has no layout, WebGL or
Monaco, so the map view, the grid's pan and zoom, and what Monaco draws show only in the real window.
