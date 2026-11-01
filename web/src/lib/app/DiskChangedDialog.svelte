<script lang="ts">
import Dialog from "../Dialog.svelte";
import DialogButton from "../DialogButton.svelte";
import { t } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";

const { session } = getEditor();
</script>

{#if session.diskChanged}
  <Dialog title={t("dialog.diskChanged.title")} oncancel={() => (session.diskChanged = "")}>
    <p class="m-0">{session.diskChanged}</p>
    {#snippet actions()}
      <DialogButton onclick={() => (session.diskChanged = "")}>{t("dialog.cancel")}</DialogButton>
      <DialogButton
        look="primary"
        onclick={() => {
          session.diskChanged = "";
          session.reloadAfterDiskChange();
        }}
      >
        {t("dialog.diskChanged.reload")}
      </DialogButton>
    {/snippet}
  </Dialog>
{/if}
