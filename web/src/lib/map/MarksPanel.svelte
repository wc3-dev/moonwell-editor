<script lang="ts">
/**
 * The Terrain Editor's Regions and Cameras docks: the region or camera chosen on the map, renamed here; for cameras, a
 * new one from the view, and the chosen one aimed at the view or looked through. Drawing, moving and resizing are on
 * the map (see MapView).
 */
import { t } from "../text.ts";
import { chosenMark, terrainTools } from "./terrainTools.svelte.ts";

const mark = $derived(terrainTools.mark);
let name = $state("");

$effect(() => {
  name = mark?.name ?? "";
});

function rename(): void {
  if (mark && name.trim() && name !== mark.name) chosenMark.rename?.(name.trim());
}
</script>

{#if terrainTools.group === "cameras"}
  <section>
    <button
      type="button"
      class="w-full rounded-ui border border-transparent bg-raised px-2 py-1 text-left text-soft hover:text-normal"
      onclick={() => chosenMark.newCamera?.()}>{t("terrain.cameraFromView")}</button
    >
  </section>
{/if}
{#if mark}
  <section class="rounded-ui bg-raised px-2 py-1.5" aria-label={t("terrain.chosen")}>
    <label class="mb-1 block text-small text-faint" for="mark-name">{t("terrain.markName")}</label>
    <input
      id="mark-name"
      class="w-full rounded-ui border border-transparent bg-field px-2 py-px text-normal outline-none focus:border-accent"
      bind:value={name}
      onblur={rename}
      onkeydown={(event) => {
        if (event.key === "Enter") rename();
      }}
    />
    <p class="mt-1 font-mono text-mono text-faint">{mark.detail}</p>
    {#if mark.kind === "camera"}
      <div class="mt-1.5 flex flex-col gap-1">
        <button
          type="button"
          class="rounded-ui border border-transparent bg-field px-2 py-px text-left text-soft hover:text-normal"
          onclick={() => chosenMark.aim?.()}>{t("terrain.cameraAim")}</button
        >
        <button
          type="button"
          class="rounded-ui border border-transparent bg-field px-2 py-px text-left text-soft hover:text-normal"
          onclick={() => chosenMark.look?.()}>{t("terrain.cameraLook")}</button
        >
      </div>
    {/if}
  </section>
{/if}
