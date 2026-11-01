<script lang="ts" generics="T extends { id: string; name: string }">
/** A theme's dropdown in the settings, for the interface's theme and the code theme: the name beside its colours. */
import Select from "../ui/Select.svelte";

type Props = {
  label: string;
  options: T[];
  selected: T;
  /** The colours that stand for a theme in the list. */
  swatch: (theme: T) => string[];
  onpick: (theme: T) => void;
};

let { label, options, selected, swatch, onpick }: Props = $props();

// By place in the list: a Select's value cannot be empty, and the code theme's first choice has no id.
const choices = $derived(options.map((each, index) => ({ value: String(index), label: each.name })));
const value = $derived(String(options.findIndex((each) => each.id === selected.id)));
const themeAt = (index: string): T => options[Number(index)] as T;
</script>

{#snippet palette(index: string)}
  <span class="mr-1 flex shrink-0 overflow-hidden rounded-ui border border-black/30">
    {#each swatch(themeAt(index)) as color, each (each)}
      <span class="h-4 w-2.5" style:background={color}></span>
    {/each}
  </span>
{/snippet}

<div class="w-72">
  <Select
    options={choices}
    {value}
    {label}
    tone="border-transparent bg-field text-fg hover:border-muted"
    compact
    named
    leading={palette}
    onpick={(index) => onpick(themeAt(index))}
  />
</div>
