<script lang="ts">
/** One tab's terminal. It stays on the page while another tab or the panel's hiding covers it, so its text stays. */
import { onMount } from "svelte";
import { getEditor } from "../app/editor.svelte.ts";
import { resizeTerminal, writeTerminal } from "./api.ts";
import type { TerminalTab } from "./terminals.svelte.ts";
import type { XtermView } from "./xterm.ts";

let { tab }: { tab: TerminalTab } = $props();

const { appearance, terminals } = getEditor();
const shown = $derived(terminals.open && terminals.active === tab.key);

let box: HTMLDivElement | undefined = $state();
let view = $state.raw<XtermView>();
let measured = "";

function measure(): void {
  const size = view?.fit();
  if (!size) return;
  const now = `${size.columns}x${size.rows}`;
  if (now === measured) return;
  measured = now;
  if (tab.id !== null) resizeTerminal(tab.id, size.columns, size.rows);
}

onMount(() => {
  let gone = false;
  const element = box as HTMLDivElement;
  import("./xterm.ts").then(({ openTerminal }) => {
    if (gone) return;
    view = openTerminal(element, {
      colors: appearance.terminalColors,
      ontype: (text) => {
        if (tab.id !== null) writeTerminal(tab.id, text);
      },
    });
    const size = view.fit() ?? { columns: 120, rows: 30 };
    measured = `${size.columns}x${size.rows}`;
    terminals.start(tab.key, size, (text) => view?.write(text));
  });
  const resized = new ResizeObserver(measure);
  resized.observe(element);
  return () => {
    gone = true;
    resized.disconnect();
    view?.dispose();
  };
});

$effect(() => view?.setColors(appearance.terminalColors));

$effect(() => {
  void terminals.focusAsked;
  if (!shown || !view) return;
  measure();
  view.focus();
});
</script>

<div class="absolute inset-0 {shown ? '' : 'invisible'}" bind:this={box}></div>
