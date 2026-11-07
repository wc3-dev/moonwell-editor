<script lang="ts">
/**
 * The Terrain Editor's Place dock: the kind of thing a click places, chosen with the Object Editor's kind icons and
 * colours (Sven, 2026-11-07), the player a unit goes to, the type from the kind's list (the game's and the map's own,
 * as the Object Editor lists them), and the thing chosen on the map: its player or scale. Drag a placed thing to move
 * it, R turns it, Delete removes it (Sven, 2026-11-06).
 */
import { iconUrl, type Kind, terrainPlayers } from "../api.ts";
import { getEditor } from "../app/editor.svelte.ts";
import type { PlaceKind, PlacePlayer, TreeEntry } from "../bridge.gen.ts";
import { errorText } from "../errors.ts";
import { kindIcons, kindNames, kindText } from "../objects/tree.ts";
import { t } from "../text.ts";
import { chosenThing, terrainTools } from "./terrainTools.svelte.ts";

type Props = {
  /** The graphics mode the map is drawn in, for the icons. */
  mode: string;
};

let { mode }: Props = $props();

const { objects } = getEditor();

/** The kinds that can be placed, each with its Object Editor kind. */
const placeKinds: { kind: PlaceKind; objects: Kind }[] = [
  { kind: "Unit", objects: "unit" },
  { kind: "Item", objects: "item" },
  { kind: "Destructable", objects: "destructable" },
  { kind: "Doodad", objects: "doodad" },
];

let filter = $state("");
let players = $state<PlacePlayer[]>([]);
let failure = $state("");
const objectKind = $derived(
  placeKinds.find((each) => each.kind === terrainTools.place.kind)?.objects ?? "unit",
);
const entries = $derived.by(() => {
  const words = filter.trim().toLowerCase();
  return (objects.listed(objectKind) ?? [])
    .filter(
      (entry) =>
        !words || `${entry.name} ${entry.suffix} ${entry.id}`.toLowerCase().includes(words),
    )
    .sort(
      (a, b) => a.path.join("/").localeCompare(b.path.join("/")) || a.name.localeCompare(b.name),
    );
});
const chosen = $derived(terrainTools.chosen);

$effect(() => {
  void objects.ensureTree(objectKind);
});

$effect(() => {
  terrainPlayers().then(
    (read) => {
      players = read;
    },
    (error) => {
      failure = errorText(error);
    },
  );
});

function label(entry: TreeEntry): string {
  return entry.suffix ? `${entry.name} ${entry.suffix}` : entry.name;
}
</script>

<section>
  <div class="flex gap-0.5" role="group" aria-label={t("terrain.placeKind")}>
    {#each placeKinds as each (each.kind)}
      {@const Icon = kindIcons[each.objects]}
      <button
        type="button"
        class="grid h-[26px] w-[30px] place-items-center rounded-ui border {kindText[each.objects]} {terrainTools.place.kind === each.kind
          ? 'border-accent bg-accent-background'
          : 'border-transparent bg-raised opacity-70 hover:opacity-100'}"
        title={kindNames[each.objects]}
        aria-label={kindNames[each.objects]}
        aria-pressed={terrainTools.place.kind === each.kind}
        onclick={() => (terrainTools.place = { ...terrainTools.place, kind: each.kind, type: null })}
      >
        <Icon size={16} />
      </button>
    {/each}
  </div>
</section>
{#if failure}
  <p class="text-warning">{failure}</p>
{/if}
{#if terrainTools.place.kind === "Unit"}
  <section>
    <label class="mb-1.5 block text-small uppercase tracking-wider text-faint" for="place-owner">{t("terrain.owner")}</label>
    <select
      id="place-owner"
      class="w-full rounded-ui border border-transparent bg-field px-2 py-px text-normal"
      bind:value={terrainTools.place.owner}
    >
      {#each players as player (player.number)}
        <option value={player.number}>{player.name}</option>
      {/each}
    </select>
  </section>
{/if}
{#if chosen}
  <section class="rounded-ui bg-raised px-2 py-1.5" aria-label={t("terrain.chosen")}>
    <h3 class="mb-1 truncate text-normal">{chosen.name}</h3>
    {#if chosen.kind === "Unit"}
      <label class="mb-1 block text-small text-faint" for="chosen-owner">{t("terrain.owner")}</label>
      <select
        id="chosen-owner"
        class="w-full rounded-ui border border-transparent bg-field px-2 py-px text-normal"
        value={chosen.owner}
        onchange={(event) => chosenThing.own?.(Number(event.currentTarget.value))}
      >
        {#each players as player (player.number)}
          <option value={player.number}>{player.name}</option>
        {/each}
      </select>
    {:else if chosen.kind === "Doodad" || chosen.kind === "Destructable"}
      <label class="mb-1 block text-small text-faint" for="chosen-scale">{t("terrain.scale")}</label>
      <input
        id="chosen-scale"
        type="number"
        class="w-full rounded-ui border border-transparent bg-field px-2 py-px font-mono text-mono text-normal"
        min="0.1"
        max="10"
        step="0.05"
        value={chosen.scale}
        onchange={(event) => chosenThing.resize?.(Number(event.currentTarget.value))}
      />
    {/if}
  </section>
{/if}
<section class="flex min-h-0 flex-1 flex-col">
  <input
    class="w-full rounded-ui border border-transparent bg-field px-2 py-px text-normal outline-none focus:border-accent"
    placeholder={t("terrain.placeFilter")}
    aria-label={t("terrain.placeFilter")}
    bind:value={filter}
  />
  <div class="mt-1.5 flex min-h-0 flex-col" role="listbox" aria-label={t("terrain.placeTypes")}>
    {#each entries as entry (entry.id)}
      <button
        type="button"
        role="option"
        class="flex items-center gap-2 rounded-ui px-1 py-0.5 text-left {terrainTools.place.type === entry.id
          ? 'bg-selection text-normal'
          : 'text-soft hover:bg-hover'}"
        aria-selected={terrainTools.place.type === entry.id}
        onclick={() => (terrainTools.place = { ...terrainTools.place, type: entry.id })}
      >
        {#if entry.icon}
          <img class="h-5 w-5 shrink-0 rounded-ui" src={iconUrl(entry.icon, mode)} alt="" />
        {/if}
        <span class="min-w-0 flex-1 truncate {kindText[objectKind]}">{label(entry)}</span>
        <span class="font-mono text-mono text-faint">{entry.id}</span>
      </button>
    {/each}
  </div>
</section>
