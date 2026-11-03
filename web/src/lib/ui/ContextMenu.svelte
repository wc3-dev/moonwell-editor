<script module lang="ts">
/** One entry of a context menu; a `separator` draws a line instead. */
export type MenuItem =
  | { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; run: () => void }
  | { separator: true };
</script>

<script lang="ts">
/**
 * The menu a right click opens (Sven, 2026-10-27), at the pointer and kept inside the window, on Bits UI's dropdown
 * menu (Sven, 2026-10-28). The arrow keys and typed letters move between entries, Enter runs one; a click outside it
 * or Esc closes it. With an `anchor` it is that button's list instead, as one shape with it (`.menu-list` in app.css,
 * Sven, 2026-11-02).
 */
import { DropdownMenu } from "bits-ui";

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onclose: () => void;
  /** The button the menu is the list of (the header's); it closes it itself. */
  anchor?: HTMLElement;
};

let { x, y, items, onclose, anchor }: Props = $props();

// The point the menu opens at, as the box of nothing there.
const point = $derived({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) });
</script>

<DropdownMenu.Root open onOpenChange={(open) => !open && onclose()}>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      customAnchor={anchor ?? point}
      side="bottom"
      align={anchor ? "end" : "start"}
      collisionPadding={4}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => {
        if (event.target instanceof Node && anchor?.contains(event.target)) event.preventDefault();
      }}
      data-popup
      class="z-50 min-w-[210px] rounded-ui border border-line bg-panel p-0.5 text-soft outline-none {anchor
        ? 'menu-list'
        : ''}"
      oncontextmenu={(event) => event.preventDefault()}
    >
      {#each items as item, index (index)}
        {#if "separator" in item}
          <DropdownMenu.Separator class="mx-px my-0.5 h-px bg-line" />
        {:else}
          <DropdownMenu.Item
            disabled={item.disabled}
            textValue={item.label}
            onSelect={item.run}
            class="flex w-full cursor-default items-center gap-6 px-4 py-0.5 text-left outline-none data-disabled:opacity-40 data-highlighted:bg-selection data-highlighted:text-normal {item.danger
              ? 'text-warning'
              : ''}"
          >
            {item.label}
            {#if item.shortcut}
              <span class="ml-auto font-mono text-mono text-faint">{item.shortcut}</span>
            {/if}
          </DropdownMenu.Item>
        {/if}
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
