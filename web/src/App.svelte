<script lang="ts">
import { onMount } from "svelte";
import { uiScale } from "./lib/api.ts";
import AboutDialog from "./lib/app/AboutDialog.svelte";
import AlphaNotice from "./lib/app/AlphaNotice.svelte";
import AppHeader from "./lib/app/AppHeader.svelte";
import CommandPalette from "./lib/app/CommandPalette.svelte";
import DiskChangedDialog from "./lib/app/DiskChangedDialog.svelte";
import EditorPages from "./lib/app/EditorPages.svelte";
import { Editor, setEditor } from "./lib/app/editor.svelte.ts";
import type { Place } from "./lib/app/history.svelte.ts";
import NoMapScreen from "./lib/app/NoMapScreen.svelte";
import ReloadDialog from "./lib/app/ReloadDialog.svelte";
import SettingsDialog from "./lib/app/SettingsDialog.svelte";
import StatusBar from "./lib/app/StatusBar.svelte";
import TitleBar, { type Visit } from "./lib/app/TitleBar.svelte";
import { windowTitle } from "./lib/app/title.ts";
import UnsavedDialog from "./lib/app/UnsavedDialog.svelte";
import WelcomeScreen from "./lib/app/WelcomeScreen.svelte";
import { typingIn } from "./lib/app/windowKeys.ts";
import { applyCodeTheme } from "./lib/codeThemes.ts";
import { picking } from "./lib/map/pick.svelte.ts";
import DeleteObjectDialog from "./lib/objects/DeleteObjectDialog.svelte";
import NewObjectDialog from "./lib/objects/NewObjectDialog.svelte";
import TooltipEditor from "./lib/objects/TooltipEditor.svelte";
import { prefs } from "./lib/prefs.svelte.ts";
import TerminalPanel from "./lib/terminal/TerminalPanel.svelte";
import { t } from "./lib/text.ts";
import ContextMenu from "./lib/ui/ContextMenu.svelte";

const editor = new Editor();
setEditor(editor);
const { appearance, history, notices, objects, pages, startup, terminals } = editor;
const { objectActions, session } = editor;

$effect(() => applyCodeTheme(appearance.codeTheme));
$effect(() => pages.followPick(picking.kind !== null, session.map !== null));
// The table view is an experimental feature: turning them off goes back to the details.
$effect(() => {
  if (!prefs.experimental && pages.page === "table") pages.show("details");
});
// The window shows the open map's path in its title (the app copies the page's title to the window).
$effect(() => {
  document.title = windowTitle(session.map?.path ?? null);
});

/** A history entry for the title bar's list: its place and its object's name. */
function visitOf({ place, at }: { place: Place; at: number }): Visit {
  return { at, id: place.id, name: objects.names[place.kind]?.get(place.id) || place.id };
}

onMount(() => {
  appearance.use(appearance.theme);
  if (prefs.uiScale !== 100) uiScale(prefs.uiScale).catch(() => {});
  const stopStartup = startup.start();
  const stopTerminals = terminals.listen();
  return () => {
    stopStartup();
    stopTerminals();
  };
});
</script>

<svelte:window
  onkeydown={editor.onkeydown}
  onkeydowncapture={editor.onkeydowncapture}
  onmouseup={editor.walkByMouse}
  oncontextmenu={(event) => !typingIn(event.target) && event.preventDefault()}
/>

<div class="grid h-full grid-cols-1 grid-rows-[23px_30px_1fr_auto_22px]">
  <TitleBar
    map={session.map}
    back={history.behind.map(visitOf)}
    forward={history.ahead.map(visitOf)}
    onjump={(to) => editor.walk(to - history.at)}
  />
  <AppHeader />

  {#if startup.view === "missing" || startup.view === "failed"}
    <WelcomeScreen />
  {:else if !session.map}
    <NoMapScreen />
  {:else}
    <EditorPages />
  {/if}

  <TerminalPanel />

  <StatusBar
    session={session.state}
    problems={session.map?.problems ?? []}
    bind:showProblems={session.problemsOpen}
    data={startup.data}
    dataView={startup.view}
    options={session.map?.options ?? null}
    connection={startup.connection}
    notice={notices.current}
    loading={!startup.data || startup.view === "loading"
      ? t("status.loadingData")
      : session.saving
        ? t("header.saving")
        : null}
  />
</div>

{#if editor.menu}
  <ContextMenu {...editor.menu} onclose={() => (editor.menu = null)} />
{/if}

{#if objectActions.editingTooltip && objects.current}
  <TooltipEditor view={objects.shown ?? objects.current} onfields={objects.editFields} onclose={() => (objectActions.editingTooltip = false)} />
{/if}

<NewObjectDialog />
<DeleteObjectDialog />
<ReloadDialog />
<DiskChangedDialog />
<UnsavedDialog />

{#if editor.settingsOpen}
  <SettingsDialog
    theme={appearance.theme}
    ontheme={appearance.use}
    keymap={editor.keymap}
    onkeymap={(changed) => (editor.keymap = changed)}
    map={session.map}
    data={startup.data}
    onchoose={startup.choose}
    onclose={() => (editor.settingsOpen = false)}
  />
{/if}

{#if editor.aboutOpen}
  <AboutDialog about={startup.versions} game={startup.data?.game ?? null} onclose={() => (editor.aboutOpen = false)} />
{/if}

{#if editor.alphaOpen}
  <AlphaNotice onclose={() => (editor.alphaOpen = false)} />
{/if}

{#if editor.paletteOpen}
  <CommandPalette />
{/if}
