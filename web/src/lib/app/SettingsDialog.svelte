<script lang="ts">
/**
 * The editor's settings (Sven, 2026-10-27), in tabs: General (the graphics mode, the UI scale, the theme, the code theme
 * and the default team colour, which show at once and are remembered, then the switches under Other), Hotkeys (each action's
 * keys, which a click and a key press change), Map (what the editor knows about the open map: its name, its game data
 * option and the tables the game reads under it) and Game data.
 */
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import { RadioGroup, Tabs } from "bits-ui";
import { onMount } from "svelte";
import { type Kind, kinds, type MapInfo } from "../api.ts";
import { type CodeTheme, codeColors, codeThemeOf, loadCodeThemes } from "../codeThemes.ts";
import { type GraphicsMode, graphics, graphicsModes, setGraphicsMode } from "../graphics.svelte.ts";
import { openHome } from "../home/home.ts";
import type { Problem } from "../home/jsonc.ts";
import { homeNotice } from "../home/notice.svelte.ts";
import TeamColourGrid from "../objects/TeamColourGrid.svelte";
import { kindNames } from "../objects/tree.ts";
import { prefs, setPref, settingsProblems, uiScales } from "../prefs.svelte.ts";
import { type Shell, terminalShells } from "../terminal/api.ts";
import { t } from "../text.ts";
import { requiredKeys } from "../themes/format.ts";
import {
  allThemes,
  copyTheme,
  findTheme,
  type Theme,
  type ThemeFile,
  themeFiles,
} from "../themes.ts";
import Dialog from "../ui/Dialog.svelte";
import Popover from "../ui/Popover.svelte";
import Select from "../ui/Select.svelte";
import type { GameDataState } from "./gameData.ts";
import {
  type Action,
  actionList,
  clashes,
  defaultKeymap,
  hotkeyProblems,
  type Keymap,
  keyOf,
  saveKeymap,
  shownKey,
} from "./keymap.ts";
import ThemePicker from "./ThemePicker.svelte";

type Props = {
  theme: Theme;
  ontheme: (theme: Theme) => void;
  keymap: Keymap;
  onkeymap: (keymap: Keymap) => void;
  map: MapInfo | null;
  data: GameDataState | null;
  /** Opens the app's dialog for another Warcraft III folder. */
  onchoose: () => void;
  onclose: () => void;
};

let { theme, ontheme, keymap, onkeymap, map, data, onchoose, onclose }: Props = $props();

type Tab = "general" | "hotkeys" | "map" | "data";
const tabs: { tab: Tab; name: string }[] = [
  { tab: "general", name: t("settings.tab.general") },
  { tab: "hotkeys", name: t("settings.tab.hotkeys") },
  { tab: "map", name: t("settings.tab.map") },
  { tab: "data", name: t("settings.tab.data") },
];
let tab = $state<Tab>("general");

const tableNames: Record<string, string> = {
  base: t("settings.theBaseTables"),
  custom_v0: "custom_v0",
  custom_v1: "custom_v1",
  melee_v0: "melee_v0",
};

// What is wrong with settings.json, in a sentence.
function problemText(problem: Problem): string {
  const text =
    problem.code === "badValue"
      ? t("settings.problem.badValue", { key: problem.key ?? "" })
      : problem.code === "unreadable"
        ? t("settings.problem.unreadable")
        : t("settings.problem.notJson");
  return problem.line === undefined ? text : t("settings.problem.at", { line: problem.line, text });
}

// What is wrong with hotkeys.json, in a sentence.
function hotkeyProblemText(problem: Problem): string {
  const key = problem.key ?? "";
  const text =
    problem.code === "unknownKey"
      ? t("hotkeys.problem.unknownKey", { key })
      : problem.code === "badValue"
        ? t("hotkeys.problem.badValue", { key })
        : problem.code === "unreadable"
          ? t("hotkeys.problem.unreadable")
          : t("hotkeys.problem.notJson");
  return problem.line === undefined ? text : t("settings.problem.at", { line: problem.line, text });
}

// What is wrong with a theme file, in a sentence.
function themeProblemText(problem: Problem): string {
  const key = problem.key ?? "";
  const text =
    problem.code === "noName"
      ? t("settings.themeProblem.noName")
      : problem.code === "badType"
        ? t("settings.themeProblem.badType")
        : problem.code === "missing"
          ? t("settings.themeProblem.missing", { key })
          : problem.code === "badColor"
            ? requiredKeys.some((each) => each === key)
              ? t("settings.themeProblem.badRequiredColor", { key })
              : t("settings.themeProblem.badColor", { key })
            : problem.code === "unknownKey"
              ? t("settings.themeProblem.unknownKey", { key })
              : problem.code === "badValue"
                ? t("settings.themeProblem.badValue", { key })
                : problem.code === "unreadable"
                  ? t("settings.themeProblem.unreadable")
                  : t("settings.themeProblem.notJson");
  return problem.line === undefined ? text : t("settings.problem.at", { line: problem.line, text });
}

// The sentence above a theme file's problems: a file that could not be loaded is left out, or the last version of it that
// loaded is still in use.
function themeFileHead(each: ThemeFile): string {
  if (!each.refused) return t("settings.themeFile.warnings", { file: each.file });
  return inUse.has(each.id)
    ? t("settings.themeFile.kept", { file: each.file })
    : t("settings.themeFile.left", { file: each.file });
}

// The themes to choose from, the user's among them; the chosen one is the default when none has its id (Sven, 2026-11-02).
const themes = $derived(allThemes());
const inUse = $derived(
  new Set(themes.filter((each) => each.source === "user").map((each) => each.id)),
);
const chosenGone = $derived(findTheme(prefs.theme, themes) === undefined);
const chosenRefused = $derived(themeFiles.find((each) => each.id === prefs.theme && each.refused));

const customKinds = $derived(map ? kinds.filter((kind: Kind) => (map.counts[kind] ?? 0) > 0) : []);

// The switches under Other.
const switches = [
  { key: "confirm", text: t("settings.confirm") },
  { key: "alphaNotice", text: t("settings.alphaNotice") },
  { key: "reopenLastMap", text: t("settings.reopenLastMap") },
  { key: "experimental", text: t("settings.experimental") },
  { key: "showHidden", text: t("settings.showHidden") },
] as const;

const themeSwatch = ({ colors }: Theme): string[] =>
  (
    [
      "background.base",
      "background.panel",
      "accent.normal",
      "state.changed",
      "kind.unit",
      "kind.item",
      "kind.ability",
    ] as const
  ).map((key) => colors[key]);

// The code themes with their colours, for the swatches; they load when Settings opens.
let loadedCodeThemes = $state<CodeTheme[]>([]);
onMount(() => {
  loadCodeThemes().then((all) => (loadedCodeThemes = all));
});
const shownCodeTheme = $derived(
  loadedCodeThemes.find((each) => each.id === codeThemeOf(prefs.codeTheme, theme.type).id),
);

function codeSwatch(theme: CodeTheme): string[] {
  const colors = codeColors(theme);
  return (
    [
      "code-bg",
      "code-fg",
      "code-keyword",
      "code-function",
      "code-string",
      "code-number",
      "code-comment",
    ] as const
  ).map((token) => colors[token]);
}

// The shells a new terminal can run; the first found is the default until one is chosen (Sven, 2026-11-01).
let shells = $state.raw<Shell[]>([]);
onMount(() => {
  terminalShells().then(
    (found) => (shells = found),
    () => {},
  );
});

// The action whose new key is being pressed.
let listening = $state<Action | null>(null);

function setKeys(action: Action, keys: string[]): void {
  const next = { ...keymap, [action]: keys };
  saveKeymap(next);
  onkeymap(next);
}

// The next key pressed (not a modifier alone) replaces the action's keys; Esc stops listening.
function listen(event: KeyboardEvent): void {
  if (!listening) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    listening = null;
    return;
  }
  const key = keyOf(event);
  if (!key) return;
  setKeys(listening, [key]);
  listening = null;
}

function resetAll(): void {
  saveKeymap(defaultKeymap());
  onkeymap(defaultKeymap());
}
</script>

<!-- A key Windows takes for itself (Ctrl Esc opens the Start menu) moves the focus away: that stops the listening too
     (Sven, 2026-10-29). -->
<svelte:window onkeydowncapture={listen} onblur={() => (listening = null)} />

{#snippet row(label: string, value: string, mono = false)}
  <div class="flex gap-3 py-0.5">
    <span class="w-32 shrink-0 text-muted">{label}</span>
    <span class="min-w-0 break-words {mono ? 'font-mono text-mono' : ''} text-normal">{value}</span>
  </div>
{/snippet}

{#snippet heading(text: string)}
  <h3 class="m-0 mt-2.5 mb-[3px] font-semibold text-normal first:mt-1">{text}</h3>
{/snippet}

<Dialog
  title={t("settings.title")}
  oncancel={() => (listening ? (listening = null) : onclose())}
  wide
  focus={false}
>
  {#if settingsProblems.length > 0 || homeNotice.text}
    <div class="mb-2 flex flex-col gap-0.5 rounded-ui bg-warning-background px-2.5 py-1.5 text-warning">
      {#each settingsProblems as each (each.key ?? each.code)}
        <p class="m-0">{problemText(each)}</p>
      {/each}
      {#if homeNotice.text}
        <p class="m-0" data-testid="home-notice">{homeNotice.text}</p>
      {/if}
    </div>
  {/if}

  <Tabs.Root value={tab} onValueChange={(value) => (tab = value as Tab)}>
    <Tabs.List class="mb-2 flex border-b border-line">
      {#each tabs as each (each.tab)}
        <Tabs.Trigger
          value={each.tab}
          class="-mb-px rounded-t-ui border-b px-2.5 py-0.5 {tab === each.tab
            ? 'border-transparent bg-raised text-normal'
            : 'border-line text-muted hover:text-normal'}"
        >
          {each.name}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>

  <div class="min-h-[300px]">
    {#if tab === "general"}
      {@render heading(t("settings.graphicsMode"))}
      <RadioGroup.Root
        class="flex gap-1"
        orientation="horizontal"
        aria-label={t("settings.graphicsMode")}
        value={graphics.mode}
        onValueChange={(mode) => setGraphicsMode(mode as GraphicsMode)}
      >
        {#each graphicsModes as each (each.mode)}
          <RadioGroup.Item
            value={each.mode}
            class="rounded-ui border border-transparent px-3 py-0.5 {graphics.mode === each.mode
              ? 'bg-selection text-normal'
              : 'bg-raised text-soft hover:border-muted'}"
          >
            {each.name}
          </RadioGroup.Item>
        {/each}
      </RadioGroup.Root>

      {@render heading(t("settings.uiScale"))}
      <RadioGroup.Root
        class="flex flex-wrap gap-1"
        orientation="horizontal"
        aria-label={t("settings.uiScale")}
        value={String(prefs.uiScale)}
        onValueChange={(percent) => setPref("uiScale", Number(percent))}
      >
        {#each uiScales as percent (percent)}
          <RadioGroup.Item
            value={String(percent)}
            class="rounded-ui border border-transparent px-2.5 py-0.5 font-mono text-mono {prefs.uiScale === percent
              ? 'bg-selection text-normal'
              : 'bg-raised text-soft hover:border-muted'}"
          >
            {percent}%
          </RadioGroup.Item>
        {/each}
      </RadioGroup.Root>

      {@render heading(t("settings.theme"))}
      <ThemePicker
        label={t("settings.theme")}
        options={themes}
        selected={theme}
        swatch={themeSwatch}
        onpick={ontheme}
      />
      {#if chosenGone}
        <p
          class="m-0 mt-1.5 rounded-ui bg-warning-background px-2.5 py-1.5 text-warning"
          data-testid="theme-gone"
        >
          {chosenRefused
            ? t("settings.theme.refused", { file: chosenRefused.file, name: theme.name })
            : t("settings.theme.missing", { id: prefs.theme, name: theme.name })}
        </p>
      {/if}
      <div class="mt-1.5 flex gap-1">
        <button
          type="button"
          class="rounded-ui border border-transparent bg-raised px-3 py-0.5 text-soft hover:border-muted"
          onclick={() => void openHome("themes")}
        >
          {t("settings.themesFolder")}
        </button>
        <button
          type="button"
          class="rounded-ui border border-transparent bg-raised px-3 py-0.5 text-soft hover:border-muted"
          title={t("settings.copyThemeTitle")}
          onclick={() => void copyTheme(theme)}
        >
          {t("settings.copyTheme")}
        </button>
      </div>
      {#each themeFiles as each (each.file)}
        {#if each.replaces || each.problems.length > 0}
          <div class="mt-1.5 flex flex-col gap-1" data-testid="theme-file">
            {#if each.replaces}
              <p class="m-0 text-muted">{t("settings.themeFile.replaces", { file: each.file })}</p>
            {/if}
            {#if each.problems.length > 0}
              <div class="flex flex-col gap-0.5 rounded-ui bg-warning-background px-2.5 py-1.5 text-warning">
                <p class="m-0">{themeFileHead(each)}</p>
                {#each each.problems as problem, index (index)}
                  <p class="m-0 pl-3">{themeProblemText(problem)}</p>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}

      <!-- Scripts have a theme of their own (Sven, 2026-10-31): Dark Plus, or Light Plus under a light theme, until one
           is chosen (Sven, 2026-11-02). -->
      {@render heading(t("settings.codeTheme"))}
      {#if shownCodeTheme}
        <ThemePicker
          label={t("settings.codeTheme")}
          options={loadedCodeThemes}
          selected={shownCodeTheme}
          swatch={codeSwatch}
          onpick={(each) => setPref("codeTheme", each.id)}
        />
      {/if}

      {#if shells.length > 0}
        {@render heading(t("settings.terminalShell"))}
        <div class="w-72">
          <Select
            options={shells.map((shell) => ({ value: shell.id, label: shell.name }))}
            value={prefs.terminalShell || (shells[0] as Shell).id}
            label={t("settings.terminalShell")}
            tone="border-transparent bg-field text-normal hover:border-muted"
            compact
            named
            onpick={(id) => setPref("terminalShell", id)}
          />
        </div>
      {/if}

      <!-- The team colour models are shown in at first (Sven, 2026-10-29). -->
      {@render heading(t("settings.teamColour"))}
      <TeamColourGrid value={prefs.teamColor} onpick={(index) => setPref("teamColor", index)} />

      <!-- The switches, together at the bottom (Sven, 2026-10-29). -->
      {@render heading(t("settings.switches"))}
      <div class="flex flex-col gap-1.5">
        {#each switches as each (each.key)}
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs[each.key]}
              onchange={(event) => setPref(each.key, event.currentTarget.checked)}
            />
            {each.text}
          </label>
        {/each}
      </div>
    {:else if tab === "hotkeys"}
      {#if hotkeyProblems.length > 0}
        <div
          class="mb-2 flex flex-col gap-0.5 rounded-ui bg-warning-background px-2.5 py-1.5 text-warning"
          data-testid="hotkey-problems"
        >
          {#each hotkeyProblems as each (each.key ?? each.code)}
            <p class="m-0">{hotkeyProblemText(each)}</p>
          {/each}
        </div>
      {/if}
      <div class="flex flex-col">
        {#each actionList as each (each.action)}
          {@const keys = keymap[each.action]}
          {@const changed = keys.join("|") !== each.keys.join("|")}
          {@const clash = keys.flatMap((key) => clashes(keymap, each.action, key))}
          <div class="flex items-center gap-2 border-t border-line py-1 first:border-t-0">
            <span class="min-w-0 flex-1 truncate {changed ? 'text-changed' : 'text-soft'}">{each.name}</span>
            {#if clash.length > 0}
              <span class="text-small text-warning" title={t("settings.clashTitle")}>
                {t("settings.clash", {
                  action: actionList.find((other) => other.action === clash[0])?.name ?? "",
                })}
              </span>
            {/if}
            <button
              type="button"
              class="min-w-28 rounded-ui border px-2 py-0.5 text-right font-mono text-mono {listening === each.action
                ? 'border-accent bg-field text-accent-text'
                : 'border-transparent bg-field text-normal hover:border-muted'}"
              onclick={() => (listening = listening === each.action ? null : each.action)}
            >
              {listening === each.action
                ? t("settings.pressKey")
                : keys.map(shownKey).join(", ") || t("settings.noKeys")}
            </button>
            <button
              type="button"
              class="rounded-ui p-1 text-faint hover:text-normal disabled:opacity-30"
              title={t("settings.resetTitle", {
                keys: each.keys.map(shownKey).join(", ") || t("settings.noKeys"),
              })}
              aria-label={t("settings.resetLabel", { action: each.name })}
              disabled={!changed}
              onclick={() => setKeys(each.action, [...each.keys])}
            >
              <RotateCcw size={13} />
            </button>
          </div>
        {/each}
      </div>
      <button type="button" class="mt-3 text-muted hover:text-normal" onclick={resetAll}>
        {t("settings.resetAll")}
      </button>
    {:else if tab === "map"}
      {#if map}
        {@render row(t("settings.map.name"), map.title || map.name)}
        {@render row(t("settings.map.path"), map.path, true)}
        {@render row(
          t("settings.map.kind"),
          `${map.archive ? t("settings.map.archive") : t("settings.map.folder")}${map.expansion === true ? t("settings.map.expansion") : map.expansion === false ? t("settings.map.roc") : ""}`,
        )}
        {#if map.options}
          {@render row(t("settings.map.dataSet"), map.options.dataSet)}
          {@render row(t("settings.map.dataVersion"), map.options.dataVersion)}
          {@render row(
            t("settings.map.gameValues"),
            t("settings.map.gameValuesFrom", {
              tables: tableNames[map.options.values] ?? map.options.values,
            }),
          )}
          {@render row(
            t("settings.map.gameObjects"),
            t("settings.map.gameObjectsIn", {
              tables: tableNames[map.options.objects] ?? map.options.objects,
            }),
          )}
        {:else}
          {@render row(t("settings.map.gameData"), t("settings.map.gameDataUnknown"))}
        {/if}
        {@render row(
          t("settings.map.customObjects"),
          customKinds.length === 0
            ? t("settings.map.customNone")
            : customKinds
                .map((kind) =>
                  t("settings.map.customCount", {
                    count: String(map.counts[kind]),
                    kind: kindNames[kind].toLowerCase(),
                  }),
                )
                .join(", "),
        )}
        {#if map.problems.length > 0}
          {@render row(
            t("settings.map.problems"),
            t("settings.map.problemsCount", { count: map.problems.length }),
          )}
        {/if}
      {:else}
        <p class="m-0 text-faint">{t("settings.map.none")}</p>
      {/if}
    {:else}
      {@render row(t("settings.data.folder"), data?.source ?? t("settings.data.noneChosen"), true)}
      {#if data?.game}
        {@render row(t("settings.data.game"), data.game, true)}
      {/if}
      {@render row(
        t("settings.data.state"),
        data?.error
          ? t("settings.data.failed", { error: data.error })
          : data?.loaded
            ? t("settings.data.loaded")
            : t("settings.data.loading"),
      )}
      <button
        type="button"
        class="mt-3 rounded-ui border border-transparent bg-raised px-3 py-0.5 text-soft hover:border-muted"
        onclick={onchoose}
      >
        {t("settings.data.change")}
      </button>
    {/if}
  </div>
</Dialog>
