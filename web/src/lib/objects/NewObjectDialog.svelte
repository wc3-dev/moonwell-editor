<script lang="ts">
import { getEditor } from "../app/editor.svelte.ts";
import Dialog from "../Dialog.svelte";
import DialogButton from "../DialogButton.svelte";
import { t } from "../text.ts";

const { objectActions } = getEditor();
</script>

{#if objectActions.creating}
  {@const asked = objectActions.creating}
  {@const typedProblem = objectActions.idProblem(asked.kind, asked.id)}
  <Dialog
    title={asked.from
      ? t("dialog.new.paste", { name: asked.from.name })
      : t("dialog.new.title", { name: asked.baseName })}
    note={asked.from ? asked.from.id : asked.baseId}
    oncancel={() => (objectActions.creating = null)}
  >
    <label class="flex items-center gap-2">
      {t("dialog.new.id")}
      <input
        class="w-28 rounded-[5px] border bg-bg px-2 py-1 font-mono text-fg outline-none focus:border-accent {asked.error ||
        typedProblem
          ? 'border-warn'
          : 'border-line'}"
        maxlength="4"
        spellcheck="false"
        bind:value={asked.id}
        oninput={() => (asked.error = "")}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!typedProblem) objectActions.create();
          }
        }}
      />
    </label>
    {#if asked.error || typedProblem}
      <p class="mt-2 mb-0 text-[12.5px] text-warn" role="alert">{asked.error || typedProblem}</p>
    {/if}
    {#snippet actions()}
      <DialogButton onclick={() => (objectActions.creating = null)}>{t("dialog.cancel")}</DialogButton>
      <DialogButton look="primary" onclick={() => !typedProblem && objectActions.create()}>
        {asked.busy
          ? t("dialog.new.making")
          : asked.from
            ? t("dialog.new.pasteButton")
            : t("dialog.new.make")}
      </DialogButton>
    {/snippet}
  </Dialog>
{/if}
