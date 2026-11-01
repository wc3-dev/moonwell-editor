<script lang="ts">
import FolderOpen from "@lucide/svelte/icons/folder-open";
import { t, tParts } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";

const { startup } = getEditor();
</script>

<main class="grid min-h-0 place-items-center" data-testid="first-start">
  <div class="flex max-w-lg flex-col gap-3 px-6">
    <h1 class="text-title font-semibold text-fg">{t("welcome.title")}</h1>
    <p>
      {#each tParts("welcome.text") as part, index (index)}{#if part.slot === "file"}<span class="font-mono text-mono text-fg">Warcraft III Launcher.exe</span>{:else}{part.text}{/if}{/each}
    </p>
    {#if startup.view === "failed" && startup.data}
      <p class="text-warn" data-testid="game-data-error">
        {#each tParts("welcome.failed", { error: startup.data.error ?? "" }) as part, index (index)}{#if part.slot === "folder"}<span class="font-mono text-mono">{startup.data.source}</span>{:else}{part.text}{/if}{/each}
      </p>
    {/if}
    {#if startup.problem}
      <p class="text-warn">{startup.problem}</p>
    {/if}
    <div>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-ui bg-primary px-3 py-1 text-fg hover:brightness-110"
        onclick={startup.choose}
      >
        <FolderOpen size={16} />
        {t("welcome.choose")}
      </button>
    </div>
  </div>
</main>
