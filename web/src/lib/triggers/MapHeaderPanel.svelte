<script lang="ts">
import SquareArrowOutUpRight from "@lucide/svelte/icons/square-arrow-out-up-right";
import { t } from "../text.ts";
import { setHeader, type TriggerTreeItem, type TriggerTreeView } from "./api.ts";
import ScriptBox from "./ScriptBox.svelte";
import { box, toolButton } from "./styles.ts";
import type { TriggerState } from "./triggerState.svelte.ts";
import { typedBox } from "./typedBox.ts";

type Props = { state: TriggerState; tree: TriggerTreeView; root: TriggerTreeItem };

let { state, tree, root }: Props = $props();

type Header = { comment: string; code: string };

// The header last sent, until its edit is done: a box sent before that keeps what the other box sent.
let sent: Header | null = null;

function sendHeader(change: Partial<Header>): void {
  const before = sent ?? { comment: state.tree?.headerComment ?? "", code: state.tree?.headerCode ?? "" };
  const next = { ...before, ...change };
  sent = next;
  state.edit(() => setHeader(next.comment, next.code)).then(() => {
    if (sent === next) sent = null;
  });
}
</script>

<div class="flex min-h-0 flex-col overflow-auto rounded-ui bg-panel p-4">
  {#if tree.problem}
    <p class="m-0 mb-3 text-warning">{tree.problem}</p>
  {/if}
  <div class="mb-1 flex items-center">
    <h2 class="m-0 text-title font-semibold text-normal">{t("triggers.mapHeader")}</h2>
    <button type="button" class="ml-auto {toolButton}" title={t("triggers.openInScriptEditor")} aria-label={t("triggers.openInScriptEditor")} onclick={() => state.openScript(root)}>
      <SquareArrowOutUpRight size={16} />
    </button>
  </div>
  <p class="m-0 mb-2 text-muted">{t("triggers.mapHeaderHint")}</p>
  <label class="mb-2">
    <span class="mb-1 block text-muted">{t("triggers.comment")}</span>
    <textarea class="{box} h-[64px] resize-none" value={tree.headerComment} disabled={state.readOnly} use:typedBox={(comment) => sendHeader({ comment })}></textarea>
  </label>
  <div class="flex min-h-0 flex-1 flex-col">
    <span class="mb-1 block text-muted">{t("triggers.code")}</span>
    <ScriptBox
      size="panel"
      value={tree.headerCode}
      language={tree.language}
      label={t("triggers.code")}
      readOnly={state.readOnly}
      onsend={(code) => sendHeader({ code })}
    />
  </div>
</div>
