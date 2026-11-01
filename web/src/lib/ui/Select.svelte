<script lang="ts" module>
/** One choice of a `Select`: its value, its label and the group it is under. */
export type SelectOption = { value: string; label: string; group?: string };
</script>

<script lang="ts">
/**
 * A dropdown in the page's colours (Sven, 2026-10-27), on Bits UI's select (Sven, 2026-10-28): a button as wide as its
 * widest choice (the values are in a fixed-width font, so that is its length in characters) that opens the list on
 * it, or above it when there is no room below, as one shape (`.dropdown` in app.css, Sven, 2026-11-01). The list takes
 * the arrows, Home, End, Enter, Esc and typed letters; choices can sit under group headings.
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import { Select } from "bits-ui";
import type { Snippet } from "svelte";

type Props = {
  options: SelectOption[];
  value: string;
  onpick: (value: string) => void;
  /** The name for screen readers. */
  label: string;
  /** What the button shows for a value none of the options has. */
  missing?: string;
  /** Classes for the button's border, background and text colour. */
  tone?: string;
  /** True in a level grid's cell: as wide as the cell allows. */
  compact?: boolean;
  /** The `data-field` the details panel finds the editor by. */
  field?: string;
  /** True when there is nothing to pick: the button shows `missing` and does not open. */
  disabled?: boolean;
  /** As wide as the choice shown, not the widest one (a field's dropdown, Sven, 2026-10-29); the widest while open. */
  snug?: boolean;
  /** In the interface's font: for names, where the values are in the fixed-width one. */
  named?: boolean;
  /** What stands before a choice's label, in the button and the list, by its value. */
  leading?: Snippet<[string]>;
};

let {
  options,
  value,
  onpick,
  label,
  missing = value,
  tone = "",
  compact = false,
  field,
  disabled = false,
  snug = false,
  named = false,
  leading,
}: Props = $props();

let open = $state(false);

const chosen = $derived(options.find((option) => option.value === value));
// The widest label, in characters (and one spare, so it is never cut); the padding, border, gaps and chevron take 32
// pixels.
const width = $derived(
  `calc(${Math.max(4, ...(snug && !open ? [(chosen?.label ?? missing).length] : [missing.length, ...options.map((option) => option.label.length)])) + 1}ch + 32px)`,
);
</script>

<Select.Root
  type="single"
  {value}
  bind:open
  onValueChange={(picked) => picked !== value && onpick(picked)}
  items={options}
  {disabled}
>
  <Select.Trigger
    class="dropdown flex min-w-0 cursor-pointer items-center gap-1 rounded-ui border py-px pr-1 pl-1.5 text-left {named
      ? ''
      : 'font-mono text-mono'} focus:border-solid focus:border-accent focus:outline-none disabled:cursor-default disabled:text-faint {tone} {compact
      ? 'w-full'
      : 'max-w-full'}"
    style={compact ? undefined : `width: ${width}`}
    data-field={field}
    aria-label={label}
  >
    {#if leading}{@render leading(value)}{/if}
    <span class="min-w-0 flex-1 truncate" title={chosen?.label ?? missing}>{chosen?.label ?? missing}</span>
    <ChevronDown size={12} class="shrink-0 text-faint" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      side="bottom"
      align="start"
      sideOffset={0}
      collisionPadding={8}
      data-popup
      class="dropdown-list z-40 w-max max-w-[360px] rounded-ui border border-line bg-surface p-0.5 text-body outline-none"
    >
      <Select.Viewport class="max-h-[306px]">
        {#each options as option, index (index)}
          {#if option.group && option.group !== options[index - 1]?.group}
            <div class="px-1 pt-1.5 pb-0.5 text-small text-faint" role="presentation">
              {option.group}
            </div>
          {/if}
          <Select.Item
            value={option.value}
            label={option.label}
            class="flex cursor-pointer items-center gap-1 py-0.5 pr-2 outline-none data-highlighted:bg-select data-highlighted:text-fg data-selected:text-accent-hi {option.group
              ? 'pl-3'
              : 'pl-1'}"
          >
            {#if leading}{@render leading(option.value)}{/if}
            <span class="truncate" title={option.label}>{option.label}</span>
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
