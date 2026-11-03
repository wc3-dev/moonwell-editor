<script module lang="ts">
const shape = "min-w-[72px] rounded-ui border px-4 py-0.5";

const looks = {
  primary: `${shape} border-transparent bg-button text-normal hover:brightness-110 disabled:opacity-50`,
  plain: `${shape} border-transparent bg-raised text-normal hover:border-accent`,
  danger: `${shape} border-warning bg-warning-background text-normal hover:brightness-125`,
  outline: `${shape} border-transparent bg-raised text-normal hover:border-accent`,
  accent: `${shape} border-transparent bg-button text-normal hover:brightness-110 disabled:opacity-50`,
};
</script>

<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  look?: keyof typeof looks;
  disabled?: boolean;
  onclick: () => void;
  children: Snippet;
};

let { look = "plain", disabled = false, onclick, children }: Props = $props();

// `Dialog` focuses a button of a primary look when it opens.
const focused = $derived(look === "primary" || look === "accent");
</script>

<button type="button" class={looks[look]} data-primary={focused ? "" : undefined} {disabled} {onclick}>
  {@render children()}
</button>
