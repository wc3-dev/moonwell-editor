<script lang="ts">
import { getEditor } from "../app/editor.svelte.ts";
import { t } from "../text.ts";
import Dialog from "../ui/Dialog.svelte";
import DialogButton from "../ui/DialogButton.svelte";

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
        class="w-28 rounded-ui border bg-field px-2 py-1 font-mono text-mono text-fg outline-none focus:border-accent {asked.error ||
        typedProblem
          ? 'border-warn'
          : 'border-transparent'}"
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
      <p class="mt-2 mb-0 text-warn" role="alert">{asked.error || typedProblem}</p>
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
