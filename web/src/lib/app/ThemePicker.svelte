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

const choices = $derived(options.map((each) => ({ value: each.id, label: each.name })));
const themeAt = (id: string): T => options.find((each) => each.id === id) as T;
</script>

{#snippet palette(id: string)}
  <span class="mr-1 flex shrink-0 overflow-hidden rounded-ui border border-line">
    {#each swatch(themeAt(id)) as color, each (each)}
      <span class="h-4 w-2.5" style:background={color}></span>
    {/each}
  </span>
{/snippet}

<div class="w-72">
  <Select
    options={choices}
    value={selected.id}
    {label}
    tone="border-transparent bg-field text-normal hover:border-muted"
    compact
    named
    leading={palette}
    onpick={(id) => onpick(themeAt(id))}
  />
</div>
