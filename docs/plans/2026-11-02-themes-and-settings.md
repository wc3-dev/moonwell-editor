# Editor themes and the .moonwell folder: implementation plan

**Goal:** The editor's interface reads its own theme files (64 shipped, plus the user's), VS Code themes colour only
scripts, and settings, hotkeys, state and themes live as files in `C:\Users\<name>\.moonwell\`.

**Architecture:** The C# side owns the folder: it reads the files, serves them to the page before its first paint as a
script (`https://game.moonwelleditor/home.js`), writes what the page sends, merges `state.json`, and watches the folder.
The page owns the formats: it parses theme files and `settings.json`/`hotkeys.json` (JSON with comments, through
`jsonc-parser`), works out what a theme leaves out, applies the colours as CSS variables, and edits the files' text so
comments survive. A one-off script makes the 64 shipped theme files from today's VS Code mapping.

**Tech Stack:** C# (.NET 10, WinForms, WebView2, System.Text.Json, xunit), Svelte 5, UnoCSS (Wind4), Vitest, Biome,
`jsonc-parser` (new, MIT, Microsoft).

**Spec:** `docs/specs/2026-11-02-themes-and-settings-design.md` (approved by Sven, 2026-11-02). Read it
before any task; its tables of colour keys, settings keys and worked-out rules are not repeated here.

## Global Constraints

- No agent attribution anywhere: no `Co-Authored-By`, no "Generated with", in commits, the pull request or files.
- Never create, edit or delete a `README.md`. Use the GitHub name `mdlsvensson` in anything public.
- Work in the worktree `wc3-dev/moonwell-editor-themes` on branch `themes-redesign`. Commit as roughly as you like.
- New npm packages are pinned to an exact version, as `web/package.json` does: `"jsonc-parser": "3.3.1"`.
- Comments only where the code can't say it, in the surrounding style; decisions are credited as `(Sven, 2026-11-02)`.
- Keys in theme files, `settings.json` and `hotkeys.json` are public: spelled exactly as the spec's tables.
- Every theme file is JSON with comments and trailing commas allowed; a file the editor writes is 2-space indented.
- The trigger canvas keeps its shapes, corners and fonts (`.canvas-look`); tooltip previews and the map view keep
  their fixed game colours.
- After `cd web && npm install` in the worktree (it has no `node_modules`), checks are `cd web && npm test`,
  `cd web && npm run check`, and `dotnet test` from the worktree root.
- `GameDataTests.Cached_load_is_fast` and `Cache_is_used_second_time` were just fixed for flakiness: if one fails,
  report it with its output; never skip it.
- A test editor sets `WEBVIEW2_USER_DATA_FOLDER` and `MOONWELL_EDITOR_HOME` to scratch folders, uses its own free
  debug port, and checks `document.title` before any input. Never build over a running editor.
- At the end of each working turn that changed code, rebuild the exe in the worktree:
  `cd web && npm run build`, `dotnet build src/MoonwellEditor.App -c Release`, then
  `dotnet publish src/MoonwellEditor.App -c Release -r win-x64 --self-contained false`.

## Review Focus

1. **A broken `settings.json` or `hotkeys.json` is never overwritten.** A person mid-edit saves invalid JSON; a change
   in Settings must not write over their text. The editor keeps the last good values, shows the problem, and saves
   nothing to that file until it reads again. Tests in Tasks 5 and 6.
2. **A half-written theme save.** An editor saving in two steps makes the watcher fire on a broken file, then a good
   one. The last good version stays until the good one loads; the editor never falls back to the default in between.
   Test in Task 8.
3. **A file saved by Notepad with a byte order mark** reads like any other. Test in Task 4.
4. **Two editors open at once.** Each reloads what the other writes, and its next change builds on the latest text,
   not on the text it had. Test in Task 5.
5. **`.moonwell` can't be written** (locked, read only, synced by OneDrive). The editor keeps running with the
   changes in memory and says once that they aren't saved. Test in Task 5.

---

### Task 1: Colour maths and the theme format

**Files:**
- Create: `web/src/lib/themes/color.ts`, `web/src/lib/themes/format.ts`, `web/src/lib/themes/fill.ts`,
  `web/src/lib/home/jsonc.ts`, `web/src/lib/home/schemas/theme.schema.json`
- Test: `web/src/lib/themes/color.test.ts`, `web/src/lib/themes/format.test.ts`, `web/src/lib/themes/fill.test.ts`
- Modify: `web/package.json` (add `jsonc-parser` 3.3.1)

**Interfaces:**
- Produces, `color.ts` (moved from `themeColors.ts`, which keeps importing them until Task 3 deletes it):
  `parsed(color: string): { rgb: [number, number, number]; alpha: number }`, `written(rgb): string`,
  `mix(from: string, to: string, amount: number): string`, `flattened(color: string, under: string): string`,
  `contrast(a: string, b: string): number`, `readable(color: string, on: string, toward: string, ratio: number): string`,
  `mixOklab(from: string, to: string, amount: number): string`,
  `clampLightness(color: string, limit: { max?: number; min?: number }): string` (OKLCH lightness, chroma and hue
  kept), `isHexColor(text: string): boolean` (`#rgb`, `#rrggbb`, `#rrggbbaa`).
- Produces, `jsonc.ts`: `type ProblemCode = "notJson" | "noName" | "badType" | "missing" | "badColor" | "unknownKey" | "badValue"`,
  `type Problem = { code: ProblemCode; key?: string; line?: number }`,
  `parseJsonc(text: string): { value: unknown; problems: Problem[] }` (trailing commas allowed; a parse error gives
  one `notJson` with its 1-based line), `lineOfKey(text: string, key: string): number | undefined`.
- Produces, `format.ts`: `colorKeys` (the 47 keys, in the spec's table order: backgrounds, lines, text, accent, states,
  kinds, then terminal as listed), `type ColorKey`, `requiredKeys: readonly ColorKey[]` (`background.base`,
  `background.panel`, `text.normal`, `accent.normal`), `type ThemeType = "dark" | "light"`,
  `type Colors = Record<ColorKey, string>`,
  `type Theme = { id: string; name: string; type: ThemeType; colors: Colors; source: "shipped" | "user"; problems: Problem[] }`,
  `parseTheme(id: string, text: string, source: Theme["source"]): { theme: Theme | null; problems: Problem[] }`,
  `themeText(theme: Pick<Theme, "name" | "type" | "colors">, header?: string): string` (every colour in `colorKeys`
  order, `"$schema": "../schemas/theme.schema.json"`, `header` as a leading `//` comment).
- Produces, `fill.ts`: `fillColors(type: ThemeType, set: Partial<Colors>): Colors`.

- [ ] **Step 1: Add the package.** `cd web && npm install --save-dev --save-exact jsonc-parser@3.3.1`.
- [ ] **Step 2: Write the failing tests.**
  - `color.test.ts`: the cases from `themeColors.test.ts` for `mix`, `contrast`, `readable`, `flattened`;
    `clampLightness("#ffffff", { max: 0.44 })` has OKLCH lightness 0.44 ± 0.005; a colour already under the limit
    comes back unchanged; `isHexColor` accepts `#abc`, `#aabbcc`, `#aabbcc80` and refuses `red`, `#abcd5`, `aabbcc`.
  - `fill.test.ts`:
    - `four required give every colour`: `Object.keys(fillColors("dark", four))` equals `colorKeys`, every value
      matches `/^#[0-9a-f]{6}$/`.
    - one test per derived rule in the spec's tables, written with the `color.ts` functions, for example
      `background.raised` equals `mix(panel, text, 0.09)`, `background.gutter` equals `mix(base, "#000000", 0.22)`
      for dark and `0.07` for light, `background.selection` equals
      `clampLightness(mixOklab(panel, accent, 0.32), { max: 0.44 })` for dark and
      `clampLightness(mixOklab(panel, accent, 0.28), { min: 0.84 })` for light, `border.faint` equals
      `mix(panel, border, 0.7)`.
    - `a colour the theme sets is kept`: a `text.muted` of `#202020` on a `#181818` panel comes back `#202020`.
    - `worked-out colours are readable`: with a dark panel, `contrast(text.soft, panel) >= 4.5`,
      `contrast(text.muted, panel) >= 3`, `contrast(text.faint, panel) >= 2`, each kind and `state.*` `>= 3`.
    - `terminal follows the theme`: `terminal.red` equals `state.warning`, `terminal.blue` equals `kind.unit`,
      `terminal.background` equals `background.panel`, `terminal.brightBlack` equals `text.faint`.
  - `format.test.ts`:
    - only the four required colours → `theme` not null, `problems` empty, `colors` has 47 keys.
    - comments and trailing commas → loads with no problems.
    - a missing required colour → `theme` null, problems contain `{ code: "missing", key: "accent.normal" }`.
    - no `name` → refused with `noName`; `type: "blue"` → refused with `badType`; `"{ oops"` → refused with
      `notJson` and `line` 1.
    - `"text.muted": "grey"` → loads, problem `{ code: "badColor", key: "text.muted", line }`, colour worked out.
    - `"panel.background": "#000"` → loads, problem `unknownKey` with its line.
    - `#rgb` expands; `#rrggbbaa` is flattened over `background.panel` (over `background.base` for the panel itself).
    - `parseTheme(id, themeText(theme), "user")` gives back the same colours.
    - `theme.schema.json` lists exactly `colorKeys` under `colors`, requires `requiredKeys`, and `name`, `type`.
- [ ] **Step 3: Run them to see them fail.** `cd web && npx vitest run src/lib/themes` — FAIL, modules missing.
- [ ] **Step 4: Implement `color.ts`, `jsonc.ts`, `format.ts`, `fill.ts` and the schema.** `fillColors` works in
  dependency order (raised before hover and button, border before border.faint, kinds before terminal) and applies
  `readable` only to the keys the spec names, against `background.panel` (terminal colours against
  `terminal.background`), moving toward `text.normal`. `themeColors.ts` imports the moved helpers from `color.ts`.
- [ ] **Step 5: Run the tests.** `cd web && npm test` — PASS, with the old suites still green.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Add the editor theme format"`

### Task 2: The 64 shipped themes and the script that made them

**Files:**
- Create: `web/src/lib/scopeColor.ts` (`scopeColor` and its `selectors`, moved out of `codeThemes.ts`, which imports
  it back), `web/scripts/vscodeColors.ts`, `web/scripts/make-themes.ts`, `web/src/themes/*.json` (64 files, written by
  the script), `web/src/lib/themes/shipped.ts`
- Test: `web/scripts/vscodeColors.test.ts` (from `web/src/lib/themeColors.test.ts`), `web/scripts/make-themes.test.ts`,
  `web/src/lib/themes/shipped.test.ts`
- Modify: `web/vitest.config.ts` (`include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`), `web/tsconfig.json`
  (add `"scripts"`), `web/package.json` (`"themes": "node scripts/make-themes.ts"`)

**Interfaces:**
- Consumes: `fillColors`, `themeText`, `parseTheme`, `colorKeys` (Task 1).
- Produces, `vscodeColors.ts`: `editorColors(file: VsCodeThemeFile): Partial<Colors>`, today's `interfaceColors` and
  `terminalColors` with their output renamed: `bg`→`background.base`, `surface`→`background.panel`,
  `raised`→`background.raised`, `hover`→`background.hover`, `border`→`border.normal`, `fg`→`text.normal`,
  `text`→`text.soft`, `muted`→`text.muted`, `faint`→`text.faint`, `accent`→`accent.normal`, `accent-hi`→`accent.text`,
  `accent-lo`→`accent.background`, `changed`→`state.changed`, `warn`→`state.warning`,
  `warn-lo`→`state.warningBackground`, `kind-*`→`kind.*`, each terminal colour → `terminal.*`. `cyan` and `purple` are
  dropped; gutter, field, selection, button and `border.faint` are left to `fillColors`, which reproduces `app.css`.
- Produces, `make-themes.ts`: `missingThemes(codeIds: string[], existing: string[]): string[]`,
  `editorThemeText(id: string, vsCodeText: string): string` (header comment
  `Made from the VS Code theme "<displayName>" in tm-themes.`), and when run as a script it writes
  `src/themes/<id>.json` for each code theme in `node_modules/tm-themes/themes` except `aurora-x` that has no file.
- Produces, `shipped.ts`: `shippedThemes: Theme[]` (from `import.meta.glob("/src/themes/*.json", { query: "?raw", import: "default", eager: true })`,
  Kanagawa Dragon first, then dark before light, by name).

- [ ] **Step 1: Write the failing tests.**
  - `vscodeColors.test.ts`: today's `themeColors.test.ts` cases, against the new keys.
  - `make-themes.test.ts`: `missingThemes(["a", "b"], ["a"])` equals `["b"]`; `editorThemeText` of the Kanagawa Dragon
    file starts with its header comment and parses with no problems.
  - `shipped.test.ts`: 64 themes; their ids equal the code themes' ids without `aurora-x`; 43 dark and 21 light;
    every one parses with no problems; `kanagawa-dragon` has today's `app.css` values: `background.base` `#0d0c0c`,
    `background.panel` `#181616`, `background.raised` `#282727`, `background.hover` `#282727`, `border.normal`
    `#373636`, `text.normal` `#c5c9c5`, `text.soft` `#b4b7b4`, `text.muted` `#a6a9a6`, `text.faint` `#737c73`,
    `accent.normal` `#8ba4b0`, `accent.text` `#8ea4a2`, `accent.background` `#2d3032`, `state.changed` `#c4b28a`,
    `state.warning` `#c4746e`, `state.warningBackground` `#372726`, `kind.unit` `#8ba4b0`, `kind.item` `#c4937c`,
    `kind.destructable` `#8a9a7b`, `kind.doodad` `#c4b28a`, `kind.ability` `#8ea4a2`, `kind.buff` `#a292a3`,
    `kind.upgrade` `#c4746e`.
- [ ] **Step 2: Run them to see them fail.** `cd web && npm test` — FAIL.
- [ ] **Step 3: Move `scopeColor`, write `vscodeColors.ts`, `make-themes.ts` and `shipped.ts`.** The script runs
  under Node 24's type stripping (`node scripts/make-themes.ts`), so it and what it imports use relative `.ts` imports,
  `import type` for types, and no Vite features (it reads `tm-themes` with `fs`, not `import.meta.glob`).
- [ ] **Step 4: Make the files.** `cd web && npm run themes` — writes 64 files; run it again and it writes none.
- [ ] **Step 5: Run the tests.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Ship an editor theme for every code theme"`

### Task 3: The interface takes its colours from the theme files

**Files:**
- Modify: `web/src/app.css`, `web/uno.config.ts`, `web/src/uno.test.ts`, `web/src/lib/themes.ts` (rewritten),
  `web/src/lib/app/appearance.svelte.ts`, `web/src/lib/codeThemes.ts`, `web/src/lib/app/SettingsDialog.svelte`,
  `web/src/lib/terminal/TerminalView.svelte`, `web/src/text/strings.json` (drop `settings.codeThemeSame`), every
  `.svelte`/`.ts`/`.css` file using a renamed class or variable (list them with the search in Step 4)
- Delete: `web/src/lib/themeColors.ts`, `web/src/lib/themeColors.test.ts`
- Test: `web/src/lib/themes.test.ts`, `web/src/lib/theme.test.ts`, `web/src/lib/codeThemes.test.ts`,
  `web/src/lib/app/appearance.test.ts`

**Interfaces:**
- Consumes: `shippedThemes` (Task 2), `Theme`, `ColorKey`, `colorKeys` (Task 1).
- Produces, `themes.ts`: `defaultTheme = "kanagawa-dragon"`, `themeOf(id: string | null | undefined, list: Theme[]): Theme`
  (an id from before goes through `codeThemeWith`'s earlier ids; unknown → the default), `cssName(key: ColorKey): string`
  (`state.warningBackground` → `--state-warning-background`), `applyTheme(theme: Theme, root?: HTMLElement): void`
  (every non-terminal colour as its CSS variable, plus `data-theme`, `data-scheme` and `color-scheme` as today),
  `terminalTheme(theme: Theme): TerminalColors` (xterm's names: `background`, `foreground`, `cursor`,
  `selectionBackground`, `black` … `brightWhite`). `savedTheme`/`saveTheme` keep the window's storage until Task 5.
  `themes.ts` also exports `type Theme` (re-exported from `format.ts`, so components keep importing it from there) and
  `type TerminalColors` (moved from `themeColors.ts`).
- Produces, `codeThemes.ts`: `codeThemeOf(id: string, type: ThemeType): CodeTheme` — the chosen one, else `dark-plus`
  or `light-plus` by `type`. `Theme` is no longer imported there.
- Produces, CSS variables: `--background-base` … `--kind-upgrade` (every key but `terminal.*`, through `cssName`).
- Produces, UnoCSS colours (`uno.config.ts`):

  | Class colour | Variable | Was |
  |---|---|---|
  | `deep` | `--background-base` | `bg` (`text-base` is a font size, so not `base`) |
  | `panel` | `--background-panel` | `surface` |
  | `gutter`, `raised`, `hover`, `field` | `--background-*` | same |
  | `selection` | `--background-selection` | `select` |
  | `button` | `--background-button` | `primary` |
  | `line`, `line-faint` | `--border-normal`, `--border-faint` | `line`, `hairline` |
  | `normal`, `soft` | `--text-normal`, `--text-soft` | `fg`, `body` |
  | `muted`, `faint` | `--text-muted`, `--text-faint` | same |
  | `accent`, `accent-text`, `accent-background` | `--accent-*` | `accent`, `accent-hi`, `accent-lo` |
  | `changed` | `--state-changed` | same |
  | `warning`, `warning-background` | `--state-warning`, `--state-warning-background` | `warn`, `warn-lo` |
  | `kind-*` | `--kind-*` | same |

  `cyan` and `purple` go.

- [ ] **Step 1: Write the failing tests.**
  - `uno.test.ts`: `bg-panel` is `var(--background-panel)`, `text-soft` is `var(--text-soft)`, `border-line` is
    `var(--border-normal)`, `bg-panel/70` mixes `var(--background-panel)`.
  - `themes.test.ts`: `applyTheme` sets `--background-panel` and `--state-warning-background` and no `--terminal-*`;
    `themeOf("gruvbox-dark", shippedThemes).id` is `gruvbox-dark-medium`; `themeOf("nope", shippedThemes).id` is
    `kanagawa-dragon`; `terminalTheme(t).red` equals `t.colors["terminal.red"]`.
  - `codeThemes.test.ts`: `codeThemeOf("", "dark").id` is `dark-plus`, `codeThemeOf("", "light").id` is
    `light-plus`, `codeThemeOf("nord", "light").id` is `nord`.
  - `theme.test.ts`: the `:root` block of `app.css` holds, for every non-terminal key, the `kanagawa-dragon` file's
    colour under `cssName(key)`, so the page before the script runs matches the default theme.
- [ ] **Step 2: Run them to see them fail.** `cd web && npm test` — FAIL.
- [ ] **Step 3: Record today's winners.** Before renaming, `cd web && npm run build` and keep `dist/assets/*.css` as
  `before.css` in the scratchpad.
- [ ] **Step 4: Rename.** Find every use with
  `rg -n "\b(bg|text|border|outline|ring|fill|stroke|from|to|divide|caret|decoration)-(bg|surface|select|primary|hairline|fg|body|accent-hi|accent-lo|warn|warn-lo|cyan|purple)\b|var\(--(bg|surface|raised|hover|border|fg|text|muted|faint|accent|accent-hi|accent-lo|changed|warn|warn-lo|gutter|field|select|primary|hairline|kind-[a-z]+)\)" web/src`
  and rename by the table. `app.css`'s `:root` holds the Kanagawa Dragon file's colours under the new names; its
  worked-out colour lines (`--gutter` … `--hairline`, both schemes) go, since `fillColors` makes them now; the light
  block keeps only the shading amounts.
- [ ] **Step 5: Rewrite `themes.ts`, `appearance.svelte.ts` (`terminalColors` = `terminalTheme(theme)`,
  `codeTheme` = `codeThemeOf(prefs.codeTheme, theme.type)`, `frameColors` with `background.panel` and
  `border.normal`), `codeThemes.ts`, and Settings' code theme list (the 64 code themes, no "Same as the theme").
  Delete `themeColors.ts` and its test.**
- [ ] **Step 6: Move the interface's fixed colours to the theme.** List them with
  `rg -n "#[0-9a-fA-F]{3,8}\b|\b(black|white)\b|rgb\(" web/src --glob "*.{svelte,css}"`, leaving out the tooltip
  previews, the map view and the trigger canvas's own files. A plain colour takes the nearest theme colour; an SVG data
  URI (the checkbox's tick, the dropdown's arrow) becomes a `mask-image` over a theme-coloured background (the tick
  `text.normal`, the arrow `text.faint`), so the two light-scheme copies in `app.css` go. Name the ones kept, and why,
  in the commit message body.
- [ ] **Step 7: Check no winner changed.** Build again; for each element in `web/src` whose class list has two theme
  colour utilities for the same property and the same variants, the one that wins in `before.css` must win in the new
  CSS (later rule wins). List the pairs you checked in the commit message body. Fix any swap with a variant or by
  dropping the dead class.
- [ ] **Step 8: Run the checks.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 9: Commit.** `git add -A && git commit -m "Take the interface's colours from the theme files"`

### Task 4: The .moonwell folder on the C# side

**Files:**
- Create: `src/MoonwellEditor.App/Home.cs`
- Delete: `src/MoonwellEditor.App/Settings.cs`, `tests/MoonwellEditor.App.Tests/SettingsTests.cs`
- Modify: `src/MoonwellEditor.App/Commands.cs`, `src/MoonwellEditor.App/MainForm.cs`, `docs/dev.md`
- Test: `tests/MoonwellEditor.App.Tests/HomeTests.cs`, `tests/MoonwellEditor.App.Tests/CommandsTests.cs`,
  `tests/MoonwellEditor.App.Tests/CommandTests.cs` (constructors take a `Home`)

**Interfaces:**
- Produces:

  ```csharp
  public sealed record HomeChange(string File, string? Text);

  public sealed class Home : IDisposable
  {
      public const string FolderVariable = "MOONWELL_EDITOR_HOME";
      public const int RecentMapsKept = 10;
      public static string DefaultFolder(Func<string, string?> environment);
      public Home(string folder, string? legacyFolder = null);
      public string Folder { get; }
      public string? GameFolder { get; }
      public IReadOnlyList<string> RecentMaps { get; }
      public void RememberMap(string map);
      public void SetState(string key, JsonElement value);
      public void Write(string file, string text);
      public string BootScript();
      public void Watch();
      public event Action<HomeChange>? Changed;
      public event Action<string?>? GameFolderChanged;
  }
  ```

  - `DefaultFolder`: `MOONWELL_EDITOR_HOME` when set, else `%USERPROFILE%\.moonwell`.
  - `GameFolder`: `settings.json`'s `game.folder` (read with comments and trailing commas allowed); when there is no
    `settings.json`, the legacy `%LOCALAPPDATA%\MoonwellEditor\settings.json`'s `gameFolder`.
  - `RecentMaps`, `RememberMap`: `state.json`'s `recentMaps`, newest first, no duplicates by case, at most 10; seeded
    from the legacy file's `recentMaps` while there is no `state.json`.
  - `SetState`: sets one top-level key in `state.json`, keeping the others (`recentMaps` too).
  - `Write`: only `settings.json`, `hotkeys.json`, `themes/<name>.json` and `schemas/<name>.schema.json`, where
    `<name>` matches `^[A-Za-z0-9][A-Za-z0-9 ._-]*$`; anything else throws `ArgumentException`. Creates folders, writes
    through a temporary file in the same folder, and doesn't touch a file whose text is already the same.
  - `BootScript`: `window.moonwellHome = {json};` with
    `{ folder, settings, hotkeys, state, themes: [{ file, text }], legacy: { gameFolder } | null }` (texts null when
    missing; `legacy` only while there is no `settings.json`). Read with `File.ReadAllText`, which drops a byte order
    mark.
  - `Watch`: a `FileSystemWatcher` on the folder and `themes\`, for `settings.json`, `hotkeys.json` and
    `themes\*.json`, each change raised once after 150 ms of quiet as `Changed` (forward slashes, text null when
    deleted); temporary files are ignored. A `settings.json` change whose `game.folder` differs raises
    `GameFolderChanged`.
- Produces, commands: `writeHome { file, text }` → `Home.Write` (a refused name is `badRequest`),
  `setState { key, value }` → `Home.SetState`, `openHome { file? }` → opens the folder, or `themes/`, or a file, with
  the shell (an `Action<string> open` given to `Commands`, `Process.Start` with `UseShellExecute` in `MainForm`).
  `Commands` raises `HomeChanged` (`Action<HomeChange>`), which `MainForm` sends as the `homeChanged` event.
- `chooseGameData` no longer saves the folder (the page writes `game.folder`, Task 5). `GameFolderChanged` starts
  loading the new folder (or the install found, for null) when it differs from the one in use.
- `MainForm` serves `BootScript()` at `https://game.moonwelleditor/home.js` as `text/javascript`, before
  `ServeAsset` waits for the install, and makes the `Home` from `Home.DefaultFolder(Environment.GetEnvironmentVariable)`
  with `%LOCALAPPDATA%\MoonwellEditor` as the legacy folder.

- [ ] **Step 1: Write the failing tests** in `HomeTests.cs`, each with its own temp folder:
  - `Default_folder_is_the_variable_then_the_home_folder`.
  - `Game_folder_comes_from_settings_with_comments_and_trailing_commas`; `Game_folder_is_null_when_settings_say_null`.
  - `Legacy_game_folder_is_used_only_without_settings`.
  - `A_byte_order_mark_is_read_like_any_file` (a `settings.json` written with `new UTF8Encoding(true)`).
  - `Remembered_maps_are_newest_first_without_duplicates_and_at_most_ten` (ported), and
    `Remembered_maps_start_from_the_legacy_file`.
  - `SetState_keeps_the_other_keys` (`recentMaps` survives a `SetState("terminalHeight", 300)`).
  - `Write_refuses_names_outside_the_folder` (`../x.json`, `themes/../../x.json`, `state.json`, `themes/a/b.json`).
  - `Write_leaves_an_unchanged_file_alone` (its last-write time stays).
  - `Boot_script_holds_the_files` (parse the JSON after `window.moonwellHome = `: settings text, a theme's file and
    text, `legacy` present only without `settings.json`).
  - `Watch_reports_a_saved_theme` and `Watch_reports_a_changed_game_folder` (wait up to 5 s for the event).
  - In `CommandsTests.cs`: `writeHome` writes; a refused name answers `badRequest`; `setState` merges; `openHome` with
    `themes` passes `<folder>\themes` to `open`; `chooseGameData` leaves `settings.json` alone.
- [ ] **Step 2: Run them to see them fail.** `dotnet test tests/MoonwellEditor.App.Tests` — FAIL to build.
- [ ] **Step 3: Implement `Home`, the commands, the event and `/home.js`.** Delete `Settings.cs` and its tests.
- [ ] **Step 4: Document it.** `docs/dev.md`: where settings live, `MOONWELL_EDITOR_HOME`, and that a test editor sets
  it and `WEBVIEW2_USER_DATA_FOLDER` to scratch folders.
- [ ] **Step 5: Run the tests.** `dotnet test` — PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Keep settings and themes in the .moonwell folder"`

### Task 5: The page reads and writes settings.json

**Files:**
- Create: `web/src/lib/home/home.ts`, `web/src/lib/home/schemas/settings.schema.json`, `docs/settings.md`
- Modify: `web/src/lib/home/jsonc.ts`, `web/src/lib/prefs.svelte.ts`, `web/src/lib/graphics.svelte.ts`,
  `web/src/lib/themes.ts`, `web/src/lib/app/appearance.svelte.ts`, `web/src/lib/app/startup.svelte.ts`,
  `web/src/lib/app/SettingsDialog.svelte`, `web/src/App.svelte`, `web/src/main.ts`, `web/index.html`,
  `web/src/test/fakeApp.ts`, `web/src/text/strings.json`
- Test: `web/src/lib/home/home.test.ts`, `web/src/lib/home/jsonc.test.ts`, `web/src/lib/prefs.test.ts`,
  `web/src/App.start.test.ts`

**Interfaces:**
- Consumes: the commands and event of Task 4; `Problem` (Task 1).
- Produces, `home.ts`:
  `type HomeBoot = { folder: string; settings: string | null; hotkeys: string | null; state: string | null; themes: { file: string; text: string }[]; legacy: { gameFolder: string | null } | null }`,
  `homeBoot(): HomeBoot` (`window.moonwellHome`, else an empty boot), `writeHome(file: string, text: string): Promise<void>`,
  `keepState(key: string, value: unknown): Promise<void>`, `openHome(file?: string): Promise<void>`,
  `onHomeChanged(handler: (change: { file: string; text: string | null }) => void): () => void`,
  `writeSchemas(): void` (every file in `./schemas/` to `schemas/<name>`), `homeNotice` (`$state`: the one
  "not saved" message, set the first time a write fails).
- Produces, `jsonc.ts`: `setKey(text: string, key: string, value: unknown | undefined): string` (`jsonc-parser`'s
  `modify` and `applyEdits`, 2 spaces; `undefined` removes the key).
- Produces, `prefs.svelte.ts`: `prefs` (`$state`: `theme`, `codeTheme`, `uiScale`, `gameFolder`, `graphicsMode`,
  `teamColor`, `showHidden`, `confirm`, `alphaNotice`, `experimental`, `terminalShell`; `terminalHeight` stays in the
  window's storage until Task 6), `settingsProblems` (`$state<Problem[]>`), `loadSettings(text: string | null): void`,
  `setPref<K>(key: K, value: Prefs[K]): void`. One table maps each pref to its `settings.json` key and to and from the
  file's value: `teamColor` is the colour's name, `codeTheme` and `terminalShell` are `null` for none (`""` in code),
  a value equal to its default is removed from the file.
- `main.ts` calls `loadSettings(homeBoot().settings)` and `writeSchemas()` before `mount`; `index.html` loads
  `https://game.moonwelleditor/home.js` with a plain `<script>` before the module.

- [ ] **Step 1: Write the failing tests.**
  - `jsonc.test.ts`: `setKey` on `{\n  // mine\n  "a": 1\n}` sets `"b": 2` and keeps `// mine`; `undefined` removes `a`.
  - `prefs.test.ts`:
    - `null` text → every default; `{"appearance.uiScale": 120, "objects.teamColor": "blue"}` → 120 and 1.
    - `"appearance.uiScale": 90` → default 100, problem `{ code: "badValue", key: "appearance.uiScale", line: 1 }`.
    - an unknown key is kept in the file on the next write and gives no problem.
    - `setPref("uiScale", 120)` writes `settings.json` with `"appearance.uiScale": 120`, keeping a comment;
      `setPref("uiScale", 100)` removes the key; `setPref("teamColor", 2)` writes `"teal"`.
    - **broken file**: after `loadSettings("{ oops")` the prefs keep their last values, `settingsProblems` has
      `notJson`, and `setPref` changes `prefs` but sends no `writeHome`. (Review Focus 1)
    - **latest text**: after a `homeChanged` with another editor's text, the next `setPref` edits that text. (Review
      Focus 4)
    - **can't write**: a `writeHome` that answers a refusal sets `homeNotice` once and leaves `prefs` changed.
      (Review Focus 5)
  - `settings.schema.json` lists exactly the keys of the table, with their defaults.
  - `App.start.test.ts`: a boot with `"appearance.theme": "nord"` mounts with `data-theme="nord"`; a `homeChanged` for
    `settings.json` with `"appearance.theme": "dracula"` switches the page; after `chooseGameData` and a loaded
    `gameData` event with that folder, `writeHome` gets `"game.folder"` set to it.
- [ ] **Step 2: Run them to see them fail.** `cd web && npm test` — FAIL.
- [ ] **Step 3: Implement.** `prefs`, `graphics` and the chosen theme read from `settings.json`, live on
  `homeChanged`. `Appearance.theme` follows `prefs.theme` (applied in its constructor before the first paint, as now,
  and again when it changes). `startup.svelte.ts` remembers the folder `chooseGameData` answered with and writes
  `game.folder` when a `gameData` state with that `source` is loaded. Settings shows `settingsProblems` and
  `homeNotice`. `fakeApp.ts` answers `writeHome`, `setState` and `openHome` with null and its `appTests` loads an empty
  boot before each test.
- [ ] **Step 4: Document it.** `docs/settings.md`: the folder, each `settings.json` key with values and default, an
  example, what happens to a bad value.
- [ ] **Step 5: Run the checks.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Read and write settings.json"`

### Task 6: hotkeys.json and state.json

**Files:**
- Create: `web/src/lib/home/state.svelte.ts`, `web/src/lib/home/schemas/hotkeys.schema.json`
- Modify: `web/src/lib/app/keymap.ts`, `web/src/lib/app/editor.svelte.ts`, `web/src/lib/app/SettingsDialog.svelte`,
  `web/src/lib/objects/fieldFilters.svelte.ts`, `web/src/lib/objects/TableView.svelte`,
  `web/src/lib/objects/TooltipEditor.svelte`, `web/src/lib/terminal/TerminalPanel.svelte`, `web/src/lib/prefs.svelte.ts`
  (drop `terminalHeight`), `web/src/main.ts`, `docs/settings.md`
- Test: `web/src/lib/app/keymap.test.ts`, `web/src/lib/home/state.test.ts`, `web/src/lib/objects/fieldFilters.test.ts`,
  `web/src/lib/objects/TooltipEditor.test.ts`, `web/src/App.keys.test.ts`, `web/src/App.terminal.test.ts`

**Interfaces:**
- Consumes: `homeBoot`, `writeHome`, `keepState`, `onHomeChanged`, `setKey`, `parseJsonc` (Tasks 1, 5).
- Produces, `keymap.ts`: `readKeymap(text: string | null): { keymap: Keymap; problems: Problem[] }` (an unknown
  command id or a value that isn't a list of strings is a warning and is skipped), `saveKeymap(keymap: Keymap): void`
  (only commands that differ from the defaults, edited into the latest `hotkeys.json` text; nothing written while the
  file can't be read), `hotkeyProblems` (`$state`).
- Produces, `state.svelte.ts`: `loadState(text: string | null): void`,
  `stateOf<T>(key: string, fallback: T, fits: (value: unknown) => value is T): T`, `setState(key: string, value: unknown): void`
  (memory, then `keepState`), `stateStore: Store` (`table.ts`'s `getItem`/`setItem` over JSON text). Keys:
  `terminalHeight`, `favourites`, `tooltipColours`, `objectEditor.columns.<kind>`. The page never writes `recentMaps`.

- [ ] **Step 1: Write the failing tests.**
  - `keymap.test.ts`: `readKeymap(null)` is `defaultKeymap()`; `{"save": ["Ctrl+Alt+S"]}` changes only `save`;
    `{"kindUnit": []}` takes the default key away; `{"nope": ["F1"]}` gives `unknownKey`; `saveKeymap` keeps a comment
    and writes only changed commands; after a broken `hotkeys.json`, `saveKeymap` writes nothing. (Review Focus 1)
  - `hotkeys.schema.json` lists exactly the ids in `actionList`.
  - `state.test.ts`: `stateOf` gives the fallback for a missing key or one that doesn't fit; `setState` sends
    `setState` with the key and value.
  - `fieldFilters.test.ts`, `TooltipEditor.test.ts`, `App.terminal.test.ts`: the same behaviour as now, reading from
    and writing to the state store instead of the window's storage.
  - `App.keys.test.ts`: a `homeChanged` for `hotkeys.json` changes which key runs a command.
- [ ] **Step 2: Run them to see them fail.** `cd web && npm test` — FAIL.
- [ ] **Step 3: Implement.** `main.ts` calls `loadState(homeBoot().state)` before `mount`; `editor.keymap` starts from
  `readKeymap(homeBoot().hotkeys)` and follows `homeChanged`.
- [ ] **Step 4: Document `hotkeys.json`** in `docs/settings.md`: the ids, the key format, `[]`.
- [ ] **Step 5: Run the checks.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Keep hotkeys and the editor's state in files"`

### Task 7: The move from the window's storage

**Files:**
- Create: `web/src/lib/home/move.ts`
- Modify: `web/src/main.ts`
- Test: `web/src/lib/home/move.test.ts`

**Interfaces:**
- Consumes: `HomeBoot`, `writeHome`, `loadSettings`, `readKeymap`, `loadState`, `setState`, `setKey`, `codeThemeWith`.
- Produces: `moveFromStorage(storage: Pick<Storage, "getItem">, legacy: HomeBoot["legacy"]): { settings: string; hotkeys: string | null; state: Record<string, unknown> }`
  and `moveIfNeeded(boot: HomeBoot, storage: Storage): HomeBoot` (when `boot.settings` is null and the storage has no
  `moonwell-editor.moved`: writes the files, sends each state key, sets `moonwell-editor.moved` to `yes`, and returns
  the boot with the moved texts, so `main.ts` loads them before `mount`; otherwise returns `boot`).
- Reads: `moonwell-editor.prefs` (with `confirmReload` and `moonwell-editor.alpha-understood` as `prefs.svelte.ts`
  reads them today), `moonwell-editor.theme`, `moonwell-editor.graphics`, `moonwell-editor.hotkeys`,
  `moonwell-editor.field-filters`, `moonwell-editor.tooltip-colours`, `objectEditor.columns.<kind>`.

- [ ] **Step 1: Write the failing tests.**
  - empty storage, no legacy → settings text with only `$schema`; no hotkeys; empty state.
  - `moonwell-editor.theme` `gruvbox-dark` → `"appearance.theme": "gruvbox-dark-medium"`; `nord` stays `nord`.
  - prefs `codeTheme: ""` with theme `one-dark` → `"appearance.codeTheme": "one-dark-pro"`; `codeTheme: "nord"` kept.
  - prefs `uiScale: 120`, `teamColor: 2`, `confirm: false`, `terminalHeight: 300` → `appearance.uiScale` 120,
    `objects.teamColor` `"teal"`, `editor.confirm` false; `terminalHeight` 300 in state; defaults left out.
  - legacy `gameFolder` → `game.folder`; hotkeys and favourites, columns and tooltip colours carried over.
  - `moveIfNeeded` does nothing when `boot.settings` is a text, or when `moonwell-editor.moved` is `yes`.
- [ ] **Step 2: Run them to see them fail.** `cd web && npx vitest run src/lib/home/move.test.ts` — FAIL.
- [ ] **Step 3: Implement**, and call `moveIfNeeded` in `main.ts` before the loads.
- [ ] **Step 4: Run the checks.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "Move settings from the window's storage once"`

### Task 8: The user's themes in Settings

**Files:**
- Modify: `web/src/lib/themes.ts`, `web/src/lib/app/SettingsDialog.svelte`, `web/src/lib/app/ThemePicker.svelte`,
  `web/src/lib/app/appearance.svelte.ts`, `web/src/text/strings.json`
- Create: `docs/themes.md`
- Test: `web/src/lib/themes.test.ts`, `web/src/App.pages.test.ts` (or a new `web/src/App.themes.test.ts`)

**Interfaces:**
- Consumes: `parseTheme`, `themeText`, `shippedThemes`, `homeBoot`, `onHomeChanged`, `writeHome`, `openHome`, `setPref`.
- Produces, `themes.ts`: `loadUserThemes(files: { file: string; text: string }[]): void`,
  `themeChanged(file: string, text: string | null): void`, `allThemes(): Theme[]` (shipped, with a user theme of the
  same id in its place), `themeFiles` (`$state<{ file: string; id: string; refused: boolean; replaces: boolean; problems: Problem[] }[]>`),
  `copyTheme(theme: Theme): Promise<string>` (writes `themes/<id>-copy.json`, or `-copy-2` … when taken, named
  `<name> (copy)`, every colour; adds it at once, chooses it, opens the file; returns the new id).
- A refused change to a file keeps the last version of that theme that loaded, with the problem shown. A chosen id
  with no theme shows the default and a line in Settings saying so.

- [ ] **Step 1: Write the failing tests.**
  - a boot theme `themes/mine.json` appears in `allThemes()` with `source: "user"`; one named `nord.json` replaces the
    shipped Nord and is marked `replaces`.
  - a file with spaces in its name (`themes/My Theme.json`) loads with id `My Theme` and can be chosen.
  - **half-written save**: with `mine` in use, `themeChanged("themes/mine.json", "{ oo")` keeps the page's colours and
    shows `notJson`; the next good text applies at once. (Review Focus 2)
  - a refused file with no earlier version is listed with its reason and isn't in `allThemes()`.
  - `copyTheme(kanagawa)` writes `themes/kanagawa-dragon-copy.json` that `parseTheme` reads back with the same colours,
    sends `openHome` with it, and `prefs.theme` becomes `kanagawa-dragon-copy`; a second copy is `-copy-2`.
  - Settings: "Open themes folder" sends `openHome` with `themes`; a chosen theme that's gone shows the default and
    the notice; the code theme list has 64 entries.
- [ ] **Step 2: Run them to see them fail.** `cd web && npm test` — FAIL.
- [ ] **Step 3: Implement**, with `main.ts` calling `loadUserThemes(homeBoot().themes)` before `mount`.
- [ ] **Step 4: Document it.** `docs/themes.md`: the file, every key with what it colours and what it is worked out
  from (the spec's tables), colour values, checks, the folder, copy and reload.
- [ ] **Step 5: Run the checks.** `cd web && npm test && npm run check` — PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "Load the user's themes and copy a theme"`

### Task 9: Check it in the app and open the pull request

- [ ] **Step 1: Full suite.** `cd web && npm test && npm run check`, then `dotnet test` from the worktree root — all
  PASS (report any failure with its output).
- [ ] **Step 2: Build.** `cd web && npm run build`, `dotnet build src/MoonwellEditor.App -c Release`,
  `dotnet publish src/MoonwellEditor.App -c Release -r win-x64 --self-contained false`.
- [ ] **Step 3: Drive a test editor** from `bin/Release/net10.0-windows/MoonwellEditor.exe` with scratch
  `WEBVIEW2_USER_DATA_FOLDER` and `MOONWELL_EDITOR_HOME`, a free debug port and a copy of a map; check the title first.
  Check: it starts on Kanagawa Dragon with no flash; a light theme (Light Plus) turns the whole page light and the
  terminal with it; "Copy as new theme" writes the file, and changing a colour in it changes the page on save;
  changing the UI scale in Settings keeps a comment written in `settings.json`; the code theme changes only scripts.
  Take screenshots of the default and a light theme for the pull request.
- [ ] **Step 4: Update the design's calls** if building changed any, in the spec's "Calls to check".
- [ ] **Step 5: Open the pull request.** Push `themes-redesign` (`git push -u origin themes-redesign`), then from the
  worktree `gh pr create --repo wc3-dev/moonwell-editor --base main`, ready for review, with a summary, the calls made
  while building, the new package, the screenshots and how it was checked.
