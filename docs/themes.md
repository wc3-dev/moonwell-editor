# Themes

The Moonwell Editor's colours come from a theme. A theme is one file you can open, copy and change, and the editor shows
a change when you save it. This page is the reference for the file. It keeps its keys and meanings between versions, so a
theme written today still works after an update.

A theme sets the colours of the interface and of the terminal panel. It does not set fonts, corners or sizes, and it does
not set the colours of scripts: those have a theme of their own (the **Code theme** in Settings, one of VS Code's
themes).

## Where themes are

The editor comes with 64 themes, one for each code theme, with the same id and name (`kanagawa-dragon`,
`gruvbox-dark-medium`, `one-dark-pro`). Kanagawa Dragon is the default.

Your own themes are the `.json` files in the `themes` folder of the editor's `.moonwell` folder, in your home folder:
`C:\Users\<name>\.moonwell\themes\`. In **Settings**, under the theme, **Open themes folder** opens it (and makes it if it
is not there yet). The files are listed by their id, which is the file's name without `.json`: `my-theme.json` is the
theme `my-theme`, and a file called `Warm Dusk.json` is the theme `Warm Dusk`. The id is what `appearance.theme` in
[`settings.json`](settings.md) holds.

A theme file with the id of one of the editor's own themes (`nord.json`) is used **in its place**, and Settings says so.
Delete the file and the editor's own theme is back.

The easiest way to make a theme is to start from a copy:

- **Copy as new theme**, in Settings, writes the theme shown into the themes folder as `<id>-copy.json` (then
  `<id>-copy-2.json` and on, while the name is taken), named `<name> (copy)` (`<name> (copy 2)` and on, so two copies
  never share a name in the picker), with **every colour written**, the worked-out ones too. It uses the copy at once
  and opens the file in the program your computer opens `.json` files with. Change a colour, save, and the editor shows
  it.
- Every other file is read the same way, so a theme can also be a file you wrote, or got from someone else, dropped in
  the folder.

## The file

A theme is JSON with comments and trailing commas allowed, as VS Code reads its own theme files.

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

A file the editor writes has a `$schema` line, which gives Rider and VS Code suggestions and checks for every key; the
editor writes the schema to `.moonwell\schemas\theme.schema.json` at every start, so it matches the version you have.
Keep the line.

| Key | Required | What it is |
|-----|----------|------------|
| `$schema` | no | Where the schema is, for suggestions in the program you edit in. The editor ignores it. |
| `name` | yes | The name Settings shows. |
| `type` | yes | `"dark"` or `"light"`. Sets the header's shading, the scroll bars and number boxes, the defaults for colours left out, and the code theme used when none is chosen (Dark Plus, or Light Plus for `"light"`). |
| `colors` | yes | The colours, below. |

## Colour values

A colour is hex: `#rgb`, `#rrggbb` or `#rrggbbaa`, in upper or lower case. No other way of writing a colour is read
(`rgb(...)`, names).

A see-through colour (`#rrggbbaa`) is laid over the colour behind it and used solid: over `background.panel` for
everything but the panel; `background.panel` itself over `background.base`; and `background.base` over black in a dark
theme and white in a light one.

## The colours

Dotted names that say what each colour is for. **Four are required: `background.base`, `background.panel`,
`text.normal` and `accent.normal`.** Every other colour is worked out from those when you leave it out, so a theme can
be four lines, and a colour added in a later version is worked out in a file written before it.

A colour you set is used exactly as written. A colour that is worked out is moved toward the normal text until it reads
on the panel (a terminal colour, on `terminal.background`), by the WCAG contrast measure: 4.5 for `text.soft`, 3 for
`text.muted`, `accent.text`, the states, the kinds and the terminal's colours, 2 for `text.faint`.

"X, 22% toward Y" below means 22% of the way from X to Y. Where a light theme works a colour out differently, the light
amount is given in brackets.

### Backgrounds

| Key | Colours | Left out |
|-----|---------|----------|
| `background.base` | **Required.** The theme's deepest background: the trigger cards' bodies, and text on the accent colour. The gaps and fields are worked out from it. | none |
| `background.panel` | **Required.** The panels, and the window's frame. | none |
| `background.gutter` | The gaps between panels, the title bar and the status bar. | `background.base`, 22% toward black (light: 7%) |
| `background.raised` | Rows, headers, cards and buttons inside a panel; the trigger canvas. | `background.panel`, 9% toward `text.normal` |
| `background.hover` | Under the pointer. | `background.raised` |
| `background.field` | Text boxes, dropdowns and checkboxes. | `background.base`, 30% toward black (light: 3%) |
| `background.selection` | The selected row or item. | `accent.normal` 32% into `background.panel`, lightness at most 0.44 (light: 28%, at least 0.84) |
| `background.button` | A dialog's main button. | `accent.normal` 40% into `background.raised`, lightness at most 0.44 (light: 34%, at least 0.8) |

### Lines

| Key | Colours | Left out |
|-----|---------|----------|
| `border.normal` | The edges of panels, boxes and menus; the window's frame. | `background.panel`, 18% toward `text.normal` |
| `border.faint` | Thin lines between rows in grids. | `border.normal` at 70% |

### Text, from brightest to faintest

| Key | Colours | Left out |
|-----|---------|----------|
| `text.normal` | **Required.** Names, values and most text; text under the pointer. | none |
| `text.soft` | The page's default: labels, descriptions and running text. | `text.normal`, 10% toward `background.panel` |
| `text.muted` | Secondary text; the edge of a box under the pointer. | `text.normal`, 18% toward `background.panel` |
| `text.faint` | Hints, placeholders and what is turned off. | `text.normal`, 55% toward `background.panel` |

### Accent

| Key | Colours | Left out |
|-----|---------|----------|
| `accent.normal` | **Required.** Focus rings, and the edge of the focused or hovered box. | none |
| `accent.text` | Accent text: the selected label, links and notices. | `accent.normal` |
| `accent.background` | The tint behind active chips and picked items. | `background.panel`, 18% toward `accent.normal` |

### States

| Key | Colours | Left out |
|-----|---------|----------|
| `state.changed` | Values changed from the game's. | `#cca700` (light: `#bf8803`) |
| `state.warning` | Errors, warnings and the delete buttons. | `#f14c4c` (light: `#e51400`) |
| `state.warningBackground` | Rows and buttons in a warning state. | `background.panel`, 18% toward `state.warning` |

### Kinds of object

The icon and name of each kind of object.

| Key | Left out (dark, light) |
|-----|------------------------|
| `kind.unit` | `#2472c8`, `#0451a5` |
| `kind.item` | `kind.upgrade` and `kind.doodad`, half and half |
| `kind.destructable` | `#0dbc79`, `#00bc00` |
| `kind.doodad` | `#e5e510`, `#949800` |
| `kind.ability` | `#11a8cd`, `#0598bc` |
| `kind.buff` | `#bc3fbc`, `#bc05bc` |
| `kind.upgrade` | `#cd3131`, `#cd3131` |

### Terminal

The terminal panel's colours come from the editor theme, not the code theme. A terminal colour that is worked out is
made readable on `terminal.background`, which is the panel's colour unless the theme sets it.

| Key | Left out |
|-----|----------|
| `terminal.background` | `background.panel` |
| `terminal.foreground` | `text.normal` |
| `terminal.cursor` | `text.normal` |
| `terminal.selection` | `background.selection` |
| `terminal.black` | `background.base` |
| `terminal.red` | `state.warning` |
| `terminal.green` | `kind.destructable` |
| `terminal.yellow` | `state.changed` |
| `terminal.blue` | `kind.unit` |
| `terminal.magenta` | `kind.buff` |
| `terminal.cyan` | `kind.ability` |
| `terminal.white` | `text.soft` |
| `terminal.brightBlack` | `text.faint` |
| `terminal.brightRed`, `terminal.brightGreen`, `terminal.brightYellow`, `terminal.brightBlue`, `terminal.brightMagenta`, `terminal.brightCyan` | the normal colour (`terminal.red` and so on), 20% toward `text.normal` |
| `terminal.brightWhite` | `text.normal` |

### What a theme doesn't reach

- The tooltip previews and the map view stay dark, as they copy the game.
- The trigger canvas's colours follow the theme through the same names; its shapes, corners and fonts stay.
- Scripts (the Script Editor, and the script boxes on trigger cards) follow the code theme.

## Checking a theme

The editor never stops starting over a theme file, and never shows a broken page.

- **A file that can't be used is left out of the theme list.** That is a file that can't be read as JSON, has no `name`,
  has a `type` that is not `"dark"` or `"light"`, or lacks a required colour (or gives it as something that isn't a hex
  colour). Settings lists the file with the reason and the line of the mistake.
- **A key the editor doesn't know, or a colour that isn't a hex colour,** is a warning. That key is ignored (the colour
  is worked out instead) and the rest of the theme loads. Settings lists the warnings under the theme.
- **A file the editor could not open at start** (another program holds it) is listed as unreadable and left out until a
  save of the file brings its text.
- **If the chosen theme can't be loaded** (no theme has the id, or its file is left out) the editor uses the default
  theme, and Settings says why. The id stays in `settings.json`, and the theme comes back when a file with that id loads.

## Saving a theme file

The editor watches the themes folder. When you save a file:

- A new file is added to the theme list, and a changed one is read again. If it is the theme in use, the page changes at
  once.
- **A file with a mistake keeps the last version that loaded.** A half-saved edit, or a typo, doesn't change the page;
  Settings shows the problem until you save a file that loads. A file that never loaded is left out.
- A deleted file leaves the list. If it was the theme in use, the default theme is shown until it is back.

## Staying the same

- Keys are never renamed or removed. If one has to go, the editor keeps reading it.
- A colour added later is worked out in older files, so they keep working.
- A key the editor doesn't know is a warning, not an error, so a file written for a newer editor still loads in an older
  one.
- The 64 themes the editor comes with are in the editor's repository, in `web/src/themes`, one file each.
