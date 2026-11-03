<script lang="ts">
/**
 * A category as a Blueprint-style grid (Sven, 2026-10-31): a card for everything in it, which pans, zooms and fits. A card
 * that was never moved stands in columns; moving one keeps the whole grid's places, so nothing else jumps. Svelte Flow
 * pans, zooms and drags; the grid says where each card stands and where the view goes.
 */
import "@xyflow/svelte/dist/base.css";
import {
  Background,
  BackgroundVariant,
  type Node,
  SvelteFlow,
  useSvelteFlow,
} from "@xyflow/svelte";
import { untrack } from "svelte";
import { t } from "../text.ts";
import type { CardMove, CardView } from "./api.ts";
import CardNode from "./CardNode.svelte";
import {
  type Box,
  columnsFor,
  farZoom,
  fitted,
  focused,
  grid,
  laidOut,
  maxZoom,
  minZoom,
  openZoom,
  placesToSave,
  titleInView,
  type View,
} from "./canvas.ts";
import { type Shared, setGrid } from "./cards.ts";

type Props = Shared & {
  /** The category shown. */
  parent: number;
  cards: CardView[];
  /** A card to bring into view; a new `count` brings it again. */
  flyTo: { id: number; count: number } | null;
  onmoved: (places: CardMove[]) => void;
  onfold: (id: number, folded: boolean, places: CardMove[]) => void;
  /** A right click on the empty grid. */
  onmenu: (x: number, y: number) => void;
  /** A left click on the empty grid, which no pan followed. */
  onempty: () => void;
};

// What every card is shown with goes to the cards as it is: rest props stay reactive.
let { parent, cards, flyTo, onmoved, onfold, onmenu, onempty, ...shared }: Props = $props();

const nodeTypes = { card: CardNode };
const flow = useSvelteFlow();

let width = $state(0);
let height = $state(0);
// Svelte Flow keeps the view: it is read here, and moved only through `look`.
let view = $state<View>({ x: grid, y: grid, zoom: 1 });
let nodes = $state.raw<Node<{ card: CardView }>[]>([]);
let heights = $state<Record<number, number>>({});
// The columns are counted when a category first shows and when a card comes, so that a card growing does not reshape the
// grid.
let columns = $state(1);
let counted = 0;
// The view and the columns of each category seen, so going back finds it as it was.
const seen = new Map<number, { view: View; columns: number }>();
let shown: number | null = null;
let fitting = $state(false);
let flown = 0;

const boxes = $derived(
  laidOut(
    cards.map((card) => ({
      id: card.id,
      place: card.place,
      height: heights[card.id] ?? 120,
    })),
    columns,
  ),
);
const measured = $derived(cards.every((card) => heights[card.id] !== undefined));

setGrid({
  get shared() {
    return shared;
  },
  get zoom() {
    return view.zoom;
  },
  fold: foldCard,
});

function boxOf(id: number): Box | undefined {
  return boxes.find((box) => box.id === id);
}

function look(next: View, glide = true): void {
  void flow.setViewport(next, { duration: glide ? 200 : 0 });
}

export function fit(): void {
  look(fitted(boxes, width, height));
}

// A card stands where its box is. What Svelte Flow keeps on a node, such as its measured size, stays.
$effect(() => {
  const before = new Map(untrack(() => nodes).map((node) => [node.id, node]));
  nodes = cards.map((card, at) => {
    const id = String(card.id);
    const box = boxes[at] as Box;
    return {
      ...before.get(id),
      id,
      type: "card",
      position: { x: box.x, y: box.y },
      data: { card },
      dragHandle: "[data-grip]",
      zIndex: shared.selected === card.id ? 5 : 0,
    };
  });
});

$effect(() => {
  for (const node of nodes) {
    const id = Number(node.id);
    const size = node.measured?.height;
    if (size !== undefined && untrack(() => heights[id]) !== size) heights[id] = size;
  }
});

// Another category: its view as it was left, or all of it.
$effect(() => {
  if (shown === parent) return;
  if (shown !== null) seen.set(shown, { view: untrack(() => view), columns });
  shown = parent;
  const left = seen.get(parent);
  if (left) {
    look(left.view, false);
    columns = left.columns;
    counted = cards.length;
  } else {
    fitting = true;
  }
});

function columnsNow(): number {
  return columnsFor(
    cards.map((card) => heights[card.id] ?? 0),
    width / height,
  );
}

$effect(() => {
  if (!measured || width === 0) return;
  if (fitting) {
    fitting = false;
    counted = cards.length;
    columns = columnsNow();
    look(fitted(boxes, width, height, openZoom), false);
  } else if (cards.length !== counted) {
    // A category filled from empty should not stay one long column.
    counted = cards.length;
    columns = Math.max(columns, columnsNow());
  }
});

$effect(() => {
  const target = flyTo;
  if (!target || target.count === flown || !measured || width === 0) return;
  const box = boxOf(target.id);
  if (!box) return;
  flown = target.count;
  look(
    focused(
      box,
      width,
      height,
      Math.max(
        untrack(() => view.zoom),
        0.85,
      ),
    ),
  );
});

// A name is typed where it can be read.
$effect(() => {
  const id = shared.renaming;
  untrack(() => {
    const box = id === null ? undefined : boxOf(id);
    if (box && (view.zoom < farZoom || !titleInView(box, view, width, height))) {
      look(focused(box, width, height, Math.max(view.zoom, 0.85)));
    }
  });
});

// A right press opens a menu where it is let go, unless it moved: then it panned, as in Blueprints. Svelte Flow pans on
// the right button but then opens no menu of its own.
let rightPress: { x: number; y: number } | null = null;

function oncontextmenucapture(event: MouseEvent): void {
  const press = rightPress;
  rightPress = null;
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function oncontextmenu(event: MouseEvent): void {
  event.preventDefault();
  if (!(event.target as HTMLElement).closest(".svelte-flow__node"))
    onmenu(event.clientX, event.clientY);
}

function foldCard(id: number, folded: boolean): void {
  onfold(
    id,
    folded,
    boxes.map(({ id: each, x, y }) => ({ id: each, x, y })),
  );
}
</script>

<div
  bind:clientWidth={width}
  bind:clientHeight={height}
  class="canvas-look relative h-full min-h-0 overflow-hidden bg-raised select-none [--line-major:color-mix(in_srgb,var(--background-base)_70%,transparent)] [--line-minor:color-mix(in_srgb,var(--border-normal)_55%,transparent)]"
  role="application"
  aria-label={t("triggers.tree")}
  data-testid="trigger-canvas"
  onpointerdowncapture={(event) => {
    if (event.button === 2) rightPress = { x: event.clientX, y: event.clientY };
  }}
  onmousedowncapture={(event) => event.button === 1 && event.preventDefault()}
  {oncontextmenucapture}
  {oncontextmenu}
>
  <SvelteFlow
    bind:nodes
    bind:viewport={view}
    {nodeTypes}
    {minZoom}
    {maxZoom}
    snapGrid={[grid, grid]}
    nodeDragThreshold={4}
    paneClickDistance={4}
    panOnDrag={[0, 1, 2]}
    zoomOnDoubleClick={false}
    nodesDraggable={!shared.readOnly}
    nodesConnectable={false}
    nodesFocusable={false}
    edgesFocusable={false}
    elementsSelectable={false}
    autoPanOnNodeDrag={false}
    disableKeyboardA11y
    deleteKey={null}
    selectionKey={null}
    multiSelectionKey={null}
    panActivationKey={null}
    zoomActivationKey={null}
    proOptions={{ hideAttribution: true }}
    onnodedragstop={({ targetNode }) => {
      if (targetNode) onmoved(placesToSave(boxes, { id: Number(targetNode.id), ...targetNode.position }));
    }}
    onpaneclick={onempty}
  >
    {#if grid * view.zoom >= 8}
      <Background id="minor" variant={BackgroundVariant.Lines} gap={grid} patternColor="var(--line-minor)" />
    {/if}
    <Background id="major" variant={BackgroundVariant.Lines} gap={grid * 5} patternColor="var(--line-major)" />
  </SvelteFlow>

  {#if cards.length === 0}
    <p class="pointer-events-none absolute inset-0 m-0 grid place-items-center text-muted">
      {t("triggers.emptyCategory")}
    </p>
  {/if}

  <div
    class="absolute top-2 right-2 z-5 flex items-center gap-2 rounded-md border border-black bg-panel px-2 py-0.5 text-xs text-muted"
  >
    <span title={t("triggers.zoom")}>{Math.round(view.zoom * 100)}%</span>
    <button type="button" class="text-normal hover:text-accent-text" onclick={fit}>{t("triggers.fit")}</button>
  </div>
</div>
