<script lang="ts">
/**
 * The "Open map…" button (with a label, or just its icon): it opens a small menu of the two ways a map is stored, a folder or an archive (see
 * `openMenu.ts`). Picking one closes the menu and hands the entry on.
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import FolderOpen from "@lucide/svelte/icons/folder-open";
import { t } from "../text.ts";
import Popover from "../ui/Popover.svelte";
import { type OpenEntry, openEntries } from "./openMenu.ts";

type Props = {
  /** The button's text; without one the button is just the folder icon, with "Open map…" as its tooltip. */
  label?: string;
  disabled: boolean;
  /** The button's classes (the header's and the empty page's differ). */
  buttonClass: string;
  onpick: (entry: OpenEntry) => void;
};

let { label, disabled, buttonClass, onpick }: Props = $props();

let open = $state(false);
let button: HTMLButtonElement | undefined = $state();
let menu: HTMLDivElement | undefined = $state();

// The menu opens with nothing in it focused (Sven, 2026-11-02): Tab or ↓ goes to its first entry, and Esc closes it.
function onkeydown(event: KeyboardEvent): void {
  if (!open || event.shiftKey || (event.key !== "Tab" && event.key !== "ArrowDown")) return;
  event.preventDefault();
  menu?.querySelector("button")?.focus();
}

function pick(entry: OpenEntry): void {
  open = false;
  onpick(entry);
}
</script>

<button
  type="button"
  class="dropdown border border-transparent {buttonClass}"
  {disabled}
  title={label ? undefined : t("openMenu.button")}
  aria-label={label ? undefined : t("openMenu.button")}
  aria-haspopup="menu"
  aria-expanded={open}
  bind:this={button}
  onclick={() => (open = !open)}
  {onkeydown}
>
  <FolderOpen size={label ? 16 : 17} />
  {#if label}
    {label}
    <ChevronDown size={14} class="text-muted" />
  {/if}
</button>
{#if open && button}
  <Popover anchor={button} onclose={() => (open = false)} dropdown>
    <div class="flex flex-col" role="menu" aria-label={t("openMenu.label")} bind:this={menu}>
      {#each openEntries as entry (entry.label)}
        <button
          type="button"
          role="menuitem"
          class="px-2 py-1 text-left hover:bg-selection hover:text-normal focus:bg-selection focus:text-normal focus:outline-none"
          onclick={() => pick(entry)}
        >
          {entry.label}
        </button>
      {/each}
    </div>
  </Popover>
{/if}
