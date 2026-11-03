<script lang="ts">
/**
 * The seven kinds of object as a row of icon buttons in the header, in the Object Editor's tab order. The kind's name
 * is the button's tooltip and its name for screen readers; each kind has its own icon and colour (Sven, 2026-10-27).
 */
import Flame from "@lucide/svelte/icons/flame";
import HandFist from "@lucide/svelte/icons/hand-fist";
import Lamp from "@lucide/svelte/icons/lamp";
import LayersPlus from "@lucide/svelte/icons/layers-plus";
import Sword from "@lucide/svelte/icons/sword";
import Trees from "@lucide/svelte/icons/trees";
import User from "@lucide/svelte/icons/user";
import type { Component } from "svelte";
import { type Kind, kinds } from "../api.ts";
import { t } from "../text.ts";
import { kindNames, kindText } from "./tree.ts";

type Props = {
  kind: Kind;
  disabled: boolean;
  onkind: (kind: Kind) => void;
};

let { kind, disabled, onkind }: Props = $props();

const icons: Record<Kind, Component<{ size?: number }>> = {
  unit: User,
  item: Sword,
  destructable: Trees,
  doodad: Lamp,
  ability: HandFist,
  buff: Flame,
  upgrade: LayersPlus,
};
</script>

<div class="flex shrink-0 gap-0.5" role="group" aria-label={t("kindBar.label")}>
  {#each kinds as each (each)}
    {@const Icon = icons[each]}
    <button
      type="button"
      class="tool-button disabled:opacity-50 {kindText[each]} {each === kind
        ? ''
        : 'opacity-70 hover:opacity-100'}"
      title={kindNames[each]}
      aria-label={kindNames[each]}
      aria-pressed={each === kind}
      {disabled}
      onclick={() => onkind(each)}
    >
      <Icon size={16} />
    </button>
  {/each}
</div>
