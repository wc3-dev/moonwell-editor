<script lang="ts">
/**
 * The Terrain Editor's dock: the chosen group's options, beside the map (the H Matte dock, as the object editor's list
 * sits beside its details; Sven agreed to the mockup, 2026-11-06). Each group's tools as icons, then the brush's
 * outline, size and strength. The ground's paint offers its tiles, the map's first (it lists at most 16), then the rest
 * of its tileset's, which a paint adds to the map's list; the cliff tools offer the map's cliff types.
 */
import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
import ArrowUpToLine from "@lucide/svelte/icons/arrow-up-to-line";
import ChevronsDown from "@lucide/svelte/icons/chevrons-down";
import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
import Circle from "@lucide/svelte/icons/circle";
import Droplet from "@lucide/svelte/icons/droplet";
import Equal from "@lucide/svelte/icons/equal";
import Minus from "@lucide/svelte/icons/minus";
import Paintbrush from "@lucide/svelte/icons/paintbrush";
import Spline from "@lucide/svelte/icons/spline";
import Square from "@lucide/svelte/icons/square";
import TrendingUp from "@lucide/svelte/icons/trending-up";
import WavesArrowDown from "@lucide/svelte/icons/waves-arrow-down";
import { iconUrl, terrainCliffTypes, terrainTiles } from "../api.ts";
import type { BrushShape, CliffKind, GroundTile, GroundTool } from "../bridge.gen.ts";
import { errorText } from "../errors.ts";
import { type TextKey, t } from "../text.ts";
import PlacePanel from "./PlacePanel.svelte";
import {
  type BrushGroup,
  chooseTool,
  isBrushGroup,
  largestBrush,
  terrainTools,
} from "./terrainTools.svelte.ts";

type Props = {
  /** The graphics mode the map is drawn in, for the tiles' pictures. */
  mode: string;
  /** Goes up when the map's list of tiles may have changed, so the panel asks for the tiles again. */
  version: number;
};

let { mode, version }: Props = $props();

type Tool = { tool: GroundTool; key: TextKey; Icon: typeof Circle };

// Each group's tools as icons, their names as tooltips (Sven, 2026-11-07).
const groupTools: Record<BrushGroup, Tool[]> = {
  ground: [
    { tool: "Paint", key: "terrain.tool.paint", Icon: Paintbrush },
    { tool: "Raise", key: "terrain.tool.raise", Icon: ChevronsUp },
    { tool: "Lower", key: "terrain.tool.lower", Icon: ChevronsDown },
    { tool: "Plateau", key: "terrain.tool.plateau", Icon: Equal },
    { tool: "Smooth", key: "terrain.tool.smooth", Icon: Spline },
  ],
  cliffs: [
    { tool: "CliffUp", key: "terrain.tool.cliffUp", Icon: ArrowUpToLine },
    { tool: "CliffDown", key: "terrain.tool.cliffDown", Icon: ArrowDownToLine },
    { tool: "CliffLevel", key: "terrain.tool.cliffLevel", Icon: Minus },
    { tool: "Ramp", key: "terrain.tool.ramp", Icon: TrendingUp },
  ],
  water: [
    { tool: "ShallowWater", key: "terrain.tool.shallowWater", Icon: Droplet },
    { tool: "DeepWater", key: "terrain.tool.deepWater", Icon: WavesArrowDown },
  ],
};
const tools = $derived(isBrushGroup(terrainTools.group) ? groupTools[terrainTools.group] : []);
const toolName = $derived(
  t(tools.find((each) => each.tool === terrainTools.tool)?.key ?? "terrain.tool"),
);
const cliffTool = $derived(
  terrainTools.tool === "CliffUp" ||
    terrainTools.tool === "CliffDown" ||
    terrainTools.tool === "CliffLevel",
);
const shapes: { shape: BrushShape; key: TextKey; Icon: typeof Circle }[] = [
  { shape: "Circle", key: "terrain.shape.circle", Icon: Circle },
  { shape: "Square", key: "terrain.shape.square", Icon: Square },
];
/** The most tiles a map lists (TerrainEditor.MostTiles). */
const mostTiles = 16;

let tiles = $state<GroundTile[]>([]);
let cliffTypes = $state<CliffKind[]>([]);
let failure = $state("");

$effect(() => {
  void version;
  const shown = mode;
  if (terrainTools.group !== "cliffs") return;
  let gone = false;
  terrainCliffTypes(shown).then(
    (read) => {
      if (gone) return;
      cliffTypes = read;
      if (!read.some((type) => type.number === terrainTools.cliffType)) terrainTools.cliffType = 0;
    },
    (error) => {
      if (!gone) failure = errorText(error);
    },
  );
  return () => {
    gone = true;
  };
});
const listed = $derived(tiles.filter((tile) => tile.inMap));
const others = $derived(tiles.filter((tile) => !tile.inMap));

$effect(() => {
  void version;
  const shown = mode;
  let gone = false;
  terrainTiles(shown).then(
    (read) => {
      if (gone) return;
      tiles = read;
      failure = "";
      if (!read.some((tile) => tile.id === terrainTools.tile)) {
        terrainTools.tile = read.find((tile) => tile.inMap)?.id ?? read[0]?.id ?? null;
      }
    },
    (error) => {
      if (!gone) failure = errorText(error);
    },
  );
  return () => {
    gone = true;
  };
});
</script>

{#snippet tileButton(tile: GroundTile)}
  <button
    type="button"
    class="flex min-w-0 flex-col gap-0.5 text-left text-small {terrainTools.tile === tile.id
      ? 'text-accent-text'
      : 'text-soft hover:text-normal'}"
    title={tile.inMap ? tile.name : t("terrain.tileAdds", { name: tile.name })}
    aria-pressed={terrainTools.tile === tile.id}
    onclick={() => (terrainTools.tile = tile.id)}
  >
    <span
      class="block aspect-square w-full rounded-ui border-2 bg-field bg-no-repeat {terrainTools.tile === tile.id
        ? 'border-accent'
        : 'border-transparent'} {tile.inMap ? '' : 'opacity-60'}"
      style="background-image: url('{iconUrl(tile.texture, mode)}'); background-size: auto 400%; background-position: 0 0"
    ></span>
    <span class="truncate">{tile.name}</span>
  </button>
{/snippet}

<aside class="flex min-h-0 flex-col overflow-hidden rounded-ui bg-panel" aria-label={t("terrain.panel")}>
  <div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-2.5 py-2">
    {#if terrainTools.group === "place"}
      <PlacePanel {mode} />
    {:else}
    <section>
      <h3 class="mb-1.5 flex justify-between text-small uppercase tracking-wider text-faint">
        <span>{t("terrain.tool")}</span><span>{toolName}</span>
      </h3>
      <div class="flex flex-wrap gap-0.5" role="group" aria-label={t("terrain.tool")}>
        {#each tools as each (each.tool)}
          <button
            type="button"
            class="grid h-[26px] w-[30px] place-items-center rounded-ui border {terrainTools.tool === each.tool
              ? 'border-accent bg-accent-background text-accent-text'
              : 'border-transparent bg-raised text-muted hover:text-normal'}"
            title={t(each.key)}
            aria-label={t(each.key)}
            aria-pressed={terrainTools.tool === each.tool}
            onclick={() => chooseTool(each.tool)}
          >
            <each.Icon size={16} />
          </button>
        {/each}
      </div>
    </section>
    <section>
      <h3 class="mb-1.5 text-small uppercase tracking-wider text-faint">{t("terrain.brush")}</h3>
      <div class="mb-1.5 grid grid-cols-[64px_1fr_auto] items-center gap-2 text-soft">
        <span>{t("terrain.shape")}</span>
        <div class="flex gap-0.5" role="group" aria-label={t("terrain.shape")}>
          {#each shapes as each (each.shape)}
            <button
              type="button"
              class="grid h-[22px] w-[26px] place-items-center rounded-ui border {terrainTools.shape === each.shape
                ? 'border-accent bg-accent-background text-accent-text'
                : 'border-transparent bg-raised text-muted hover:text-normal'}"
              title={t(each.key)}
              aria-label={t(each.key)}
              aria-pressed={terrainTools.shape === each.shape}
              onclick={() => (terrainTools.shape = each.shape)}
            >
              <each.Icon size={14} />
            </button>
          {/each}
        </div>
        <span></span>
        <label for="terrain-size">{t("terrain.size")}</label>
        <input
          id="terrain-size"
          type="range"
          class="w-full accent-[var(--accent-normal)]"
          min="1"
          max={largestBrush}
          bind:value={terrainTools.size}
        />
        <span class="min-w-7 rounded-ui bg-field px-1.5 text-right font-mono text-mono text-normal">{terrainTools.size}</span>
        {#if terrainTools.group === "ground"}
        <label for="terrain-strength" class={terrainTools.tool === "Raise" || terrainTools.tool === "Lower" ? "" : "opacity-45"}
          >{t("terrain.strength")}</label
        >
        <input
          id="terrain-strength"
          type="range"
          class="w-full accent-[var(--accent-normal)]"
          min="8"
          max="128"
          step="8"
          disabled={terrainTools.tool !== "Raise" && terrainTools.tool !== "Lower"}
          bind:value={terrainTools.strength}
        />
        <span
          class="min-w-7 rounded-ui bg-field px-1.5 text-right font-mono text-mono text-normal {terrainTools.tool === 'Raise' ||
          terrainTools.tool === 'Lower'
            ? ''
            : 'opacity-45'}">{terrainTools.strength}</span
        >
        {/if}
      </div>
    </section>
    {#if cliffTool && cliffTypes.length > 0}
      <section>
        <h3 class="mb-1.5 text-small uppercase tracking-wider text-faint">{t("terrain.cliffType")}</h3>
        <div class="flex flex-col gap-1" role="group" aria-label={t("terrain.cliffType")}>
          {#each cliffTypes as type (type.number)}
            <button
              type="button"
              class="flex items-center gap-2 rounded-ui border px-1.5 py-1 text-left {terrainTools.cliffType === type.number
                ? 'border-accent bg-accent-background text-accent-text'
                : 'border-transparent bg-raised text-soft hover:text-normal'}"
              aria-pressed={terrainTools.cliffType === type.number}
              onclick={() => (terrainTools.cliffType = type.number)}
            >
              <span
                class="block h-6 w-6 shrink-0 rounded-ui bg-field bg-cover"
                style="background-image: url('{iconUrl(type.texture, mode)}')"
              ></span>
              <span class="truncate">{type.name}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
    {#if terrainTools.tool === "Paint"}
      <section>
        <h3 class="mb-1.5 flex justify-between text-small uppercase tracking-wider text-faint">
          <span>{t("terrain.tiles")}</span><span>{t("terrain.tilesUsed", { used: listed.length, most: mostTiles })}</span>
        </h3>
        {#if failure}
          <p class="text-warning">{failure}</p>
        {/if}
        <div class="grid grid-cols-3 gap-1.5">
          {#each listed as tile (tile.id)}
            {@render tileButton(tile)}
          {/each}
        </div>
        {#if others.length > 0}
          <h3 class="mb-1.5 mt-3 text-small uppercase tracking-wider text-faint">{t("terrain.tileset")}</h3>
          <div class="grid grid-cols-3 gap-1.5">
            {#each others as tile (tile.id)}
              {@render tileButton(tile)}
            {/each}
          </div>
        {/if}
      </section>
    {/if}
    {/if}
  </div>
  <p class="border-t border-line-faint px-2.5 py-1.5 text-small text-faint">
    {terrainTools.group === "place" ? t("terrain.placeHint") : t("terrain.hint")}
  </p>
</aside>
