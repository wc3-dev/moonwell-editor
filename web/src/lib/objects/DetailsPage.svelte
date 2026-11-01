<script lang="ts">
import { getEditor } from "../app/editor.svelte.ts";
import { hasTooltip } from "../app/objectActions.svelte.ts";
import Details from "../Details.svelte";
import SidePanel from "../SidePanel.svelte";
import Tree from "../Tree.svelte";
import { t } from "../text.ts";

const editor = getEditor();
const { notices, objectActions, objects, pages, session, startup } = editor;
</script>

<!-- It stays in the page while the table or the map shows, so it comes back as it was. -->
<main
  class="grid min-h-0 grid-cols-[290px_1fr_300px] max-[1100px]:grid-cols-[230px_1fr_240px] {pages.page !==
  'details'
    ? 'hidden'
    : ''}"
>
  <aside
    class="min-h-0 overflow-hidden border-r border-line bg-surface"
    aria-label={t("main.objects")}
    onpointerdown={() => (pages.zone = "tree")}
    onfocusin={() => (pages.zone = "tree")}
  >
    <Tree
      kind={objects.kind}
      entries={objects.trees[objects.kind] ?? null}
      error={objects.treeErrors[objects.kind] ?? ""}
      selected={objects.picked[objects.kind] ?? null}
      onselect={(id) => objects.show(objects.kind, id)}
      oncontext={(id, x, y) => editor.openObjectMenu(objects.kind, id, x, y)}
      bind:filter={objects.filter}
      active={pages.zone === "tree"}
      renaming={objects.current?.kind === objects.kind ? objectActions.renaming : null}
      onrename={objectActions.renamed}
    />
  </aside>
  <section
    class="flex min-h-0 flex-col overflow-hidden"
    aria-label={t("main.details")}
    onpointerdown={() => (pages.zone = "details")}
    onfocusin={() => (pages.zone = "details")}
  >
    {#if session.problem}
      <p class="mx-[18px] mt-3.5 shrink-0 text-warn" data-testid="map-error">{session.problem}</p>
    {/if}
    {#if objects.error}
      <p class="mx-[18px] mt-3.5 text-warn">{objects.error}</p>
    {:else if objects.current}
      <Details
        bind:this={pages.details}
        view={objects.shown ?? objects.current}
        choices={startup.choices}
        lookup={objects.lookup}
        bind:filter={objects.fieldFilter}
        bind:changedOnly={objects.changedOnly}
        bind:showIds={objects.showIds}
        onopen={(each, id) => objects.show(each, id)}
        onset={(field, value) => objects.edit(field, value)}
        onreset={(field) => objects.edit(field, null)}
        onnew={objectActions.startNew}
        oncopy={objectActions.copyShown}
        ondelete={objectActions.askDelete}
        onmenu={(x, y, items) => (editor.menu = { x, y, items })}
        onnotice={(text, warn) => notices.say(text, { warn })}
        onfields={objects.editFields}
        kindIcons={objects.iconsOfKind}
      />
    {:else}
      <p class="mx-[18px] mt-3.5 text-muted">
        {t("main.pickObject")}
      </p>
    {/if}
  </section>
  <!-- The scroll bar's room is always kept, so the panel's width (and the model's size, which follows it) does not
       change as the scroll bar comes and goes; that made the panel shake. -->
  <aside
    class="min-h-0 overflow-auto border-l border-line bg-surface p-3 [scrollbar-gutter:stable]"
    aria-label={t("main.side")}
  >
    {#if objects.current}
      <SidePanel
        view={objects.shown ?? objects.current}
        lookup={objects.lookup}
        onopen={(each, id) => objects.show(each, id)}
        onedittooltip={hasTooltip(objects.current.kind) && objects.current.readOnly === null
          ? () => (objectActions.editingTooltip = true)
          : undefined}
      />
    {/if}
  </aside>
</main>
