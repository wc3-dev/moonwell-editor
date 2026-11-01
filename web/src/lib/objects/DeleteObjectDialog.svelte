<script lang="ts">
import { getEditor } from "../app/editor.svelte.ts";
import Dialog from "../Dialog.svelte";
import DialogButton from "../DialogButton.svelte";
import { t, tParts } from "../text.ts";

const { objectActions } = getEditor();
</script>

{#if objectActions.deleting}
  {@const asked = objectActions.deleting}
  <Dialog title={t("dialog.delete.title", { name: asked.name })} oncancel={() => (objectActions.deleting = null)}>
    <p class="m-0">
      {#each tParts("dialog.delete.text", { kind: asked.kind }) as part, index (index)}{#if part.slot === "name"}<b class="font-semibold text-fg">{asked.name}</b>{:else if part.slot === "id"}<span class="font-mono text-[12.5px] text-muted">{asked.id}</span>{:else}{part.text}{/if}{/each}
    </p>
    {#snippet actions()}
      <DialogButton onclick={() => (objectActions.deleting = null)}>{t("dialog.cancel")}</DialogButton>
      <DialogButton look="danger" onclick={objectActions.deleteAsked}>{t("dialog.delete.button")}</DialogButton>
    {/snippet}
  </Dialog>
{/if}
