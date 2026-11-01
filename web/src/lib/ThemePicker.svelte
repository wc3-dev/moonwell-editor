<script lang="ts">
/** A theme's button in the settings and the list that opens under it, for the interface's theme and the code theme. */
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Popover from "./Popover.svelte";
import type { Theme } from "./themes.ts";

type Props = {
  label: string;
  options: Theme[];
  selected: Theme;
  onpick: (theme: Theme) => void;
};

let { label, options, selected, onpick }: Props = $props();

let open = $state(false);
let button: HTMLButtonElement | undefined = $state();

const swatch = [
  "bg",
  "surface",
  "accent",
  "changed",
  "kind-unit",
  "kind-item",
  "kind-ability",
] as const;
</script>

{#snippet palette(each: Theme)}
  <span class="flex shrink-0 overflow-hidden rounded-sm border border-black/30">
    {#each swatch as token (token)}
      <span class="h-4 w-2.5" style:background={each.colors[token]}></span>
    {/each}
  </span>
{/snippet}

<button
  type="button"
  class="flex w-72 items-center gap-2 rounded-md border border-line bg-bg px-2 py-1.5 text-left hover:border-muted"
  aria-label={label}
  aria-haspopup="listbox"
  aria-expanded={open}
  bind:this={button}
  onclick={() => (open = !open)}
>
  {@render palette(selected)}
  <span class="min-w-0 flex-1 truncate text-fg">{selected.name}</span>
  <ChevronDown size={14} class="text-faint" />
</button>
{#if open && button}
  <Popover anchor={button} onclose={() => (open = false)} large>
    <div class="flex w-[272px] flex-col" role="listbox" aria-label={label}>
      {#each options as each (each.id)}
        <button
          type="button"
          role="option"
          aria-selected={each.id === selected.id}
          class="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-hover"
          onclick={() => {
            onpick(each);
            open = false;
          }}
        >
          {@render palette(each)}
          <span class="min-w-0 flex-1 truncate {each.id === selected.id ? 'text-fg' : ''}">{each.name}</span>
          {#if each.id === selected.id}<Check size={14} class="shrink-0 text-accent-hi" />{/if}
        </button>
      {/each}
    </div>
  </Popover>
{/if}
