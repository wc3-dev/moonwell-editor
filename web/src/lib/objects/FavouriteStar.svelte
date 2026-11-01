<script lang="ts">
/** A field's star (Sven, 2026-11-01): it shows while the row is hovered, and stays once the field is a favourite. */
import Star from "@lucide/svelte/icons/star";
import { t } from "../text.ts";

type Props = { label: string; on: boolean; onclick: () => void };

let { label, on, onclick }: Props = $props();

const title = $derived(
  on ? t("details.unfavourite", { field: label }) : t("details.favourite", { field: label }),
);
</script>

<button
  type="button"
  class="absolute top-1/2 right-1 -translate-y-1/2 {on
    ? 'text-accent-hi'
    : 'text-faint opacity-0 group-hover:opacity-100 hover:text-fg focus:opacity-100'}"
  {title}
  aria-label={title}
  aria-pressed={on}
  {onclick}
>
  <Star size={12} fill={on ? "currentColor" : "none"} />
</button>
