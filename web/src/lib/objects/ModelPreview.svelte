<script lang="ts">
/**
 * A 3D preview of a game model: it plays the model's Stand animation, lit and textured, and turns slowly; a drag turns
 * it by hand. war3-model parses and draws the model with WebGL. Each model gets its own canvas and GL context, and
 * both go when the path changes or the preview closes. Particles and ribbons are drawn as war3-model draws them. The
 * Reforged (HD) and Definitive Edition models are drawn with war3-model's HD shader (the diffuse, normal and ORM maps,
 * lit, with the team colour), once their skins are read again (see `readSkins`); their emissive maps, reflections and
 * popcorn particles are not drawn. The team colour and hero glow take a player's colour, and a row of the 24 colours
 * can pick it (Sven, 2026-10-27). The side panel's preview can play any of the model's animations, picked from a list
 * (Sven, 2026-10-27).
 */

import MoveVertical from "@lucide/svelte/icons/move-vertical";
import RotateCw from "@lucide/svelte/icons/rotate-cw";
import { untrack } from "svelte";
import { playerIndex, teamColors } from "../teamColors.ts";
import { t, tCount } from "../text.ts";
import Popover from "../ui/Popover.svelte";
import Select from "../ui/Select.svelte";
import { type PreviewView, showModel } from "./modelPreview.ts";
import TeamColourGrid from "./TeamColourGrid.svelte";

type Props = {
  /** The model's game path as object data spells it, with .mdl, .mdx or no extension. */
  path: string;
  /** The URL that answers a game file's bytes (404 when there is none), for the model and its textures. */
  fileUrl: (path: string) => string;
  /** The width and height in pixels. */
  size?: number;
  /** The player whose colour the team colour and hero glow take, 0 for player 1 (Red) to 23 (Peanut). */
  teamColor?: number;
  /** Whether to show the 24 player colours under the model; a click sets `teamColor`. */
  picker?: boolean;
  /** Whether to show the model's animations to pick from. */
  animations?: boolean;
};

let {
  path,
  fileUrl,
  size = 240,
  teamColor = $bindable(0),
  picker = false,
  animations = false,
}: Props = $props();

const view = $state<PreviewView>({
  status: "loading",
  error: "",
  missing: [],
  sequences: [],
  playing: -1,
  turning: true,
  lifted: false,
});

let host: HTMLDivElement | undefined = $state();

/** The preview on show, so a new team colour reaches its renderer without loading the model again. */
let current: ReturnType<typeof showModel> | undefined;

// A new size only resizes the canvas: loading the model again for it would hide the animations while it loads, which
// changes the panel's height, and with it maybe its scroll bar and its width, and so the size again (Sven,
// 2026-10-28: the side panel shook).
$effect(() => {
  if (!host) return;
  const preview = showModel(
    host,
    path,
    fileUrl,
    untrack(() => size),
    untrack(() => teamColor),
    view,
  );
  current = preview;
  return () => {
    preview.stop();
    if (current === preview) current = undefined;
  };
});

$effect(() => {
  current?.tint(teamColor);
});

$effect(() => {
  current?.resize(size);
});

// The team colours' list, open under its square, which is as wide as the animations' list is tall.
let coloursOpen = $state(false);
let rowHeight = $state(26);
let coloursButton: HTMLButtonElement | undefined = $state();
</script>

<div class="flex shrink-0 flex-col gap-1.5" style="width: {size}px">
  <div
    bind:this={host}
    class="relative shrink-0 overflow-hidden rounded-ui border border-line bg-field"
    style="width: {size}px; height: {size}px"
  >
    {#if view.status === "loading"}
      <p class="absolute inset-0 m-0 flex items-center justify-center text-faint">{t("model.loading")}</p>
    {:else if view.status === "error"}
      <p
        class="absolute inset-0 m-0 flex items-center justify-center p-3 text-center text-warn"
        role="alert"
      >
        {view.error}
      </p>
    {:else if view.missing.length > 0}
      <p
        class="absolute right-0 bottom-0 m-0 truncate px-2 py-1 text-small text-faint"
        title={view.missing.join("\n")}
      >
        {tCount("model.texturesMissing", view.missing.length)}
      </p>
    {/if}
    {#if view.status === "ready" && (!view.turning || view.lifted)}
      <div class="absolute bottom-1.5 left-1.5 flex gap-1">
        {#if !view.turning}
          {@render overlayButton(t("model.turnAgain"), RotateCw, () => (view.turning = true))}
        {/if}
        {#if view.lifted}
          {@render overlayButton(t("model.lower"), MoveVertical, () => current?.lower())}
        {/if}
      </div>
    {/if}
  </div>
  <!-- Always there, also while the model loads or when it has none, so the panel keeps its height. The team colour is a
       square beside the animations that opens the 24 colours (Sven, 2026-10-29). -->
  <div class="flex items-stretch gap-1.5">
  {#if animations}
    <div class="min-w-0 flex-1" bind:clientHeight={rowHeight}>
    <Select
      options={view.sequences.map((name, index) => ({ value: String(index), label: name || t("model.unnamed", { index }) }))}
      value={String(view.playing)}
      label={t("model.animation")}
      missing={view.status === "loading" ? t("model.animationsLoading") : t("model.noAnimations")}
      tone="border-transparent bg-field text-fg hover:border-muted"
      compact
      disabled={view.sequences.length === 0}
      onpick={(value) => current?.play(Number(value))}
    />
    </div>
  {/if}
  {#if picker}
    {@const shown = teamColors[playerIndex(teamColor)]}
    <button
      type="button"
      class="shrink-0 self-stretch rounded-ui border border-line hover:border-muted"
      style:width="{rowHeight}px"
      style:background-color={shown?.hex}
      title={t("model.teamColourTitle", { colour: shown?.name ?? "" })}
      aria-label={t("model.teamColour")}
      aria-haspopup="dialog"
      aria-expanded={coloursOpen}
      bind:this={coloursButton}
      onclick={() => (coloursOpen = !coloursOpen)}
    ></button>
  {/if}
  </div>
  {#if picker && coloursOpen && coloursButton}
    <Popover anchor={coloursButton} onclose={() => (coloursOpen = false)}>
      <TeamColourGrid
        value={teamColor}
        onpick={(index) => {
          teamColor = index;
          coloursOpen = false;
        }}
      />
    </Popover>
  {/if}
</div>

{#snippet overlayButton(label: string, Icon: typeof RotateCw, onclick: () => void)}
  <button
    type="button"
    class="cursor-pointer rounded-ui bg-surface/70 p-1.5 text-muted opacity-70 hover:text-fg hover:opacity-100"
    title={label}
    aria-label={label}
    {onclick}
  >
    <Icon size={14} />
  </button>
{/snippet}
