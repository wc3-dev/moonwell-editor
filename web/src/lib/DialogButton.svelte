<script module lang="ts">
const looks = {
  primary:
    "rounded-[5px] bg-accent px-3 py-1 font-bold text-bg hover:bg-accent-hi disabled:opacity-50",
  plain: "rounded-[5px] border border-line bg-raised px-3 py-1 text-fg hover:border-accent",
  danger: "rounded-[5px] border border-warn px-3 py-1 font-bold text-warn hover:bg-warn-lo",
  outline: "rounded-md border border-line bg-raised px-3 py-1.5 text-fg hover:bg-hover",
  accent:
    "rounded-md border border-accent bg-raised px-3 py-1.5 text-fg hover:bg-hover disabled:opacity-50",
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
