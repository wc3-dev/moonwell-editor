<script lang="ts">
/** A variable's fields, as World Editor's Variable dialog has them. A change is sent with the Save button. */

import { t } from "../text.ts";
import Select from "../ui/Select.svelte";
import type { Catalog, VariableInput } from "./api.ts";

type Props = {
  catalog: Catalog;
  value: VariableInput;
  readOnly: boolean;
  onsave: (value: VariableInput) => void;
};

let { catalog, value, readOnly, onsave }: Props = $props();

let name = $state("");
let type = $state("");
let isArray = $state(false);
let size = $state(1);
let initial = $state("");
let shown: VariableInput | null = null;

// The fields follow the variable shown; what was typed goes when another one opens.
$effect(() => {
  if (shown !== value) {
    shown = value;
    name = value.name;
    type = value.type;
    isArray = value.isArray;
    size = value.size;
    initial = value.initial;
  }
});

const options = $derived(
  catalog.types
    .filter((each) => each.global)
    .map((each) => ({ value: each.key, label: each.title })),
);
const label = "mb-1 block text-muted";
const box =
  "w-full rounded-ui border border-line bg-field px-2 py-1 text-fg outline-none focus:border-accent disabled:opacity-60";
</script>

<div class="flex max-w-[460px] flex-col gap-3">
  <label>
    <span class={label}>{t("triggers.name")}</span>
    <input class={box} bind:value={name} disabled={readOnly} spellcheck="false" />
  </label>
  <div>
    <span class={label}>{t("triggers.variable.type")}</span>
    <Select
      {options}
      value={type}
      label={t("triggers.variable.type")}
      onpick={(next) => (type = next)}
      disabled={readOnly}
      snug
    />
  </div>
  <div class="flex items-center gap-3">
    <label class="flex items-center gap-1.5">
      <input type="checkbox" bind:checked={isArray} disabled={readOnly} />
      {t("triggers.variable.array")}
    </label>
    {#if isArray}
      <label class="flex items-center gap-1.5">
        {t("triggers.variable.size")}
        <input class="{box} w-[90px]" type="number" min="1" bind:value={size} disabled={readOnly} />
      </label>
    {/if}
  </div>
  <label>
    <span class={label}>{t("triggers.variable.initial")}</span>
    <input class={box} bind:value={initial} disabled={readOnly} spellcheck="false" />
  </label>
  {#if !readOnly}
    <div>
      <button
        type="button"
        class="rounded-ui bg-primary px-3 py-1 text-fg hover:brightness-110"
        onclick={() => onsave({ name: name.trim(), type, isArray, size, initial })}
      >
        {t("triggers.variable.save")}
      </button>
    </div>
  {/if}
</div>
