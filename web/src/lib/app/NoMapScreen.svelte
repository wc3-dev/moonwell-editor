<script lang="ts">
import { t } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";
import OpenMapMenu from "./OpenMapMenu.svelte";

const { session, startup } = getEditor();
</script>

<main class="grid min-h-0 place-items-center" data-testid="no-map">
  <div class="flex max-w-lg flex-col items-start gap-3 px-6">
    <h1 class="text-title font-semibold text-fg">{t("noMap.title", { version: startup.versions?.version ?? "" }).trim()}</h1>
    {#if startup.view === "ready"}
      <p>{t("noMap.text")}</p>
    {:else}
      <p>{t("noMap.loading")}</p>
    {/if}
    {#if session.problem}
      <p class="text-warn" data-testid="map-error">{session.problem}</p>
    {/if}
    <OpenMapMenu
      label={session.opening ? t("noMap.opening") : t("noMap.open")}
      buttonClass="inline-flex items-center gap-2 rounded-ui bg-primary px-3 py-1 text-fg hover:brightness-110 disabled:opacity-50"
      disabled={startup.view !== "ready" || session.opening}
      onpick={session.openAnother}
    />
  </div>
</main>
