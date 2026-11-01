<script lang="ts">
/**
 * The trigger editor: the map's categories, triggers, comments and variables at the left, and a category's grid of
 * cards at the right. A selected trigger shows on its category's grid. Parameters that name a thing on the map are
 * picked in the map view.
 */
import { onMount, untrack } from "svelte";
import { isScript, type OpenScript } from "../scripts/openScripts.ts";
import { t } from "../text.ts";
import ContextMenu from "../ui/ContextMenu.svelte";
import Dialog from "../ui/Dialog.svelte";
import DialogButton from "../ui/DialogButton.svelte";
import { setCode, setVariable } from "./api.ts";
import type { CardActions } from "./cards.ts";
import FunctionDialog from "./FunctionDialog.svelte";
import MapHeaderPanel from "./MapHeaderPanel.svelte";
import ParameterDialog from "./ParameterDialog.svelte";
import TriggerCanvas from "./TriggerCanvas.svelte";
import TriggerTree from "./TriggerTree.svelte";
import { TriggerDrag } from "./triggerDrag.svelte.ts";
import { blockMenu, cardMenu, functionMenu, gridMenu } from "./triggerMenus.ts";
import { atEnd, blockPlace, TriggerState } from "./triggerState.svelte.ts";
import VariableForm from "./VariableForm.svelte";

type Props = {
  mode: string;
  /** Puts a command on the app's queue, so it runs after what is being sent. */
  queued: <T>(run: () => Promise<T>) => Promise<T>;
  onnotice: (text: string, warn?: boolean) => void;
  /** Opens a script in the Script Editor. */
  onscript: (script: OpenScript) => void;
};

let { mode, queued, onnotice, onscript }: Props = $props();

const state = new TriggerState({
  queued: (run) => queued(run),
  onnotice: (text, warn) => onnotice(text, warn),
  onscript: (script) => onscript(script),
});
const drag = new TriggerDrag(state);

export const refresh = state.refresh;
export const startRename = state.startRename;
export const deleteSelected = state.deleteSelected;

const cardActions: CardActions = {
  parameter: (owner, parameter) => (state.parameters = { owner, paths: [parameter.path] }),
  change: (owner, function_) => (state.changing = { owner, function_ }),
  functionMenu: (owner, function_, x, y) => functionMenu(state, owner, function_, x, y),
  add: (owner, kind) => state.addTo(owner, kind, { parent: null, branch: 0, index: atEnd }),
  addToBlock: (owner, parent, block) => state.addTo(owner, block.kind, blockPlace(parent, block)),
  blockMenu: (owner, parent, block, x, y) => blockMenu(state, owner, parent, block, x, y),
  dragFunction: drag.startFunction,
  overFunction: drag.overFunction,
  overBlock: drag.overBlock,
  overSection: drag.overSection,
  dropFunction: drag.dropFunction,
  dragEnd: drag.end,
  select: (id) => state.select(id, false),
  open: (id) => {
    const each = state.itemOf(id);
    if (each && isScript(each)) state.openScript(each);
    else state.select(id, true);
  },
  rename: (id, name) => {
    const each = state.itemOf(id);
    if (each) state.finishRename(each, name);
  },
  cardMenu: (card, x, y) => cardMenu(state, card, x, y),
  options: state.options,
  code: (id, text) => state.edit(() => setCode(id, text), id),
  variable: (card) => (state.editingVariable = card),
};

onMount(() => {
  untrack(() => state.load());
});
</script>

<div class="grid h-full min-h-0 grid-cols-[320px_1fr] max-[1100px]:grid-cols-[250px_1fr]" data-testid="trigger-editor">
  <TriggerTree {state} {drag} />

  {#if state.problem}
    <div class="bg-bg p-4"><p class="m-0 text-warn">{state.problem}</p></div>
  {:else if !state.tree || !state.catalog}
    <div class="bg-bg p-4"><p class="m-0 text-muted">{t("triggers.loading")}</p></div>
  {:else if state.shown}
    <div
      class="flex min-h-0 flex-col"
      role="presentation"
      onpointerdown={() => (state.zone = "grid")}
      onfocusin={() => (state.zone = "grid")}
    >
      {#if state.tree.problem}
        <p class="m-0 border-b border-line bg-surface px-3 py-1 text-warn">{state.tree.problem}</p>
      {/if}
      <div class="min-h-0 flex-1">
        <TriggerCanvas
          parent={state.shown.parent}
          cards={state.shown.cards}
          catalog={state.catalog}
          {mode}
          language={state.tree.language}
          readOnly={state.readOnly}
          selected={state.selected}
          active={state.zone === "grid"}
          renaming={state.renaming?.where === "grid" ? state.renaming.id : null}
          flyTo={state.flyTo}
          commenting={state.commenting}
          dropKey={drag.functionDrop?.key ?? null}
          actions={cardActions}
          onmoved={state.moved}
          onfold={state.folded}
          onmenu={(x, y) => gridMenu(state, x, y)}
          onempty={state.emptyClicked}
        />
      </div>
    </div>
  {:else if state.item?.kind === "root"}
    <MapHeaderPanel {state} tree={state.tree} root={state.item} />
  {:else if state.gridParent === null}
    <div class="bg-bg p-4"><p class="m-0 text-muted">{t("triggers.nothingSelected")}</p></div>
  {/if}
</div>

{#if state.editingVariable?.variable && state.catalog}
  {@const variable = state.editingVariable.variable}
  <Dialog title={variable.name} oncancel={() => (state.editingVariable = null)}>
    <VariableForm
      catalog={state.catalog}
      value={{ name: variable.name, type: variable.type, isArray: variable.isArray, size: variable.size, initial: variable.initial }}
      readOnly={state.readOnly}
      onsave={async (input) => {
        if (await state.edit(() => setVariable(variable.id, input))) state.editingVariable = null;
      }}
    />
    {#snippet actions()}
      <DialogButton look="outline" onclick={() => (state.editingVariable = null)}>{t("triggers.close")}</DialogButton>
    {/snippet}
  </Dialog>
{/if}
{#if state.deleting}
  <Dialog title={t("triggers.delete")} oncancel={() => (state.deleting = null)}>
    {state.deleting.kind === "category"
      ? t("triggers.deleteAskCategory", { name: state.deleting.name })
      : t("triggers.deleteAsk", { name: state.deleting.name })}
    {#snippet actions()}
      <DialogButton look="outline" onclick={() => (state.deleting = null)}>{t("triggers.close")}</DialogButton>
      <DialogButton look="accent" onclick={state.confirmDelete}>{t("triggers.delete")}</DialogButton>
    {/snippet}
  </Dialog>
{/if}
{#if state.menu}
  <ContextMenu x={state.menu.x} y={state.menu.y} items={state.menu.items} onclose={() => (state.menu = null)} />
{/if}
{#if state.catalog && state.adding}
  <FunctionDialog catalog={state.catalog} kind={state.adding.kind} title={state.adding.title} onpick={state.pickedFunction} oncancel={() => (state.adding = null)} />
{:else if state.catalog && state.changing}
  <FunctionDialog catalog={state.catalog} kind={state.changing.function_.kind} title={t("triggers.function.change")} current={state.changing.function_.name} onpick={state.pickedFunction} oncancel={() => (state.changing = null)} />
{/if}
{#if state.catalog && state.tree && state.openParameter && !state.picking}
  <ParameterDialog
    parameter={state.openParameter}
    catalog={state.catalog}
    variables={state.tree.variables}
    references={state.tree.references}
    items={state.tree.items}
    inEvent={state.inEvent(state.openParameter.path)}
    onset={state.setParameterValue}
    onpoint={state.setPoint}
    onopen={(inner) => (state.parameters = { owner: state.parameters.owner, paths: [...state.parameters.paths, inner.path] })}
    onpicking={(now) => (state.picking = now)}
    onclose={() => (state.parameters = { owner: state.parameters.owner, paths: state.parameters.paths.slice(0, -1) })}
  />
{/if}
