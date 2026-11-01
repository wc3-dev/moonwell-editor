<script lang="ts">
/**
 * The row above an object's fields that narrows them (Sven, 2026-11-01): by name, id or value, to what changed, to the
 * favourites and by category, with named presets of all four.
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import PencilLine from "@lucide/svelte/icons/pencil-line";
import Star from "@lucide/svelte/icons/star";
import X from "@lucide/svelte/icons/x";
import type { Component } from "svelte";
import type { Kind } from "../api.ts";
import { t, tCount } from "../text.ts";
import Popover from "../ui/Popover.svelte";
import type { FieldFilters, FieldPreset } from "./fieldFilters.svelte.ts";

type Props = {
  kind: Kind;
  /** The object's categories, in the order the panel shows them. */
  categories: { key: string; name: string }[];
  filters: FieldFilters;
  text: string;
  changedOnly: boolean;
  favouritesOnly: boolean;
  /** The categories picked, by key; none shows them all. */
  chosen: string[];
};

let {
  kind,
  categories,
  filters,
  text = $bindable(),
  changedOnly = $bindable(),
  favouritesOnly = $bindable(),
  chosen = $bindable(),
}: Props = $props();

let box: HTMLInputElement | undefined = $state();
let categoryButton: HTMLButtonElement | undefined = $state();
let presetButton: HTMLButtonElement | undefined = $state();
let open = $state<"categories" | "presets" | null>(null);
let presetName = $state("");

const filtering = $derived(text !== "" || changedOnly || favouritesOnly || chosen.length > 0);

/** Puts the cursor in the name box (Ctrl F). */
export function focus(): void {
  box?.focus();
  box?.select();
}

/** Takes every filter off. */
export function clear(): void {
  text = "";
  changedOnly = false;
  favouritesOnly = false;
  chosen = [];
}

function clearOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape" && text) {
    event.stopPropagation();
    text = "";
  }
}

function toggleCategory(key: string): void {
  chosen = chosen.includes(key) ? chosen.filter((each) => each !== key) : [...chosen, key];
}

function savePreset(): void {
  const name = presetName.trim();
  if (name === "") return;
  filters.savePreset(kind, { name, text, changedOnly, favouritesOnly, categories: chosen });
  presetName = "";
}

function apply(preset: FieldPreset): void {
  text = preset.text;
  changedOnly = preset.changedOnly;
  favouritesOnly = preset.favouritesOnly;
  chosen = preset.categories;
  open = null;
}

const iconButton = "shrink-0 rounded-ui p-[3px]";
const unpressed = "text-muted hover:bg-hover hover:text-fg";
const dropdownButton =
  "dropdown flex h-[22px] shrink-0 cursor-pointer items-center gap-1 rounded-ui border border-transparent bg-field px-1.5 text-body hover:border-muted";
</script>

{#snippet toggle(label: string, Icon: Component<{ size?: number }>, pressed: boolean, onclick: () => void)}
  <button
    type="button"
    class="{iconButton} {pressed ? 'bg-accent-lo text-accent-hi' : unpressed}"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    {onclick}
  >
    <Icon size={14} />
  </button>
{/snippet}

<div class="mt-1 flex items-center gap-1">
  <input
    class="w-full min-w-0 flex-1 rounded-ui border border-transparent bg-field px-2 py-px text-fg outline-none focus:border-accent"
    placeholder={t("details.filterPlaceholder")}
    aria-label={t("details.filterLabel")}
    bind:this={box}
    bind:value={text}
    onkeydown={clearOnEscape}
  />
  {@render toggle(t("details.changedOnly"), PencilLine, changedOnly, () => (changedOnly = !changedOnly))}
  {@render toggle(t("details.favouritesOnly"), Star, favouritesOnly, () => (favouritesOnly = !favouritesOnly))}
  <button
    type="button"
    class={dropdownButton}
    aria-label={t("details.categories")}
    aria-expanded={open === "categories"}
    bind:this={categoryButton}
    onclick={() => (open = open === "categories" ? null : "categories")}
  >
    {chosen.length === 0 ? t("details.allCategories") : tCount("details.categoryCount", chosen.length)}
    <ChevronDown size={12} class="text-faint" />
  </button>
  <button
    type="button"
    class={dropdownButton}
    aria-label={t("details.presets")}
    aria-expanded={open === "presets"}
    bind:this={presetButton}
    onclick={() => (open = open === "presets" ? null : "presets")}
  >
    {t("details.presets")}
    <ChevronDown size={12} class="text-faint" />
  </button>
  {#if filtering}
    <button
      type="button"
      class="{iconButton} {unpressed}"
      title={t("details.clearFilters")}
      aria-label={t("details.clearFilters")}
      onclick={clear}
    >
      <X size={14} />
    </button>
  {/if}
</div>

{#if open === "categories" && categoryButton}
  <Popover anchor={categoryButton} dropdown onclose={() => (open = null)}>
    <div class="flex min-w-40 flex-col">
      {#each categories as category (category.key)}
        <label class="flex items-center gap-2 rounded-ui px-1 py-0.5 hover:bg-hover">
          <input
            type="checkbox"
            checked={chosen.includes(category.key)}
            onchange={() => toggleCategory(category.key)}
          />
          {category.name}
        </label>
      {/each}
    </div>
  </Popover>
{/if}

{#if open === "presets" && presetButton}
  <Popover anchor={presetButton} dropdown onclose={() => (open = null)}>
    <div class="flex w-60 flex-col gap-1">
      {#each filters.presets(kind) as preset (preset.name)}
        <div class="flex items-center rounded-ui hover:bg-hover">
          <button
            type="button"
            class="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-fg"
            title={preset.name}
            onclick={() => apply(preset)}
          >
            {preset.name}
          </button>
          <button
            type="button"
            class="shrink-0 rounded-ui p-1 text-faint hover:text-warn"
            title={t("details.deletePreset", { name: preset.name })}
            aria-label={t("details.deletePreset", { name: preset.name })}
            onclick={() => filters.deletePreset(kind, preset.name)}
          >
            <X size={12} />
          </button>
        </div>
      {:else}
        <p class="m-0 px-1 py-0.5 text-muted">{t("details.noPresets")}</p>
      {/each}
      <div class="flex items-center gap-1 border-t border-line pt-1">
        <input
          class="min-w-0 flex-1 rounded-ui border border-transparent bg-field px-1.5 py-px text-fg outline-none focus:border-accent"
          placeholder={t("details.presetName")}
          aria-label={t("details.presetName")}
          bind:value={presetName}
          onkeydown={(event) => event.key === "Enter" && savePreset()}
        />
        <button
          type="button"
          class="shrink-0 rounded-ui border border-transparent bg-raised px-2 text-body hover:border-muted disabled:opacity-40 disabled:hover:border-transparent"
          aria-label={t("details.savePreset")}
          title={t("details.savePreset")}
          disabled={presetName.trim() === ""}
          onclick={savePreset}
        >
          {t("details.save")}
        </button>
      </div>
    </div>
  </Popover>
{/if}
