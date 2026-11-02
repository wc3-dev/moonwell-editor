<script lang="ts">
/**
 * The row above an object's fields that narrows them (Sven, 2026-11-01): by name, id or value, to what changed, and by
 * category, each of which shows until its eye is clicked (Sven, 2026-11-02).
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import PencilLine from "@lucide/svelte/icons/pencil-line";
import X from "@lucide/svelte/icons/x";
import { t, tCount } from "../text.ts";
import Popover from "../ui/Popover.svelte";

type Props = {
  /** The object's categories, in the order the panel shows them. */
  categories: { key: string; name: string }[];
  text: string;
  changedOnly: boolean;
  /** The categories hidden, by key. */
  hidden: string[];
};

let {
  categories,
  text = $bindable(),
  changedOnly = $bindable(),
  hidden = $bindable(),
}: Props = $props();

let box: HTMLInputElement | undefined = $state();
let categoryButton: HTMLButtonElement | undefined = $state();
let open = $state(false);

const filtering = $derived(text !== "" || changedOnly || hidden.length > 0);

/** Puts the cursor in the name box (Ctrl F). */
export function focus(): void {
  box?.focus();
  box?.select();
}

/** Takes every filter off. */
export function clear(): void {
  text = "";
  changedOnly = false;
  hidden = [];
}

function clearOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape" && text) {
    event.stopPropagation();
    text = "";
  }
}

function toggleCategory(key: string): void {
  hidden = hidden.includes(key) ? hidden.filter((each) => each !== key) : [...hidden, key];
}

const iconButton = "shrink-0 rounded-ui p-[3px]";
const unpressed = "text-muted hover:bg-hover hover:text-fg";
</script>

<div class="mt-1 flex items-center gap-1">
  <input
    class="w-full min-w-0 flex-1 rounded-ui border border-transparent bg-field px-2 py-px text-fg outline-none focus:border-accent"
    placeholder={t("details.filterPlaceholder")}
    aria-label={t("details.filterLabel")}
    bind:this={box}
    bind:value={text}
    onkeydown={clearOnEscape}
  />
  <button
    type="button"
    class="{iconButton} {changedOnly ? 'bg-accent-lo text-accent-hi' : unpressed}"
    title={t("details.changedOnly")}
    aria-label={t("details.changedOnly")}
    aria-pressed={changedOnly}
    onclick={() => (changedOnly = !changedOnly)}
  >
    <PencilLine size={14} />
  </button>
  <button
    type="button"
    class="dropdown flex h-[22px] shrink-0 cursor-pointer items-center gap-1 rounded-ui border border-transparent bg-field px-1.5 text-body hover:border-muted"
    aria-label={t("details.categories")}
    aria-expanded={open}
    bind:this={categoryButton}
    onclick={() => (open = !open)}
  >
    {hidden.length === 0 ? t("details.allCategories") : tCount("details.categoriesHidden", hidden.length)}
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

{#if open && categoryButton}
  <Popover anchor={categoryButton} dropdown onclose={() => (open = false)}>
    <div class="flex min-w-40 flex-col">
      {#each categories as category (category.key)}
        {@const off = hidden.includes(category.key)}
        <button
          type="button"
          class="flex items-center gap-2 rounded-ui px-1 py-0.5 text-left hover:bg-hover {off ? 'opacity-50' : ''}"
          aria-pressed={!off}
          onclick={() => toggleCategory(category.key)}
        >
          {#if off}<EyeOff size={13} />{:else}<Eye size={13} />{/if}
          {category.name}
        </button>
      {/each}
    </div>
  </Popover>
{/if}
