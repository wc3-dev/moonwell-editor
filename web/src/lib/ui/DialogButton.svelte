<script module lang="ts">
const shape = "min-w-[72px] rounded-ui border px-4 py-0.5";

const looks = {
  primary: `${shape} border-transparent bg-primary text-fg hover:brightness-110 disabled:opacity-50`,
  plain: `${shape} border-transparent bg-raised text-fg hover:border-accent`,
  danger: `${shape} border-warn bg-warn-lo text-fg hover:brightness-125`,
  outline: `${shape} border-transparent bg-raised text-fg hover:border-accent`,
  accent: `${shape} border-transparent bg-primary text-fg hover:brightness-110 disabled:opacity-50`,
};
</script>

<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  look?: keyof typeof looks;
  /** `Dialog` focuses this button when it opens; the primary looks do without being told. */
  takesFocus?: boolean;
  disabled?: boolean;
  onclick: () => void;
  children: Snippet;
};

let { look = "plain", takesFocus, disabled = false, onclick, children }: Props = $props();

const focused = $derived(takesFocus ?? (look === "primary" || look === "accent"));
</script>

<button type="button" class={looks[look]} data-primary={focused ? "" : undefined} {disabled} {onclick}>
  {@render children()}
</button>
