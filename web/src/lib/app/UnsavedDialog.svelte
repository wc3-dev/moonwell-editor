<script lang="ts">
import { t, tCount } from "../text.ts";
import Dialog from "../ui/Dialog.svelte";
import DialogButton from "../ui/DialogButton.svelte";
import { getEditor } from "./editor.svelte.ts";

const { session } = getEditor();
</script>

{#if session.unsaved}
  {@const asked = session.unsaved}
  {@const count = session.state?.changedObjects ?? 0}
  <Dialog title={t("dialog.unsaved.title")} oncancel={() => asked.answer("cancel")}>
    <p class="m-0">
      {count > 0
        ? tCount("dialog.unsaved.textCount", count, { question: asked.question })
        : t("dialog.unsaved.text", { question: asked.question })}
    </p>
    {#snippet actions()}
      <DialogButton onclick={() => asked.answer("cancel")}>{t("dialog.cancel")}</DialogButton>
      <DialogButton look={asked.canSave ? "plain" : "danger"} onclick={() => asked.answer("discard")}>
        {t("dialog.unsaved.discard")}
      </DialogButton>
      {#if asked.canSave}
        <DialogButton look="primary" onclick={() => asked.answer("save")}>{t("dialog.unsaved.save")}</DialogButton>
      {/if}
    {/snippet}
  </Dialog>
{/if}
