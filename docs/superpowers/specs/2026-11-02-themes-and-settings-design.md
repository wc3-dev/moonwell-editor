# Editor themes and the .moonwell folder: design

Step 1 of the themes redesign: the format of the editor's own theme files, and where settings and themes live.

Status: **approved by Sven, 2026-11-02.** Sven's decisions are marked **Sven, 2026-11-02**. The agent's calls are listed
together at the end ("Calls to check") so they can be read and corrected in one place.

## Why

Since 2026-11-01 one list of 64 VS Code themes drives the whole editor: `themeColors.ts` works out the interface's
colours from each VS Code file, and the terminal's from the same file. The editor goes back to themes of its own for
the interface, and VS Code themes for code only (Sven, 2026-11-02). *(The agent's guess at the reason, not denied by
Sven: colours worked out from a VS Code file never look as good as a palette tuned by hand.)*

Map makers can write their own editor themes too (Sven, 2026-11-02), so the theme file is a public format. Settings
live today in two places nobody can open: the page's browser storage inside WebView2's folder, and a C# `settings.json`
in `%LOCALAPPDATA%\MoonwellEditor`. They move with the themes to one folder in the user's home (Sven, 2026-11-02).

## Goals

1. An editor theme is one hand-editable file that sets the interface's colours and the terminal's.
2. A map maker can make a theme from a copy of another, change it in Rider or VS Code with suggestions, and see it in
   the editor when they save.
3. Settings, hotkeys and themes are files in `C:\Users\<name>\.moonwell\`, which can be copied to another PC or kept in
   git.
4. Theme files, `settings.json` and `hotkeys.json` are documented formats that stay stable: a file written today
   still works after updates.
5. Nobody loses a setting in the move.

## Non-goals

- **Tuning the shipped themes by hand.** They start as today's look (see "Shipped themes"); tuning them is later work.
- **Fonts, corners and sizes in a theme.** The look (H Matte docks with D's header) is fixed; a theme sets colours.
- **Per-map settings.** A `.moonwell` folder in a map's folder (like VS Code's workspace settings) can come later on
  top of this without breaking anything (Sven chose the home folder only, 2026-11-02).
- **A theme editor inside the app.** Themes are edited as files.

## Anti-goals

- A broken or half-written theme file stops the editor from starting, or blanks the page.
- A change in Settings drops the comments or the order a person wrote in `settings.json`.
- An update renames a key and silently breaks someone's theme or settings.
- The page shows the default theme for a moment before the chosen one.

## The .moonwell folder

In the user's home folder, `C:\Users\<name>\.moonwell\` (Sven, 2026-11-02):

```
.moonwell\
  settings.json   what the Settings dialog shows, the theme, the code theme, the Warcraft III folder
  hotkeys.json    only the hotkeys that differ from the defaults
  state.json      what the editor remembers on its own: recent maps, panel sizes, table columns, favourites,
                  the tooltip editor's own colours
  themes\         the user's own themes
  schemas\        the JSON schemas for the files above, written by the editor
```

- `settings.json` and `hotkeys.json` are hand-editable, like VS Code's (Sven, 2026-11-02): documented, with a schema.
  Saving either applies the change at once. A change made in the editor keeps the file's comments and order.
- `state.json` is the editor's own. It is not documented and may change between versions.
- The folder already exists on Sven's PC, holding a `config.toml` from 2026-10-09 (`[launch] gameExecutable`) that
  nothing in the repositories reads. The editor leaves it alone and doesn't read it.
- The game-data cache (`gamedata\`) and WebView2's own data stay in `%LOCALAPPDATA%\MoonwellEditor`: large, rebuilt by
  the app, and nothing a person opens.
- `MOONWELL_EDITOR_HOME` names another folder to use instead of `.moonwell`. Test editors set it to a scratch folder,
  as they set `WEBVIEW2_USER_DATA_FOLDER` today, so they never change Sven's files (which his open editor would pick up
  at once) and never run the move from today's storage in his place. `docs/dev.md` and the test steps say so.

## The theme file

One JSON file per theme (Sven, 2026-11-02). Comments and trailing commas are allowed, as VS Code reads its own theme
files. The file's name without `.json` is the theme's id: `kanagawa-dragon.json` is `kanagawa-dragon`.

```jsonc
{
  "$schema": "../schemas/theme.schema.json",
  "name": "Kanagawa Dragon",
  "type": "dark",
  "colors": {
    // The four that every theme sets.
    "background.base": "#0d0c0c",
    "background.panel": "#181616",
    "text.normal": "#c5c9c5",
    "accent.normal": "#8ba4b0",
    // Any of the rest; what is left out is worked out.
    "text.muted": "#a6a9a6",
    "kind.unit": "#8ba4b0",
    "terminal.red": "#c4746e"
  }
}
```

### Top level

| Key | Required | What it is |
|-----|----------|------------|
| `$schema` | no | Where the schema is, for suggestions in Rider and VS Code. The editor ignores it. |
| `name` | yes | The name Settings shows. |
| `type` | yes | `"dark"` or `"light"`. Sets the header's shading, the scroll bars and number boxes, the defaults for colours left out, and the code theme used when none is chosen. |
| `colors` | yes | The colours, below. |

There is no code theme in a theme file: scripts' theme is its own setting (Sven, 2026-11-02, "No pairing").

### Colours

Dotted names that say what each colour is for, grouped (Sven, 2026-11-02). Four are required; every other one is
worked out from those when left out (Sven, 2026-11-02). "Today" is the name in `app.css` before the rename. The exact
names are the agent's call (see "Calls to check").

**Backgrounds**

| Key | Colours | Today | Left out |
|-----|---------|-------|----------|
| `background.base` | **Required.** The theme's deepest background: the trigger cards' bodies, text on the accent colour. The gaps and fields are worked out from it. | `bg` | — |
| `background.panel` | **Required.** The panels, the window's frame. | `surface` | — |
| `background.gutter` | The gaps between panels, the title bar, the status bar. | `gutter` | base, 22% toward black (light: 7%) |
| `background.raised` | Rows, headers, cards and buttons inside a panel; the trigger canvas. | `raised` | panel, 9% toward `text.normal` |
| `background.hover` | Under the pointer. | `hover` | `background.raised` |
| `background.field` | Text boxes, dropdowns, checkboxes. | `field` | base, 30% toward black (light: 3%) |
| `background.selection` | The selected row or item. | `select` | accent 32% into panel, lightness at most 0.44 (light: 28%, at least 0.84) |
| `background.button` | A dialog's main button. | `primary` | accent 40% into raised, lightness at most 0.44 (light: 34%, at least 0.8) |

**Lines**

| Key | Colours | Today | Left out |
|-----|---------|-------|----------|
| `border.normal` | Edges of panels, boxes and menus; the window's frame. | `border` | panel, 18% toward `text.normal` |
| `border.faint` | Thin lines between rows in grids. | `hairline` | `border.normal` at 70% |

**Text**, from brightest to faintest

| Key | Colours | Today | Left out |
|-----|---------|-------|----------|
| `text.normal` | **Required.** Names, values, most text; text under the pointer. | `fg` | — |
| `text.soft` | The page's default: labels, descriptions, running text. | `text` | `text.normal`, 10% toward panel |
| `text.muted` | Secondary text; the edge of a box under the pointer. | `muted` | `text.normal`, 18% toward panel |
| `text.faint` | Hints, placeholders, what is turned off. | `faint` | `text.normal`, 55% toward panel |

**Accent**

| Key | Colours | Today | Left out |
|-----|---------|-------|----------|
| `accent.normal` | **Required.** Focus rings, the edge of the focused or hovered box. | `accent` | — |
| `accent.text` | Accent text: the selected label, links, notices. | `accent-hi` | `accent.normal` |
| `accent.background` | The tint behind active chips and picked items. | `accent-lo` | panel, 18% toward accent |

**States**

| Key | Colours | Today | Left out |
|-----|---------|-------|----------|
| `state.changed` | Values changed from the game's. | `changed` | VS Code's warning yellow (`#cca700`, light `#bf8803`) |
| `state.warning` | Errors, warnings, the delete buttons. | `warn` | VS Code's error red (`#f14c4c`, light `#e51400`) |
| `state.warningBackground` | Rows and buttons in a warning state. | `warn-lo` | panel, 18% toward `state.warning` |

**Kinds of object**: `kind.unit`, `kind.item`, `kind.destructable`, `kind.doodad`, `kind.ability`, `kind.buff`,
`kind.upgrade`, for each kind's icon and name (today `kind-*`). Left out: VS Code's default terminal colours, as today's
mapping uses them (blue, orange between red and yellow, green, yellow, cyan, magenta, red).

**Terminal**

| Key | Left out |
|-----|----------|
| `terminal.background` | `background.panel` |
| `terminal.foreground` | `text.normal` |
| `terminal.cursor` | `text.normal` |
| `terminal.selection` | `background.selection` |
| `terminal.black`, `terminal.red`, `terminal.green`, `terminal.yellow`, `terminal.blue`, `terminal.magenta`, `terminal.cyan`, `terminal.white` | base, `state.warning`, `kind.destructable`, `state.changed`, `kind.unit`, `kind.buff`, `kind.ability`, `text.soft` |
| `terminal.brightBlack` … `terminal.brightWhite` (the same eight) | `text.faint` for bright black, `text.normal` for bright white; the others their normal colour 20% toward `text.normal` |

The terminal's colours come from the editor theme, not the code theme (Sven, 2026-11-02).

A colour the theme sets is used as written. A colour that is worked out is then made readable on the panel the way
`themeColors.ts` does today (`readable`, by the WCAG contrast measure): 4.5 for `text.soft`, 3 for `text.muted`, the
accent, states, kinds and terminal colours, 2 for `text.faint`.

The percentages above are today's, from `app.css` and `themeColors.ts`, so a theme that sets only the four required
colours looks as an old palette did where it can.

`cyan` and `purple` go: nothing in the page uses them.

### Colour values

Hex: `#rgb`, `#rrggbb` or `#rrggbbaa`. A see-through colour is laid over the panel colour (over `background.base` for
the panel itself) and used solid, as `themeColors.ts` does with VS Code's colours today.

### Checking a theme

- A file that can't be read as JSON, has no `name` or `type`, or is missing a required colour is left out of the theme
  list. Settings shows the file and the reason.
- A colour that isn't a hex colour, or a key the editor doesn't know, is a warning: that key is ignored (worked out
  instead), and the rest of the theme loads. Settings shows the warnings for the theme.
- A problem never stops the editor from starting. If the chosen theme can't be loaded, the editor uses the default
  theme and says why.

### Stability

- Keys are never renamed or removed. If one has to go, the editor keeps reading it.
- A colour added later is worked out in older files, so they keep working.
- Unknown keys are warnings, not errors, so a file written for a newer editor still loads in an older one.

### Shipped themes

Every VS Code theme the editor has has an editor theme equivalent (Sven, 2026-11-02): 64 editor themes, 43 dark and
21 light, with the same ids and names as the code themes (`kanagawa-dragon`, `gruvbox-dark-medium`, `one-dark-pro`).
Kanagawa Dragon stays the default.

- They are made once from today's mapping (`interfaceColors` and `terminalColors` in `themeColors.ts`), so each looks
  as the interface does today with that theme. *(Agent's call.)*
- Each file writes every colour, so a later hand-tuning changes values rather than adding keys. *(Agent's call.)*
- Each file starts with a comment naming the VS Code theme it was made from. *(Agent's call.)*
- The mapping moves out of the app into a script in the repository, which writes an editor theme for a code theme that
  has none and never overwrites a file that exists. So a code theme added later can get its twin, and the shipped
  files can be tuned by hand without being undone. *(Agent's call.)*
- Since every saved theme id has an equivalent, the move from today carries everyone's theme over as it is.

### Where themes come from

- **Shipped themes** are files in this format inside the app, so the format gets real use from day one.
- **The user's themes** are the `.json` files in `.moonwell\themes\`. A user theme with the same id as a shipped one
  is shown in its place, and Settings says so.
- **Settings** gets two buttons: "Open themes folder", and "Copy as new theme", which writes the current theme into
  `themes\` with every colour filled in (worked-out ones too), so the copy shows every key there is, and opens the file.
- **Saving a theme file** reloads it: if it is the theme in use, the page changes at once. A file with a mistake keeps
  the last version that loaded while the mistake is shown.

### What the theme doesn't reach

- Tooltip previews and the map view stay dark, as they copy the game.
- The trigger canvas's colours follow the theme through the same names; its shapes, corners and fonts stay (Sven,
  2026-11-01).
- Scripts (the Script Editor and the script boxes on trigger cards) follow the code theme.

## The code theme

- Scripts' theme is chosen on its own in Settings from the 64 VS Code themes (Sven, 2026-11-02). "Same as the theme"
  goes.
- When none is chosen, scripts use Dark Plus, or Light Plus when the editor theme's `type` is light.
- The script boxes on trigger cards keep reading their colours from the code theme, as today (`codeColors`).

## settings.json

Flat, with dotted keys grouped by area, as VS Code's. Only what differs from the default is written; the schema lists
every key with its default. *(The names are the agent's call.)*

| Key | What it is | Values | Default | Today |
|-----|------------|--------|---------|-------|
| `appearance.theme` | The editor theme. | a theme id | the default theme | `moonwell-editor.theme` |
| `appearance.codeTheme` | Scripts' theme. | a VS Code theme id | Dark Plus or Light Plus, by the theme's type | `prefs.codeTheme` |
| `appearance.uiScale` | The UI scale, in percent. | `80`, `100`, `120` | `100` | `prefs.uiScale` |
| `game.folder` | The Warcraft III install's folder. | a path, or `null` for the install found | `null` | C# `gameFolder` |
| `game.graphicsMode` | Classic, Reforged or Definitive Edition. | `"sd"`, `"hd"`, `"de"` | `"de"` | `moonwell-editor.graphics` |
| `objects.teamColor` | The team colour models are shown in. | a player colour's name: `"red"`, `"blue"` … `"peanut"` | `"red"` | `prefs.teamColor` (an index) |
| `objects.showHidden` | List the objects World Editor doesn't show. | `true`, `false` | `false` | `prefs.showHidden` |
| `editor.confirm` | Ask before reloading, deleting or dropping unsaved changes. | `true`, `false` | `true` | `prefs.confirm` |
| `editor.alphaNotice` | Show the alpha notice at start. | `true`, `false` | `true` | `prefs.alphaNotice` |
| `editor.experimental` | Turn on the experimental features. | `true`, `false` | `false` | `prefs.experimental` |
| `terminal.shell` | The shell a new terminal runs. | a shell's id | the first found | `prefs.terminalShell` |

A value the editor can't use is a warning in Settings, and the default is used. Unknown keys are kept as they are.

## hotkeys.json

Only the commands whose keys differ from the defaults, by the command's id, with its keys as Settings' Hotkeys tab
writes them: `Ctrl+Shift+N`, `F2`, `Alt+ArrowLeft`. An empty list takes a command's default key away.

```jsonc
{
  "$schema": "./schemas/hotkeys.schema.json",
  "save": ["Ctrl+S"],
  "kindUnit": ["Alt+1"],
  "clearFilters": []
}
```

The ids are today's action names in `keymap.ts`; they become part of the format and are documented.

## state.json

The editor's own: the recent maps (from the C# `settings.json`), the terminal panel's height, the table columns per
kind, the favourites per kind, the tooltip editor's own colours, and the colours of the theme shown last, which the next
start paints in before the page's own script runs (Sven, 2026-11-03: "Fix it first"). One file, written whenever one of
them changes.

## Moving from today

Once, on the first start that finds no `.moonwell\settings.json`:

- Read the page's storage (`moonwell-editor.prefs`, `.theme`, `.graphics`, `.hotkeys`, `.field-filters`,
  `.tooltip-colours`, `objectEditor.columns.*`) and the C# `%LOCALAPPDATA%\MoonwellEditor\settings.json`, and write the
  new files.
- The saved theme was a VS Code theme's id, and it is written to `appearance.theme` as it is. While no theme has that
  id, the default theme is used and Settings says so, as for any value the editor can't use; once one ships (or the
  user adds a file with that id), it comes back. So the move never loses a choice.
- A saved code theme of `""` ("Same as the theme") becomes the VS Code theme that was the interface's theme, so scripts
  look as they did. Any other saved code theme is kept.
- The old storage is left as it is, and no longer read.

## Left to the builder

- **Who reads and writes the files.** The page can't touch the disk, so the C# side owns `.moonwell`: it reads the
  files, watches the folder, writes what the page changes, and tells the page what changed. The bridge answers one
  request at a time (`_oneAtATime` in `MainForm`), so reading must be quick.
- **No flash at start.** The chosen theme's colours reach the page before its first paint, as `applyTheme` in the
  `Appearance` constructor manages today from the page's storage.
- **Keeping comments.** How an edit made in the editor keeps `settings.json`'s and `hotkeys.json`'s comments and
  order (for example Microsoft's `jsonc-parser`, which VS Code uses, in the page). A new package is the builder's call
  but is named in the pull request.
- **The rename in code.** CSS variables take the theme's names (`--background-panel`, `--text-muted`). The UnoCSS
  class names may be shorter (`bg-panel`) where they stay clear.
- **The schemas.** Written by the editor to `.moonwell\schemas\` at every start, so they match the installed version.
  Kept in the repository too, with a test that the theme schema lists every colour and `settings.json`'s every key.
- **The reference docs** for map makers: `docs/themes.md` and `docs/settings.md` in the editor's repository, with
  every key, its default and an example.
- **Fixed colours in components.** The 25 or so fixed colours outside the tooltip previews (the checkbox's tick, the
  dropdown's arrow and the like) move to theme colours where they are the interface's. The canvas's stay.
- **Tests first** where they make sense: a theme with only the four required colours gives every colour; each warning
  and each refusal above; every shipped theme loads with no warnings; settings written by the editor keep comments;
  the move from today's storage.

## Calls to check

Made by the agent, not asked:

1. The exact colour names in the tables above, and `settings.json`'s names.
2. `background.base` (today's `bg`) is required; `background.gutter` (the gaps) is worked out from it.
3. A theme sets colours only; the header's shading strength follows `type`, as it does now.
4. Themes and settings live on the PC, not in a map.
5. `.moonwell\themes\` for the user's themes; the editor writes `.moonwell\schemas\` at every start.
6. The game-data cache and WebView2's data stay in `%LOCALAPPDATA%\MoonwellEditor`.
7. `config.toml` in `.moonwell` is left alone.
8. Settings are split into `settings.json` and `hotkeys.json` (documented) and `state.json` (not).
9. Only what differs from the default is written to `settings.json` and `hotkeys.json`.
10. The team colour is written as its name, not its index.
11. A user theme with a shipped theme's id replaces it in the list.
12. "Copy as new theme" writes every colour, worked-out ones included.
13. No `extends` (building one theme on another). It can be added later without breaking files.
14. Hex colours only, see-through ones laid over the panel.
15. A colour a theme sets is used as written; only worked-out colours are made readable.
16. The old storage is left in place after the move.
17. The move writes the saved theme's id as it is, even when no theme has it yet; the default is used until one does.
18. `MOONWELL_EDITOR_HOME` moves the `.moonwell` folder, for test editors.
19. The 64 shipped themes are made from today's mapping, with every colour written and a comment naming their source.
20. The mapping becomes a script in the repository that never overwrites an existing theme file.
21. `kind.item`, when left out, is the readable mix of the final `kind.upgrade` and `kind.doodad`.
22. A see-through `background.base` lies over black in a dark theme and white in a light one.
23. Later copies are named `<name> (copy 2)` and on, so two copies never share a name in the picker.
24. The boot names the files that exist but could not be read (`unreadable`); a listed `settings.json` or `hotkeys.json`
    is not written to until it can be read.
25. The editor edits `settings.json` and `hotkeys.json` with its own routines, which keep comments, order and
    indentation; `jsonc-parser` is used only for reading.
26. A saved code theme of "" (or prefs with no code theme) becomes the old interface theme's VS Code twin, the default
    Kanagawa Dragon when none was saved.
27. The move marks itself done only after every file is written.
28. The class colour names are `deep` (`background.base`), `panel`, `line` (`border.normal`), and `normal` and `soft`
    (text colours).
29. A `settings.json` that exists but can't be read leaves the Warcraft III folder to the install found, never the legacy
    file.
30. A worked-out terminal colour is made readable on `terminal.background`, not on the panel.
31. The window also starts in the last theme's colours (its background before the page loads, the title bar and the
    frame), not only the page.
