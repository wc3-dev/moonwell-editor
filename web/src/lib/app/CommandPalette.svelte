<script lang="ts">
/**
 * One box to run any command by name (Sven, 2026-11-01), on Bits UI's command list: typing narrows the list by the
 * letters of a name, the arrow keys move and Enter runs. It lists what can run where the user is, as it was when it
 * opened. Esc, a click beside it or its own key closes it, and the focus goes back where it was before a command runs,
 * so a command that moves the focus keeps it.
 */
import { Command } from "bits-ui";
import { t } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";
import { type Action, actionOf, shownKey } from "./keymap.ts";

const editor = getEditor();
const commands = editor.commands();
const before = document.activeElement;
let input = $state<HTMLInputElement | null>(null);

$effect(() => input?.focus());

function close(): void {
  editor.paletteOpen = false;
  if (before instanceof HTMLElement) before.focus();
}

function choose(action: Action): void {
  close();
  editor.runCommand(action);
}

function onkeydown(event: KeyboardEvent): void {
  if (event.key === "Tab") event.preventDefault();
  if (event.key === "Escape" || actionOf(event, editor.keymap) === "commandPalette") {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}
</script>

<div class="fixed inset-0 z-40 bg-black/30" role="presentation" data-testid="palette-veil" onclick={close}></div>
<div
  class="fixed top-[60px] left-1/2 z-40 w-[520px] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-ui border border-line bg-surface p-1 text-body"
  role="dialog"
  aria-label={t("palette.label")}
  tabindex="-1"
  {onkeydown}
>
  <Command.Root label={t("palette.label")} loop vimBindings={false}>
    <Command.Input
      bind:ref={input}
      class="w-full rounded-ui border border-transparent bg-field px-2 py-1 text-fg outline-none focus:border-accent"
      placeholder={t("palette.placeholder")}
    />
    <Command.List class="mt-1 max-h-[min(360px,calc(100vh-120px))] overflow-auto">
      <Command.Viewport>
        <Command.Empty class="px-2 py-1 text-muted">{t("palette.none")}</Command.Empty>
        {#each commands as each (each.action)}
          <Command.Item
            value={each.name}
            class="flex cursor-default items-center gap-6 px-2 py-0.5 outline-none data-selected:bg-select data-selected:text-fg"
            onSelect={() => choose(each.action)}
          >
            {each.name}
            {#if each.keys[0]}
              <span class="ml-auto font-mono text-mono text-faint">{shownKey(each.keys[0])}</span>
            {/if}
          </Command.Item>
        {/each}
      </Command.Viewport>
    </Command.List>
  </Command.Root>
</div>
