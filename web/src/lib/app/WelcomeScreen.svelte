<script lang="ts">
/**
 * What the window shows with no map open, laid out as VS Code's welcome page (Sven, 2026-11-03): the editor's name, then
 * Start and Recent on the left, Learn on the right, and whether the last map opens at start. Learn shows what is
 * coming and does nothing yet, as there are no docs to open (Sven, 2026-11-03). When the game is not found, or failed
 * to load, a warning at the top asks for its folder, and the maps wait for it.
 */
import Command from "@lucide/svelte/icons/command";
import FileArchive from "@lucide/svelte/icons/file-archive";
import FolderOpen from "@lucide/svelte/icons/folder-open";
import Keyboard from "@lucide/svelte/icons/keyboard";
import Palette from "@lucide/svelte/icons/palette";
import Rocket from "@lucide/svelte/icons/rocket";
import Settings from "@lucide/svelte/icons/settings";
import Sparkles from "@lucide/svelte/icons/sparkles";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import X from "@lucide/svelte/icons/x";
import { type Component, onMount } from "svelte";
import { forgetMap, openMap, type RecentMap, recentMaps } from "../api.ts";
import { errorText } from "../errors.ts";
import logo from "../logo.svg";
import { prefs, setPref } from "../prefs.svelte.ts";
import { t, tParts } from "../text.ts";
import Dialog from "../ui/Dialog.svelte";
import DialogButton from "../ui/DialogButton.svelte";
import { getEditor } from "./editor.svelte.ts";
import { shownKey } from "./keymap.ts";
import { openEntries } from "./openMenu.ts";
import { placeOf } from "./recent.ts";

type Icon = Component<{ size?: number }>;

const editor = getEditor();
const { session, startup } = editor;

let recent = $state.raw<RecentMap[] | null>(null);
// A map that is gone, while the dialog asks whether to take it off the list.
let asking = $state.raw<RecentMap | null>(null);

const gameMissing = $derived(startup.view === "missing" || startup.view === "failed");
const canOpen = $derived(startup.view === "ready" && !session.opening);

const learn: { Icon: Icon; title: string; text: string }[] = [
  { Icon: Rocket, title: t("welcome.learn.start"), text: t("welcome.learn.startText") },
  { Icon: Palette, title: t("welcome.learn.theme"), text: t("welcome.learn.themeText") },
  { Icon: Keyboard, title: t("welcome.learn.keys"), text: t("welcome.learn.keysText") },
  { Icon: Sparkles, title: t("welcome.learn.new"), text: t("welcome.learn.newText") },
];

onMount(() => {
  recentMaps().then(
    (maps) => (recent = maps),
    () => (recent = []),
  );
});

function open(map: RecentMap): void {
  if (map.found) void session.openWith(() => openMap({ path: map.path }));
  else asking = map;
}

async function forget(map: RecentMap): Promise<void> {
  try {
    recent = await forgetMap(map.path);
  } catch (error) {
    session.problem = errorText(error);
  }
}
</script>

{#snippet startEntry(Icon: Icon, label: string, disabled: boolean, onclick: () => void, key?: string)}
  <button
    type="button"
    class="flex w-full items-center gap-2 py-[3px] text-left text-accent-text hover:underline disabled:opacity-45 disabled:hover:no-underline"
    aria-label={label}
    aria-keyshortcuts={key}
    {disabled}
    {onclick}
  >
    <Icon size={16} />
    {label}
    {#if key}
      <kbd class="ml-auto rounded-ui border border-line px-1.5 font-mono text-[11px] leading-4 text-muted">{shownKey(key)}</kbd>
    {/if}
  </button>
{/snippet}

<main class="min-h-0 overflow-auto text-[13px] leading-5" data-testid="welcome">
  <div class="mx-auto max-w-[1040px] px-14 pt-16 pb-8">
    <header class="mb-10 flex items-center gap-4">
      <img src={logo} alt="" width="56" height="56" />
      <div>
        <h1 class="m-0 text-[28px] leading-[34px] font-normal text-normal">{t("welcome.title")}</h1>
        <p class="m-0 text-[16px] leading-[22px] text-muted">
          {t("welcome.tagline")}{#if startup.versions?.version}{` · ${startup.versions.version}`}{/if}
        </p>
      </div>
    </header>

    {#if gameMissing}
      <div class="mb-7 flex gap-3 rounded-ui bg-warning-background px-3.5 py-3 text-normal" data-testid="game-missing">
        <span class="pt-0.5 text-warning"><TriangleAlert size={18} /></span>
        <div class="flex flex-col items-start gap-2.5">
          <p class="m-0">
            {#each tParts("welcome.text") as part, index (index)}{#if part.slot === "file"}<span class="font-mono text-mono">Warcraft III Launcher.exe</span>{:else}{part.text}{/if}{/each}
          </p>
          {#if startup.view === "failed" && startup.data}
            <p class="m-0 text-warning" data-testid="game-data-error">
              {#each tParts("welcome.failed", { error: startup.data.error ?? "" }) as part, index (index)}{#if part.slot === "folder"}<span class="font-mono text-mono">{startup.data.source}</span>{:else}{part.text}{/if}{/each}
            </p>
          {/if}
          {#if startup.problem}
            <p class="m-0 text-warning">{startup.problem}</p>
          {/if}
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-ui bg-button px-3 py-1 text-normal hover:brightness-110"
            onclick={startup.choose}
          >
            <FolderOpen size={16} />
            {t("welcome.choose")}
          </button>
        </div>
      </div>
    {:else if startup.view !== "ready"}
      <p class="mt-0 mb-7 text-muted">{t("welcome.loading")}</p>
    {/if}

    {#if session.problem}
      <p class="mt-0 mb-7 text-warning" data-testid="map-error">{session.problem}</p>
    {/if}

    <div class="grid grid-cols-2 gap-18">
      <div class="min-w-0">
        <h2 class="mt-0 mb-1.5 text-[16px] leading-[22px] font-normal text-normal">{t("welcome.start")}</h2>
        {@render startEntry(FolderOpen, session.opening ? t("welcome.opening") : t("welcome.openFolder"), !canOpen, () =>
          session.openAnother(openEntries[0]),
        )}
        {@render startEntry(FileArchive, t("welcome.openArchive"), !canOpen, () => session.openAnother(openEntries[1]))}
        {@render startEntry(Settings, t("welcome.settings"), false, () => (editor.settingsOpen = true), editor.keymap.settings[0])}
        {@render startEntry(Command, t("welcome.commands"), false, () => (editor.paletteOpen = true), editor.keymap.commandPalette[0])}

        <h2 class="mt-8 mb-1.5 text-[16px] leading-[22px] font-normal text-normal" id="welcome-recent">{t("welcome.recent")}</h2>
        {#if recent?.length === 0}
          <p class="m-0 text-muted">{t("welcome.noRecent")}</p>
        {:else if recent}
          <ul class="m-0 list-none p-0" aria-labelledby="welcome-recent">
            {#each recent as map (map.path)}
              {@const place = placeOf(map.path)}
              <li class="group flex min-w-0 items-center gap-2.5 py-0.5">
                <button
                  type="button"
                  class="shrink-0 hover:underline disabled:opacity-45 disabled:hover:no-underline {map.found
                    ? 'text-accent-text'
                    : 'text-faint'}"
                  title={map.found ? map.path : t("welcome.gone", { path: map.path })}
                  disabled={!canOpen}
                  onclick={() => open(map)}
                >
                  {place.name}
                </button>
                <span class="min-w-0 truncate text-muted">{place.folder}</span>
                <button
                  type="button"
                  class="ml-auto shrink-0 rounded-ui p-0.5 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-normal"
                  title={t("welcome.forget", { name: place.name })}
                  aria-label={t("welcome.forget", { name: place.name })}
                  onclick={() => forget(map)}
                >
                  <X size={14} />
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="min-w-0">
        <h2 class="mt-0 mb-1.5 text-[16px] leading-[22px] font-normal text-normal" id="welcome-learn">{t("welcome.learn")}</h2>
        <ul class="m-0 flex list-none flex-col gap-2 p-0" aria-labelledby="welcome-learn">
          {#each learn as each (each.title)}
            <li class="flex gap-3 rounded-ui bg-panel px-3 py-2.5">
              <span class="pt-0.5 text-accent-text"><each.Icon size={18} /></span>
              <div>
                <div class="text-normal">{each.title}</div>
                <div class="text-muted">{each.text}</div>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <footer class="mt-12 flex justify-center">
      <label class="flex items-center gap-2">
        <!-- On the window's background a box needs its line to show; in panels the field's colour is enough. -->
        <input
          type="checkbox"
          class="border-line hover:border-muted"
          checked={prefs.reopenLastMap}
          onchange={(event) => setPref("reopenLastMap", event.currentTarget.checked)}
        />
        {t("welcome.reopen")}
      </label>
    </footer>
  </div>
</main>

{#if asking}
  {@const map = asking}
  <Dialog title={t("welcome.gone.title")} oncancel={() => (asking = null)}>
    <p class="m-0">{t("welcome.gone.text", { path: map.path })}</p>
    {#snippet actions()}
      <DialogButton onclick={() => (asking = null)}>{t("dialog.cancel")}</DialogButton>
      <DialogButton
        look="primary"
        onclick={() => {
          void forget(map);
          asking = null;
        }}
      >
        {t("welcome.gone.remove")}
      </DialogButton>
    {/snippet}
  </Dialog>
{/if}
