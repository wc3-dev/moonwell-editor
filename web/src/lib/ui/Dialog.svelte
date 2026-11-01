<script lang="ts">
/**
 * A small dialog over the page: a title, its text and its buttons, on Bits UI's dialog (Sven, 2026-10-28). Esc or a
 * click on the veil cancels; the first input, else the first button, gets the focus when it opens, Tab stays inside
 * it, and the focus goes back where it was when it closes. It stays open until the page takes it away: a cancel the
 * page does not act on (the settings' Esc while a hotkey is being pressed) leaves it there, where Bits UI had closed
 * it on its own and the page, still thinking it open, could not open it again (Sven, 2026-10-29).
 */
import { Dialog } from "bits-ui";
import type { Component, Snippet } from "svelte";

type Props = {
  title: string;
  oncancel: () => void;
  children: Snippet;
  actions: Snippet;
  /** A wider dialog that scrolls when it is taller than the window (the settings). */
  wide?: boolean;
  /** A short text beside the title, in the ids' type (an object's id). */
  note?: string;
  /** A large dialog that scrolls when it is taller than the window (the tooltip editor). */
  large?: boolean;
  /** An icon before the title (the alpha notice's warning). */
  icon?: Component<{ size?: number; class?: string }>;
  /** False when nothing in it takes the focus as it opens, only the dialog itself (the settings, Sven, 2026-10-29). */
  focus?: boolean;
};

let {
  title,
  oncancel,
  children,
  actions,
  wide = false,
  note,
  large = false,
  icon: Icon,
  focus = true,
}: Props = $props();

let box: HTMLDivElement | null = $state(null);
let open = $state(true);

function onOpenChange(next: boolean): void {
  if (next) return;
  open = true;
  oncancel();
}

// The first input (its text selected), else the button marked primary, else the first button; or the dialog itself.
function focusFirst(event: Event): void {
  event.preventDefault();
  if (!focus) {
    box?.focus();
    return;
  }
  const first =
    box?.querySelector<HTMLElement>("input, select, textarea") ??
    box?.querySelector<HTMLElement>("[data-primary]") ??
    box?.querySelector<HTMLElement>("button");
  first?.focus();
  if (first instanceof HTMLInputElement) first.select();
}
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-30 bg-black/30" />
    <Dialog.Content
      bind:ref={box}
      tabindex={-1}
      onOpenAutoFocus={focusFirst}
      class="fixed left-1/2 z-30 -translate-x-1/2 {large
        ? 'top-[60px] max-h-[calc(100%-90px)] w-[760px] overflow-auto'
        : wide
          ? 'top-[60px] max-h-[calc(100%-90px)] w-[620px] overflow-auto'
          : 'top-[120px] w-[460px]'} max-w-[calc(100%-32px)] rounded-ui border border-line bg-surface px-2.5 pb-2.5 outline-none"
    >
      <Dialog.Title
        class="-mx-2.5 mt-0 mb-2 flex gap-2 bg-raised px-2 py-[3px] font-semibold text-fg {Icon ? 'items-center' : 'items-baseline'}"
      >
        {#if Icon}<Icon size={14} class="shrink-0 text-changed" />{/if}
        {title}
        {#if note}<span class="font-mono text-mono font-normal text-muted">{note}</span>{/if}
      </Dialog.Title>
      <div class="text-body">{@render children()}</div>
      <div class="mt-2.5 flex justify-end gap-1.5">{@render actions()}</div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
