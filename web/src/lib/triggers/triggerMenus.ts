import { isScript } from "../scripts/openScripts.ts";
import { t } from "../text.ts";
import type { MenuItem } from "../ui/ContextMenu.svelte";
import {
  type BlockView,
  type CardView,
  deleteFunction,
  enableFunction,
  type FunctionView,
  type TreeItem,
} from "./api.ts";
import { blockPlace, type TriggerState } from "./triggerState.svelte.ts";

export function itemMenu(
  state: TriggerState,
  each: TreeItem,
  x: number,
  y: number,
  extra: MenuItem[] = [],
): void {
  const { readOnly } = state;
  const scriptEntry: MenuItem[] = isScript(each)
    ? [
        { label: t("triggers.openInScriptEditor"), run: () => state.openScript(each) },
        { separator: true },
      ]
    : [];
  const creating: MenuItem[] = [
    ...scriptEntry,
    { label: t("triggers.new.category"), disabled: readOnly, run: () => state.add("category") },
    { label: t("triggers.new.trigger"), disabled: readOnly, run: () => state.add("trigger") },
    { label: t("triggers.new.script"), disabled: readOnly, run: () => state.add("script") },
    { label: t("triggers.new.comment"), disabled: readOnly, run: () => state.add("comment") },
    { label: t("triggers.new.variable"), disabled: readOnly, run: state.addNewVariable },
  ];
  state.menu = {
    x,
    y,
    items:
      each.kind === "root"
        ? creating
        : [
            ...creating,
            { separator: true },
            {
              label: t("menu.rename"),
              shortcut: "F2",
              disabled: readOnly,
              run: () => state.beginRename(each),
            },
            ...extra,
            {
              label: t("triggers.delete"),
              danger: true,
              disabled: readOnly,
              run: () => (state.deleting = each),
            },
          ],
  };
}

export function cardMenu(state: TriggerState, card: CardView, x: number, y: number): void {
  const each = state.itemOf(card.id);
  if (!each) return;
  state.select(card.id, false);
  const { readOnly } = state;
  const trigger = card.trigger;
  const extra: MenuItem[] = [];
  if (trigger && (card.kind === "trigger" || card.kind === "custom")) {
    extra.push({
      label: t("triggers.comment"),
      disabled: readOnly,
      run: () => (state.commenting[card.id] = true),
    });
  }

  if (trigger && card.kind === "custom") {
    extra.push({
      label: t("triggers.runOnInit"),
      shortcut: trigger.runOnInit ? "✓" : undefined,
      disabled: readOnly,
      run: () => state.options(card.id, { runOnInit: !trigger.runOnInit }),
    });
  }

  itemMenu(state, each, x, y, extra);
}

export function gridMenu(state: TriggerState, x: number, y: number): void {
  const each = state.itemOf(state.gridParent);
  if (!each) return;
  const { readOnly } = state;
  state.selected = each.id;
  state.menu = {
    x,
    y,
    items: [
      { label: t("triggers.new.trigger"), disabled: readOnly, run: () => state.add("trigger") },
      { label: t("triggers.new.script"), disabled: readOnly, run: () => state.add("script") },
      { label: t("triggers.new.comment"), disabled: readOnly, run: () => state.add("comment") },
      { label: t("triggers.new.variable"), disabled: readOnly, run: state.addNewVariable },
      { label: t("triggers.new.category"), disabled: readOnly, run: () => state.add("category") },
    ],
  };
}

export function functionMenu(
  state: TriggerState,
  owner: number,
  function_: FunctionView,
  x: number,
  y: number,
): void {
  const { readOnly, clipboard } = state;
  const at = state.siblingsOf(owner, function_).findIndex((each) => each.path === function_.path);
  state.menu = {
    x,
    y,
    items: [
      {
        label: t("triggers.changeFunction"),
        disabled: readOnly,
        run: () => (state.changing = { owner, function_ }),
      },
      { separator: true },
      {
        label: t("triggers.copy"),
        run: () => state.copy(owner, function_),
      },
      {
        label: t("triggers.paste"),
        disabled: readOnly || clipboard !== function_.kind,
        run: () => state.paste(owner, function_, at + 1),
      },
      { separator: true },
      {
        label: function_.enabled ? t("triggers.disable") : t("triggers.enable"),
        disabled: readOnly,
        run: () =>
          state.edit(() => enableFunction(owner, function_.path, !function_.enabled), owner),
      },
      { separator: true },
      {
        label: t("triggers.delete"),
        danger: true,
        disabled: readOnly,
        run: () => state.edit(() => deleteFunction(owner, function_.path), owner),
      },
    ],
  };
}

export function blockMenu(
  state: TriggerState,
  owner: number,
  parent: FunctionView,
  block: BlockView,
  x: number,
  y: number,
): void {
  const { readOnly, clipboard } = state;
  state.menu = {
    x,
    y,
    items: [
      {
        label: block.kind === "condition" ? t("triggers.addCondition") : t("triggers.addAction"),
        disabled: readOnly,
        run: () => state.addTo(owner, block.kind, blockPlace(parent, block)),
      },
      {
        label: t("triggers.paste"),
        disabled: readOnly || clipboard !== block.kind,
        run: () => state.pasteInto(owner, block.kind, blockPlace(parent, block)),
      },
    ],
  };
}
