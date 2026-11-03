<script lang="ts">
/** A card as a node of the grid's Svelte Flow, and its name large when the grid is too far out to read it. */
import type { Node, NodeProps } from "@xyflow/svelte";
import type { CardView } from "./api.ts";
import { cardWidth, farZoom } from "./canvas.ts";
import { getGrid } from "./cards.ts";
import TriggerCard from "./TriggerCard.svelte";

let { data }: NodeProps<Node<{ card: CardView }>> = $props();

const grid = getGrid();
const card = $derived(data.card);

// A box being typed in scrolls its own text; the wheel zooms everywhere else.
function onwheel(event: WheelEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("textarea, .cm-editor")?.contains(document.activeElement))
    event.stopPropagation();
}
</script>

<div style:width="{cardWidth}px" {onwheel}>
  <TriggerCard
    {...grid.shared}
    {card}
    selected={grid.shared.selected === card.id}
    renaming={grid.shared.renaming === card.id}
    folded={card.place?.folded ?? false}
    commenting={grid.shared.commenting[card.id] ?? false}
    onfold={(folded) => grid.fold(card.id, folded)}
  />
  {#if grid.zoom < farZoom && grid.shared.renaming !== card.id}
    <div
      class="pointer-events-none absolute inset-x-0 top-0 line-clamp-2 rounded-[8px] bg-black/75 px-[0.3em] py-[0.15em] leading-[1.15] font-medium break-words text-white"
      style:font-size="{Math.min(14 / grid.zoom, 56)}px"
    >
      {card.name}
    </div>
  {/if}
</div>
