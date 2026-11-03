<script lang="ts">
/**
 * The terminal panel under the page (Sven, 2026-11-01): a tab for each shell, a button for a new one and a list of the
 * other shells on this PC. Its top edge drags to change its height, which is remembered in `state.json`.
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Plus from "@lucide/svelte/icons/plus";
import X from "@lucide/svelte/icons/x";
import { Tabs } from "bits-ui";
import { getEditor } from "../app/editor.svelte.ts";
import { setState, stateOf } from "../home/state.svelte.ts";
import { t } from "../text.ts";
import { terminalShells } from "./api.ts";
import TerminalView from "./TerminalView.svelte";

const editor = getEditor();
const { terminals } = editor;

const lowest = 100;
const isHeight = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
let height = $state(stateOf("terminalHeight", 240, isHeight));

// The page keeps its toolbar and status bar and some room of its own.
function fitting(wanted: number): number {
  return Math.max(lowest, Math.min(wanted, window.innerHeight - 200));
}

function startDrag(event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement;
  const from = event.clientY;
  const started = height;
  handle.setPointerCapture(event.pointerId);
  const move = (each: PointerEvent) => (height = fitting(started + from - each.clientY));
  const stop = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", stop);
    setState("terminalHeight", height);
    terminals.focusAsked++;
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop);
}

async function pickShell(button: HTMLElement): Promise<void> {
  const box = button.getBoundingClientRect();
  const shells = await terminalShells();
  editor.menu = {
    x: box.left,
    y: box.top,
    items: shells.map((shell) => ({ label: shell.name, run: () => terminals.add(shell.id) })),
  };
}

const iconButton = "rounded-ui p-1 text-muted hover:bg-hover hover:text-normal";
</script>

<div class="min-h-0">
  {#if terminals.tabs.length > 0}
    <section
      class="relative mx-1 mb-1 flex flex-col overflow-hidden rounded-ui bg-panel {terminals.open ? '' : 'hidden'}"
      style:height="{fitting(height)}px"
      aria-label={t("terminal.label")}
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-x-0 top-0 z-10 h-1 cursor-row-resize"
        title={t("terminal.resize")}
        onpointerdown={startDrag}
      ></div>
      <Tabs.Root
        class="shrink-0"
        value={String(terminals.active)}
        onValueChange={(key) => terminals.show(Number(key))}
      >
        <Tabs.List class="flex items-center gap-0.5 bg-raised px-1" aria-label={t("terminal.label")}>
          {#each terminals.tabs as tab (tab.key)}
            {@const active = tab.key === terminals.active}
            {@const name = tab.name || t("terminal.label")}
            <!-- A click or Enter on the tab already shown still puts the cursor in its shell. -->
            <Tabs.Trigger
              value={String(tab.key)}
              onclick={() => terminals.show(tab.key)}
              onkeydown={(event) => event.key === "Enter" && terminals.show(tab.key)}
            >
              {#snippet child({ props })}
                <div
                  {...props}
                  class="flex cursor-default items-center gap-1 px-2 py-0.5 {active ? 'bg-panel text-normal' : 'text-muted hover:text-normal'}"
                >
                  {name}
                  <button
                    type="button"
                    class="rounded-ui text-faint hover:text-normal"
                    title={t("terminal.close", { name })}
                    aria-label={t("terminal.close", { name })}
                    onclick={(event) => {
                      event.stopPropagation();
                      terminals.close(tab.key);
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              {/snippet}
            </Tabs.Trigger>
          {/each}
          <button
            type="button"
            class={iconButton}
            title={t("terminal.new")}
            aria-label={t("terminal.new")}
            onclick={() => terminals.add()}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            class={iconButton}
            title={t("terminal.pickShell")}
            aria-label={t("terminal.pickShell")}
            aria-haspopup="menu"
            onclick={(event) => pickShell(event.currentTarget)}
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            class="{iconButton} ml-auto"
            title={t("terminal.hide")}
            aria-label={t("terminal.hide")}
            onclick={terminals.toggle}
          >
            <X size={13} />
          </button>
        </Tabs.List>
      </Tabs.Root>
      <div class="relative m-1 min-h-0 flex-1">
        {#each terminals.tabs as tab (tab.key)}
          <TerminalView {tab} />
        {/each}
      </div>
    </section>
  {/if}
</div>
