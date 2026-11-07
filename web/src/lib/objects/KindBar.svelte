<script lang="ts">
/**
 * The seven kinds of object as a row of icon buttons in the header, in the Object Editor's tab order. The kind's name
 * is the button's tooltip and its name for screen readers; each kind has its own icon and colour (Sven, 2026-10-27).
 */
import { type Kind, kinds } from "../api.ts";
import { t } from "../text.ts";
import { kindIcons as icons, kindNames, kindText } from "./tree.ts";

type Props = {
  kind: Kind;
  disabled: boolean;
  onkind: (kind: Kind) => void;
};

let { kind, disabled, onkind }: Props = $props();
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
