<script lang="ts">
import Dialog from "../Dialog.svelte";
import DialogButton from "../DialogButton.svelte";
import { t, tCount } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";

const { session } = getEditor();
</script>

{#if session.confirmingReload}
  <Dialog title={t("dialog.reload.title")} oncancel={() => (session.confirmingReload = false)}>
    <p class="m-0">{t("dialog.reload.text")}</p>
    {#if session.state?.dirty}
      <p class="mt-2 mb-0 flex items-center gap-1.5 text-changed" data-testid="reload-unsaved">
        <span class="size-1.5 shrink-0 rounded-full bg-changed"></span>
        {tCount("dialog.reload.unsaved", session.state.changedObjects)}
      </p>
    {/if}
    {#snippet actions()}
      <DialogButton onclick={() => (session.confirmingReload = false)}>{t("dialog.cancel")}</DialogButton>
      <DialogButton
        look="primary"
        onclick={() => {
          session.confirmingReload = false;
          session.reloadFromDisk(session.state?.dirty ?? false);
        }}
      >
        {t("dialog.reload.button")}
      </DialogButton>
    {/snippet}
  </Dialog>
{/if}
