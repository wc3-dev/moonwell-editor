<script lang="ts">
import Braces from "@lucide/svelte/icons/braces";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import FileCode from "@lucide/svelte/icons/file-code";
import Folder from "@lucide/svelte/icons/folder";
import FolderPlus from "@lucide/svelte/icons/folder-plus";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MessageSquarePlus from "@lucide/svelte/icons/message-square-plus";
import Plus from "@lucide/svelte/icons/plus";
import SquareFunction from "@lucide/svelte/icons/square-function";
import Workflow from "@lucide/svelte/icons/workflow";
import { isScript } from "../scripts/openScripts.ts";
import { t } from "../text.ts";
import type { TreeKind } from "./api.ts";
import { focusRename } from "./cards.ts";
import { box, toolButton } from "./styles.ts";
import type { TriggerDrag } from "./triggerDrag.svelte.ts";
import { itemMenu } from "./triggerMenus.ts";
import type { TriggerState } from "./triggerState.svelte.ts";

type Props = { state: TriggerState; drag: TriggerDrag };

let { state, drag }: Props = $props();

const iconOf: Record<TreeKind, typeof Folder> = {
  root: FileCode,
  category: Folder,
  trigger: Workflow,
  custom: FileCode,
  script: FileCode,
  comment: MessageSquare,
  variable: Braces,
};
</script>

<aside
  class="flex min-h-0 flex-col overflow-hidden rounded-ui bg-surface"
  aria-label={t("triggers.tree")}
  onpointerdown={() => (state.zone = "tree")}
  onfocusin={() => (state.zone = "tree")}
>
  <div class="flex items-center gap-0.5 px-[3px] py-px">
    <button type="button" class={toolButton} disabled={state.readOnly} title={t("triggers.new.category")} aria-label={t("triggers.new.category")} onclick={() => state.add("category")}>
      <FolderPlus size={16} />
    </button>
    <button type="button" class={toolButton} disabled={state.readOnly} title={t("triggers.new.trigger")} aria-label={t("triggers.new.trigger")} onclick={() => state.add("trigger")}>
      <Plus size={16} />
    </button>
    <button type="button" class={toolButton} disabled={state.readOnly} title={t("triggers.new.script")} aria-label={t("triggers.new.script")} onclick={() => state.add("script")}>
      <FileCode size={16} />
    </button>
    <button type="button" class={toolButton} disabled={state.readOnly} title={t("triggers.new.comment")} aria-label={t("triggers.new.comment")} onclick={() => state.add("comment")}>
      <MessageSquarePlus size={16} />
    </button>
    <button type="button" class={toolButton} disabled={state.readOnly} title={t("triggers.new.variable")} aria-label={t("triggers.new.variable")} onclick={state.addNewVariable}>
      <SquareFunction size={16} />
    </button>
  </div>
  <div class="px-[3px] pb-[3px]">
    <input class={box} placeholder={t("triggers.filter")} aria-label={t("triggers.filter")} bind:value={state.filter} />
  </div>
  <div class="min-h-0 flex-1 overflow-auto py-1" role="tree" aria-label={t("triggers.tree")}>
    {#each state.rows as row (row.item.id)}
      {@const Icon = iconOf[row.item.kind]}
      {@const renaming = state.renaming?.id === row.item.id}
      {@const dropHere = drag.dropAt?.id === row.item.id ? drag.dropAt.place : null}
      <div
        class="flex h-[22px] items-center gap-1 pr-2 {dropHere === 'inside' ? 'bg-accent-lo text-fg outline-1 -outline-offset-1 outline-accent' : state.selected === row.item.id && !dropHere ? (state.zone === 'tree' ? 'bg-select text-fg [&_*]:text-inherit' : 'bg-raised text-fg') : 'text-body hover:bg-hover'}"
        class:shadow-[inset_0_2px_0_var(--accent)]={dropHere === "before"}
        class:shadow-[inset_0_-2px_0_var(--accent)]={dropHere === "after"}
        style:padding-left={`${row.depth * 16 + 4}px`}
        role="treeitem"
        aria-selected={state.selected === row.item.id}
        aria-expanded={row.children ? state.isOpen(row.item) : undefined}
        tabindex="-1"
        draggable={!state.readOnly && row.item.kind !== "root" && !renaming}
        onclick={() => state.select(row.item.id, true)}
        ondblclick={() => isScript(row.item) && !renaming && state.openScript(row.item)}
        onkeydown={(event) => event.key === "Enter" && !renaming && state.select(row.item.id, true)}
        oncontextmenu={(event) => {
          event.preventDefault();
          state.select(row.item.id, false);
          itemMenu(state, row.item, event.clientX, event.clientY);
        }}
        ondragstart={(event) => drag.startRow(row.item, event)}
        ondragover={(event) => drag.rowOver(event, row.item)}
        ondragleave={() => drag.rowLeft()}
        ondrop={(event) => drag.rowDrop(event, row.item)}
        ondragend={drag.end}
      >
        {#if row.children && row.item.kind !== "root"}
          <button
            type="button"
            class="shrink-0 text-muted hover:text-fg"
            aria-label={row.item.name}
            onclick={(event) => {
              event.stopPropagation();
              state.toggled[row.item.id] = !state.isOpen(row.item);
            }}
          >
            {#if state.isOpen(row.item)}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
          </button>
        {:else}
          <span class="w-[14px] shrink-0"></span>
        {/if}
        <Icon size={15} class="shrink-0 {row.item.enabled ? 'text-muted' : 'text-faint'}" />
        {#if renaming && state.renaming?.where === "tree"}
          <input
            class="min-w-0 flex-1 rounded-ui border border-accent bg-field px-1 py-0 text-fg outline-none"
            value={row.item.name}
            aria-label={t("triggers.name")}
            spellcheck="false"
            {@attach focusRename}
            onclick={(event) => event.stopPropagation()}
            onkeydown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") state.finishRename(row.item, event.currentTarget.value);
              else if (event.key === "Escape") state.finishRename(row.item, null);
            }}
            onblur={(event) => state.finishRename(row.item, event.currentTarget.value)}
          />
        {:else}
          <span class="truncate {row.item.enabled ? '' : 'text-faint'}">{row.item.kind === "root" ? t("triggers.mapHeader") : row.item.name}</span>
        {/if}
      </div>
    {/each}
  </div>
</aside>
