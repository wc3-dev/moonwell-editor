<script lang="ts">
import AudioLines from "@lucide/svelte/icons/audio-lines";
import BookOpen from "@lucide/svelte/icons/book-open";
import Bot from "@lucide/svelte/icons/bot";
import Boxes from "@lucide/svelte/icons/boxes";
import CodeXml from "@lucide/svelte/icons/code-xml";
import Columns3 from "@lucide/svelte/icons/columns-3";
import GitCompareArrows from "@lucide/svelte/icons/git-compare-arrows";
import Menu from "@lucide/svelte/icons/menu";
import MountainSnow from "@lucide/svelte/icons/mountain-snow";
import Package from "@lucide/svelte/icons/package";
import Table2 from "@lucide/svelte/icons/table-2";
import Workflow from "@lucide/svelte/icons/workflow";
import type { Component } from "svelte";
import KindBar from "../objects/KindBar.svelte";
import { prefs } from "../prefs.svelte.ts";
import { t } from "../text.ts";
import { getEditor } from "./editor.svelte.ts";

type HeaderIcon = Component<{ size?: number }>;

const editor = getEditor();
const { objects, pages, session } = editor;

const editors = $derived<
  { name: string; Icon: HeaderIcon; shows: boolean; offBecause?: string; open: () => void }[]
>([
  {
    name: t("header.objectEditor"),
    Icon: Boxes,
    shows: pages.inObjectEditor,
    open: pages.showObjectEditor,
  },
  {
    name: t("header.terrainEditor"),
    Icon: MountainSnow,
    shows: pages.page === "map",
    open: () => pages.show("map"),
  },
  {
    name: t("header.triggerEditor"),
    Icon: Workflow,
    shows: pages.page === "triggers",
    open: () => pages.show("triggers"),
  },
  {
    name: t("header.scriptEditor"),
    Icon: CodeXml,
    shows: pages.page === "scripts",
    offBecause: pages.scriptsOpen ? undefined : t("header.scriptEditorEmpty"),
    open: () => pages.show("scripts"),
  },
]);

const comingEditors: { name: string; Icon: HeaderIcon }[] = [
  { name: t("header.soundEditor"), Icon: AudioLines },
  { name: t("header.campaignEditor"), Icon: BookOpen },
  { name: t("header.aiEditor"), Icon: Bot },
  { name: t("header.assetManager"), Icon: Package },
];
</script>

{#snippet pageButton(name: string, title: string, Icon: HeaderIcon, shows: boolean, disabled: boolean, onclick: () => void)}
  <button
    type="button"
    class="tool-button {shows
      ? 'text-accent-hi'
      : 'text-muted hover:text-fg disabled:opacity-50 disabled:hover:text-muted'}"
    {title}
    aria-label={name}
    aria-pressed={shows}
    {disabled}
    {onclick}
  >
    <Icon size={16} />
  </button>
{/snippet}

{#snippet comingButton(name: string, title: string, Icon: HeaderIcon)}
  <button type="button" class="tool-button text-muted opacity-50" disabled {title} aria-label={name}>
    <Icon size={16} />
  </button>
{/snippet}

<header class="toolbar flex items-center gap-1 px-1">
  <div class="flex shrink-0 gap-0.5" role="group" aria-label={t("header.editors")}>
    {#each editors as each (each.name)}
      {@render pageButton(each.name, each.offBecause ?? each.name, each.Icon, each.shows, !session.map || each.offBecause !== undefined, each.open)}
    {/each}
    {#each comingEditors as each (each.name)}
      {@render comingButton(each.name, t("header.comingSoon", { name: each.name }), each.Icon)}
    {/each}
  </div>
  {#if pages.inObjectEditor}
    <span class="toolbar-rule h-5 w-px shrink-0" aria-hidden="true"></span>
    <KindBar kind={objects.kind} disabled={!session.map} onkind={objects.switchKind} />
    <span class="toolbar-rule h-5 w-px shrink-0" aria-hidden="true"></span>
    <div class="flex shrink-0 gap-0.5" role="group" aria-label={t("header.views")}>
      {@render pageButton(t("header.details"), t("header.details"), Columns3, pages.page === "details", !session.map, () => pages.show("details"))}
      {@render pageButton(
        t("header.table"),
        prefs.experimental ? t("header.table") : t("header.tableExperimental"),
        Table2,
        pages.page === "table",
        !session.map || !prefs.experimental,
        () => pages.show("table"),
      )}
      {@render comingButton(t("header.compare"), t("header.compareTitle"), GitCompareArrows)}
    </div>
  {/if}
  <button
    type="button"
    class="tool-button ml-auto shrink-0 text-muted hover:text-fg"
    title={t("header.menu")}
    aria-label={t("header.menu")}
    aria-haspopup="menu"
    onclick={(event) => editor.openMainMenu(event.currentTarget)}
  >
    <Menu size={16} />
  </button>
</header>
