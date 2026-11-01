<script lang="ts">
/**
 * The Script Editor (Sven, 2026-10-31): a script at full size in Monaco, with the scripts opened from the Trigger Editor
 * down the side. Each open script keeps its own document, so it comes back with its caret, its scroll and its undo. The
 * list is kept while the map is open. The language is the one the map's settings in World Editor choose, JASS or Lua,
 * never both.
 */

import FileCode from "@lucide/svelte/icons/file-code";
import X from "@lucide/svelte/icons/x";
import { onDestroy } from "svelte";
import type { CodeTheme } from "../codeThemes.ts";
import { errorText } from "../errors.ts";
import { t } from "../text.ts";
import { setCode, setHeader, type TriggerTree, trigger, triggerTree } from "../triggers/api.ts";
import type { ScriptsEditor } from "./monaco/scriptsEditor.ts";
import { closed, matched, type OpenScript, opened } from "./openScripts.ts";

type Props = {
  /** The theme scripts are drawn in. */
  codeTheme: CodeTheme;
  /** Puts a command on the app's queue, so it runs after what is being sent. */
  queued: <T>(run: () => Promise<T>) => Promise<T>;
  onnotice: (text: string, warn?: boolean) => void;
};

let { codeTheme, queued, onnotice }: Props = $props();

let tree = $state.raw<TriggerTree | null>(null);
let scripts = $state<OpenScript[]>([]);
let active = $state<number | null>(null);
// A script's text as it was read, which its document starts from.
const texts: Record<number, string> = {};
let host: HTMLDivElement | undefined = $state();
// Monaco, started by the first script opened: it is large, and most maps never ask for it.
let editor: Promise<ScriptsEditor> | null = null;

function monaco(): Promise<ScriptsEditor> {
  editor ??= import("./monaco/scriptsEditor.ts").then(({ ScriptsEditor }) =>
    ScriptsEditor.create(host as HTMLDivElement, {
      readOnly: tree?.readOnly ?? true,
      theme: codeTheme,
      onsend: (id, text) => {
        const script = scripts.find((each) => each.id === id);
        if (script) send(script, text);
      },
    }),
  );
  return editor;
}

$effect(() => {
  const chosen = codeTheme;
  editor?.then((each) => each.setTheme(chosen));
});

onDestroy(() => {
  editor?.then((each) => each.dispose());
});

async function textOf(script: OpenScript): Promise<string> {
  if (script.kind === "root") return tree?.headerCode ?? "";
  return (await queued(() => trigger(script.id))).code ?? "";
}

export const hasScripts = (): boolean => scripts.length > 0;

/** Reads the map's scripts again: when the editor shows, after an undo, and after a delete. */
export async function refresh(): Promise<void> {
  try {
    tree = await queued(triggerTree);
    const now = matched(scripts, tree.items, active);
    const gone = scripts.filter((script) => !now.list.some((each) => each.id === script.id));
    scripts = now.list;
    if (!editor) {
      active = now.active;
      return;
    }

    const view = await editor;
    for (const script of gone) await view.close(script.id);
    for (const script of now.list) await view.setText(script.id, await textOf(script));
    if (now.active !== null && now.active !== active) await activate(now.active);
    active = now.active;
  } catch (error) {
    onnotice(errorText(error), true);
  }
}

/** Opens a script, or goes to it when it is open, with the caret in it. */
export async function open(script: OpenScript): Promise<void> {
  try {
    tree = await queued(triggerTree);
    texts[script.id] = await textOf(script);
    scripts = opened(scripts, script);
    await activate(script.id);
  } catch (error) {
    onnotice(errorText(error), true);
  }
}

async function activate(id: number): Promise<void> {
  active = id;
  const view = await monaco();
  await view.show(id, texts[id] ?? "", tree?.language ?? "jass");
}

async function close(id: number): Promise<void> {
  const now = closed(scripts, active, id);
  scripts = now.list;
  await (await monaco()).close(id);
  if (now.active !== null && now.active !== active) await activate(now.active);
  active = now.active;
}

async function send(script: OpenScript, text: string): Promise<void> {
  const comment = tree?.headerComment ?? "";
  try {
    await queued(() =>
      script.kind === "root" ? setHeader(comment, text) : setCode(script.id, text),
    );
  } catch (error) {
    onnotice(errorText(error), true);
  }
}
</script>

<div class="grid h-full min-h-0 grid-cols-[260px_1fr] gap-1 max-[1100px]:grid-cols-[210px_1fr]" data-testid="script-editor">
  <aside class="flex min-h-0 flex-col overflow-hidden rounded-ui bg-surface" aria-label={t("scripts.list")}>
    <div class="flex items-center justify-between gap-2 px-2 py-1">
      <span class="text-muted">{t("scripts.list")}</span>
      {#if tree}
        <span class="rounded-ui border border-line px-1.5 font-mono text-mono text-muted" title={t("scripts.languageHint")}>
          {tree.language === "lua" ? t("scripts.lua") : t("scripts.jass")}
        </span>
      {/if}
    </div>
    <div class="min-h-0 flex-1 overflow-auto py-1">
      {#each scripts as script (script.id)}
        <div
          class="group flex h-[22px] items-center gap-1 pr-1 pl-2 {script.id === active
            ? 'bg-select text-fg [&_*]:text-inherit'
            : 'text-body hover:bg-hover'}"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            aria-current={script.id === active ? "true" : undefined}
            onclick={() => activate(script.id)}
          >
            <FileCode size={15} class="shrink-0 text-muted" />
            <span class="truncate">{script.name}</span>
          </button>
          <button
            type="button"
            class="shrink-0 rounded-ui p-0.5 text-muted hover:bg-hover hover:text-fg focus:opacity-100 {script.id === active
              ? ''
              : 'opacity-0 group-hover:opacity-100'}"
            title={t("scripts.close", { name: script.name })}
            aria-label={t("scripts.close", { name: script.name })}
            onclick={() => close(script.id)}
          >
            <X size={13} />
          </button>
        </div>
      {/each}
    </div>
  </aside>

  <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-ui bg-[var(--code-bg)]">
    {#if tree?.problem}
      <p class="m-0 bg-surface px-3 py-1 text-warn">{tree.problem}</p>
    {/if}
    <div bind:this={host} class="min-h-0 flex-1 {scripts.length > 0 ? '' : 'hidden'}"></div>
    {#if scripts.length === 0}
      <div class="grid flex-1 place-items-center bg-surface p-6">
        <p class="m-0 max-w-md text-center text-muted">{t("scripts.empty")}</p>
      </div>
    {/if}
  </div>
</div>
