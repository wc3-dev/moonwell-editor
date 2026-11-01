<script lang="ts">
import { graphics } from "../graphics.svelte.ts";
import MapView from "../MapView.svelte";
import DetailsPage from "../objects/DetailsPage.svelte";
import ScriptEditor from "../ScriptEditor.svelte";
import TableView from "../TableView.svelte";
import TriggerEditor from "../TriggerEditor.svelte";
import { t } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";

const editor = getEditor();
const { appearance, notices, objects, pages, queue, session, startup } = editor;

const notice = (text: string, warn?: boolean) => notices.say(text, { warn });
</script>

{#if pages.page === "map"}
  <main class="min-h-0" aria-label={t("main.map")}>
    <!-- A map opened or reloaded is a new object: the view is made again and reads it. -->
    {#key session.map}
      <MapView mode={graphics.mode} />
    {/key}
  </main>
{/if}
<!-- The trigger editor stays in the page once shown, so its dialogs and place come back after a pick or a script. -->
{#if pages.triggersShown}
  <main class="min-h-0 {pages.page === 'triggers' ? '' : 'hidden'}" aria-label={t("main.triggers")}>
    {#key session.map}
      <TriggerEditor
        bind:this={pages.triggerEditor}
        mode={graphics.mode}
        queued={queue.run}
        onnotice={notice}
        onscript={pages.openScript}
      />
    {/key}
  </main>
{/if}
<main class="min-h-0 {pages.page === 'scripts' ? '' : 'hidden'}" aria-label={t("main.scripts")}>
  {#key session.map}
    <ScriptEditor
      bind:this={pages.scriptEditor}
      codeTheme={appearance.codeTheme}
      queued={queue.run}
      onnotice={notice}
    />
  {/key}
</main>
{#if pages.page === "table"}
  <main class="min-h-0" aria-label={t("main.table")}>
    <TableView
      bind:this={pages.tableView}
      kind={objects.kind}
      entries={objects.trees[objects.kind] ?? null}
      treeError={objects.treeErrors[objects.kind] ?? ""}
      selected={objects.picked[objects.kind] ?? null}
      bind:filter={objects.filter}
      bind:tableState={objects.tableState}
      session={session.state}
      choices={startup.choices}
      lookup={objects.lookup}
      onneed={objects.ensureTree}
      onopen={editor.openInDetails}
      onedit={objects.editCells}
      onnotice={notice}
    />
  </main>
{/if}
<DetailsPage />
