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
import { type Kind, kinds, type MapInfo, uiScale } from "../api.ts";
import { type CodeTheme, codeColors, codeThemeOf, codeThemes } from "../codeThemes.ts";
import { graphics, graphicsModes, setGraphicsMode } from "../graphics.svelte.ts";
import TeamColourGrid from "../objects/TeamColourGrid.svelte";
import { kindNames } from "../objects/tree.ts";
import { prefs, setPref, uiScales } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import { type Theme, themes } from "../themes.ts";
import Dialog from "../ui/Dialog.svelte";
import DialogButton from "../ui/DialogButton.svelte";
import Popover from "../ui/Popover.svelte";
import type { GameDataState } from "./gameData.ts";
import {
  type Action,
  actionList,
  clashes,
  defaultKeymap,
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

const customKinds = $derived(map ? kinds.filter((kind: Kind) => (map.counts[kind] ?? 0) > 0) : []);

// The switches under Other.
const switches = [
  { key: "confirm", text: t("settings.confirm") },
  { key: "alphaNotice", text: t("settings.alphaNotice") },
  { key: "experimental", text: t("settings.experimental") },
] as const;

// The code themes: the interface's own (an empty id), then every one VS Code has.
const sameTheme = $derived<CodeTheme>({
  ...codeThemeOf("", theme),
  id: "",
  name: t("settings.codeThemeSame"),
});
const codeThemeChoices = $derived([sameTheme, ...codeThemes]);

const themeSwatch = ({ colors }: Theme): string[] =>
  (["bg", "surface", "accent", "changed", "kind-unit", "kind-item", "kind-ability"] as const).map(
    (token) => colors[token],
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
    <span class="min-w-0 break-words {mono ? 'font-mono text-mono' : ''} text-fg">{value}</span>
  </div>
{/snippet}

{#snippet heading(text: string)}
  <h3 class="m-0 mt-2.5 mb-[3px] font-semibold text-fg first:mt-1">{text}</h3>
{/snippet}

<Dialog
  title={t("settings.title")}
  oncancel={() => (listening ? (listening = null) : onclose())}
  wide
  focus={false}
>
  <div class="mb-2 flex border-b border-line" role="tablist">
    {#each tabs as each (each.tab)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === each.tab}
        class="-mb-px rounded-t-ui border-b px-2.5 py-0.5 {tab === each.tab
          ? 'border-transparent bg-raised text-fg'
          : 'border-line text-muted hover:text-fg'}"
        onclick={() => (tab = each.tab)}
      >
        {each.name}
      </button>
    {/each}
  </div>

  <div class="min-h-[300px]">
    {#if tab === "general"}
      {@render heading(t("settings.graphicsMode"))}
      <div class="flex gap-1" role="radiogroup" aria-label={t("settings.graphicsMode")}>
        {#each graphicsModes as each (each.mode)}
          <button
            type="button"
            role="radio"
            aria-checked={graphics.mode === each.mode}
            class="rounded-ui border border-transparent px-3 py-0.5 {graphics.mode === each.mode
              ? 'bg-select text-fg'
              : 'bg-raised text-body hover:border-muted'}"
            onclick={() => setGraphicsMode(each.mode)}
          >
            {each.name}
          </button>
        {/each}
      </div>

      {@render heading(t("settings.uiScale"))}
      <div class="flex flex-wrap gap-1" role="radiogroup" aria-label={t("settings.uiScale")}>
        {#each uiScales as percent (percent)}
          <button
            type="button"
            role="radio"
            aria-checked={prefs.uiScale === percent}
            class="rounded-ui border border-transparent px-2.5 py-0.5 font-mono text-mono {prefs.uiScale === percent
              ? 'bg-select text-fg'
              : 'bg-raised text-body hover:border-muted'}"
            onclick={() => {
              setPref("uiScale", percent);
              uiScale(percent).catch(() => {});
            }}
          >
            {percent}%
          </button>
        {/each}
      </div>

      {@render heading(t("settings.theme"))}
      <ThemePicker
        label={t("settings.theme")}
        options={themes}
        selected={theme}
        swatch={themeSwatch}
        onpick={ontheme}
      />

      <!-- Scripts have a theme of their own, the interface's until one is chosen (Sven, 2026-10-31). -->
      {@render heading(t("settings.codeTheme"))}
      <ThemePicker
        label={t("settings.codeTheme")}
        options={codeThemeChoices}
        selected={codeThemeChoices.find((each) => each.id === prefs.codeTheme) ?? sameTheme}
        swatch={codeSwatch}
        onpick={(each) => setPref("codeTheme", each.id)}
      />

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
      <div class="flex flex-col">
        {#each actionList as each (each.action)}
          {@const keys = keymap[each.action]}
          {@const changed = keys.join("|") !== each.keys.join("|")}
          {@const clash = keys.flatMap((key) => clashes(keymap, each.action, key))}
          <div class="flex items-center gap-2 border-t border-line py-1 first:border-t-0">
            <span class="min-w-0 flex-1 truncate {changed ? 'text-changed' : 'text-body'}">{each.name}</span>
            {#if clash.length > 0}
              <span class="text-small text-warn" title={t("settings.clashTitle")}>
                {t("settings.clash", {
                  action: actionList.find((other) => other.action === clash[0])?.name ?? "",
                })}
              </span>
            {/if}
            <button
              type="button"
              class="min-w-28 rounded-ui border px-2 py-0.5 text-right font-mono text-mono {listening === each.action
                ? 'border-accent bg-field text-accent-hi'
                : 'border-transparent bg-field text-fg hover:border-muted'}"
              onclick={() => (listening = listening === each.action ? null : each.action)}
            >
              {listening === each.action
                ? t("settings.pressKey")
                : keys.map(shownKey).join(", ") || t("settings.noKeys")}
            </button>
            <button
              type="button"
              class="rounded-ui p-1 text-faint hover:text-fg disabled:opacity-30"
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
      <button type="button" class="mt-3 text-muted hover:text-fg" onclick={resetAll}>
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
        class="mt-3 rounded-ui border border-transparent bg-raised px-3 py-0.5 text-body hover:border-muted"
        onclick={onchoose}
      >
        {t("settings.data.change")}
      </button>
    {/if}
  </div>

  {#snippet actions()}
    <DialogButton look="primary" onclick={onclose}>{t("settings.done")}</DialogButton>
  {/snippet}
</Dialog>
