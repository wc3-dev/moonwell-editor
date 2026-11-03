# Settings

What Settings in the Moonwell Editor shows is kept in a file you can open and edit: `settings.json`, in the editor's
`.moonwell` folder, and the hotkeys are kept in `hotkeys.json` beside it. This page is the reference for both files.
They keep their keys and meanings between versions, so one written today still works after an update.

## The .moonwell folder

In your home folder, `C:\Users\<name>\.moonwell\`:

```
.moonwell\
  settings.json   what Settings shows, the theme, the code theme, the Warcraft III folder (this page)
  hotkeys.json    only the hotkeys that differ from the defaults (this page, further down)
  state.json      what the editor remembers on its own: recent maps, panel sizes, table columns, favourites,
                  the tooltip editor's own colours
  themes\         your own themes
  schemas\        the JSON schemas for the files above, written by the editor at every start
```

`settings.json` and `hotkeys.json` are for you to edit. `state.json` is the editor's own and may change between
versions; leave it alone. The folder can be copied to another PC or kept in git. `MOONWELL_EDITOR_HOME` names another
folder to use instead (for testing).

In the editor, **Settings** shows the same values. Both ways change the same file:

- A change made in Settings is edited into `settings.json`. Your comments (also the one after a value), the order of
  the keys, your indentation and your line ends stay as they are. Only a value that differs from the default is
  written: a setting put back to its default is removed from the file, and the `//` comment after it on its line goes
  with it (the comments above it stay).
- A change you save in the file reaches the editor at once, with no restart.

## The file

`settings.json` is JSON with comments and trailing commas allowed, as VS Code reads its own settings. The keys are flat
and dotted, grouped by area, as VS Code's are. A file the editor makes starts with a `$schema` line, which gives Rider
and VS Code suggestions and checks for every key below; keep it.

```jsonc
{
  "$schema": "./schemas/settings.schema.json",

  // A bigger interface for the laptop.
  "appearance.uiScale": 120,
  "appearance.theme": "nord",
  "appearance.codeTheme": "monokai",

  "game.folder": "D:/Games/Warcraft III",
  "objects.teamColor": "teal",
}
```

## Keys

| Key | What it is | Values | Default |
|-----|------------|--------|---------|
| `appearance.theme` | The editor theme. | A theme's id: the name of its file without `.json`, in the editor or in `themes\`. | `"kanagawa-dragon"` |
| `appearance.codeTheme` | The theme scripts are drawn in. | One of the VS Code themes, by id (`"dark-plus"`, `"monokai"`, `"one-dark-pro"`), or `null`. | `null`: Dark Plus, or Light Plus when the editor theme is light |
| `appearance.uiScale` | The size of the whole interface, in percent. | `80`, `100`, `120` | `100` |
| `game.folder` | The folder Warcraft III is installed in (the one with `.build.info`). | A path, or `null`. | `null`: the install the editor finds |
| `game.graphicsMode` | Which graphics the icons and models are shown in. | `"sd"` (Classic), `"hd"` (Reforged), `"de"` (Definitive Edition) | `"de"` |
| `objects.teamColor` | The team colour models are shown in. | A player colour's name, in player order: `"red"`, `"blue"`, `"teal"`, `"purple"`, `"yellow"`, `"orange"`, `"green"`, `"pink"`, `"gray"`, `"lightBlue"`, `"darkGreen"`, `"brown"`, `"maroon"`, `"navy"`, `"turquoise"`, `"violet"`, `"wheat"`, `"peach"`, `"mint"`, `"lavender"`, `"coal"`, `"snow"`, `"emerald"`, `"peanut"` | `"red"` |
| `objects.showHidden` | List the objects World Editor does not show. | `true`, `false` | `false` |
| `editor.confirm` | Ask before reloading the map, deleting an object or dropping unsaved changes. When `false` nothing is asked and unsaved changes are lost. | `true`, `false` | `true` |
| `editor.alphaNotice` | Show the alpha notice when the editor starts. | `true`, `false` | `true` |
| `editor.experimental` | Turn on the experimental features. | `true`, `false` | `false` |
| `editor.reopenLastMap` | Open the last map again when the editor starts, if it is still there. | `true`, `false` | `false` |
| `terminal.shell` | The shell a new terminal runs. | A shell's id (`"pwsh"`, `"bash"`, `"cmd"`), or `null`. | `null`: the first one found |

`game.folder` is written by the editor when you choose a folder in Settings and the game data in it has loaded. You can
also write it yourself: the editor loads that folder at once when it differs from the one in use.

## When something is wrong

The editor never stops starting over this file.

- **A value it can't use** (`"appearance.uiScale": 90`, a team colour that is not a colour's name, a `true` in quotes)
  is ignored, and the default is used. Settings shows a line saying which key and on which line of the file.
- **An unknown key** is kept as it is and gives no warning, so a file written for a newer editor still loads in an
  older one.
- **A file that can't be read as JSON** (a missing comma, a half-saved edit) keeps the settings the editor already
  has. Settings shows the line of the first mistake, and the editor writes nothing to the file until it is fixed, so
  your edit is never written over. Save a fixed file and the editor reads it again.
- **A file the editor could not open at start** (another program holds it) is treated the same way: the defaults are
  used, nothing is written to it, and Settings says so until a save of the file brings its text.
- **A file with nothing in it** (empty, or only comments) is no settings: every default.
- **A file that is not there** is every default. The first change you make in Settings creates it.
- **A theme id with no theme** (a theme file you removed, or a VS Code theme's id from before the editor had its own
  themes) shows the default theme. The id stays in the file, and the theme comes back when a theme with that id does.
- **A change the editor can't save** (the disk is full, the folder is locked) is kept for the session, and Settings says
  that it was not saved.

## hotkeys.json

The Hotkeys tab of Settings is kept in `hotkeys.json`, in the same folder. It holds only the commands whose keys differ
from the defaults, by the command's id, each with its list of keys. It is JSON with comments and trailing commas
allowed, like `settings.json`, and a file the editor makes starts with a `$schema` line that gives Rider and VS Code
suggestions for every id below; keep it.

```jsonc
{
  "$schema": "./schemas/hotkeys.schema.json",

  // Save with F5 instead.
  "save": ["F5"],
  "kindUnit": ["Alt+1"],

  // No key for Undo.
  "undo": [],
}
```

It is edited the same two ways as `settings.json`. A key set in the Hotkeys tab is edited into the file, and your
comments, the order of the commands, your indentation and your line ends stay as they are. A command put back to its
default keys (its Back button, or **Reset every hotkey**) is taken out of the file, with the `//` comment after it on
its line. A change you save in the file reaches the editor at once.

### The keys

A command's value is a list of keys, and the list replaces the command's default keys: `"redo": ["Ctrl+Y"]` leaves
redo with only that one. **An empty list, `[]`, takes a command's default key away** and gives it none:
`"undo": []` leaves undo with no key.

A key is written as its modifiers and its key joined by `+`: `Ctrl+Shift+N`, `F2`, `Alt+ArrowLeft`, `Delete`. The
modifiers are `Ctrl`, `Alt` and `Shift`, and they come in that order, before the key. A letter is a capital (`Ctrl+S`,
not `Ctrl+s`). Any other key is named as the browser names it: `F1` to `F12`, `Delete`, `Enter`,
`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, or the character itself (`1`, `` ` ``, `Ö`). A key written another way
never matches. The easiest way to get one right is to set it in the Hotkeys tab and look at the file.

When two commands have the same key, the one earlier in the table below runs, and the Hotkeys tab shows the clash.

### The commands

| Id | What it does | Keys out of the box |
|----|--------------|---------------------|
| `save` | Save the map | `Ctrl+S` |
| `undo` | Undo | `Ctrl+Z` |
| `redo` | Redo | `Ctrl+Y`, `Ctrl+Shift+Z` |
| `newObject` | New object based on this one | `Ctrl+Shift+N` |
| `copyObject` | Copy this custom object | `Ctrl+Shift+D` |
| `copy` | Copy (the field selected, else the object) | `Ctrl+C` |
| `paste` | Paste | `Ctrl+V` |
| `rename` | Rename (the name field) | `F2` |
| `deleteObject` | Delete the custom object | `Delete` |
| `filterFields` | Filter the fields | `Ctrl+F` |
| `fieldIds` | Show field ids | `Ctrl+D` |
| `back` | Back | `Alt+ArrowLeft` |
| `forward` | Forward | `Alt+ArrowRight` |
| `settings` | Open the settings | `F10` |
| `commandPalette` | Open the command palette | `Ctrl+Shift+P` |
| `terminal` | Show or hide the terminal | `` Ctrl+` ``, `Ctrl+Ö` |
| `openFolder` | Open a map folder | none |
| `openArchive` | Open a map archive (.w3x, .w3m) | none |
| `reload` | Reload the map from disk | none |
| `about` | About Moonwell Editor | none |
| `showTerrain` | Show the Terrain Editor | none |
| `showTriggers` | Show the Trigger Editor | none |
| `showObjects` | Show the Object Editor | none |
| `showScripts` | Show the Script Editor | none |
| `showDetails` | Show the details view | none |
| `showTable` | Show the table view | none |
| `kindUnit` | Show units | none |
| `kindItem` | Show items | none |
| `kindDestructable` | Show destructibles | none |
| `kindDoodad` | Show doodads | none |
| `kindAbility` | Show abilities | none |
| `kindBuff` | Show buffs/effects | none |
| `kindUpgrade` | Show upgrades | none |
| `changedOnly` | Show changed fields only | none |
| `clearFilters` | Clear the field filters | none |
| `collapseAll` | Collapse all categories | none |
| `expandAll` | Expand all categories | none |

### When something is wrong

As for `settings.json`, the editor never stops starting over this file, and the Hotkeys tab says what is wrong, with
the line.

- **A command that does not exist** (a typo in an id) is skipped, with a warning. Unlike `settings.json`, an unknown id
  is not kept silently: a hotkey that does nothing is a mistake worth showing.
- **A value that is not a list of strings** (`"save": "Ctrl+S"`, a number in the list) is skipped, with a warning, and
  the command keeps its default keys. The editor leaves that line as it is when it saves another command.
- **A file that can't be read as JSON** keeps the hotkeys the editor already has. The Hotkeys tab shows the line of the
  first mistake, and the editor writes nothing to the file until it is fixed, so your edit is never written over. Save
  a fixed file and the editor reads it again.
- **A file the editor could not open at start** (another program holds it) is treated the same way: the default keys are
  used, nothing is written to it, and the Hotkeys tab says so until a save of the file brings its text.
- **A file with nothing in it, or no file** is every default. The first key you set in Settings creates it.
- **A change the editor can't save** (the disk is full, the folder is locked) is kept for the session, and Settings says
  that it was not saved.
