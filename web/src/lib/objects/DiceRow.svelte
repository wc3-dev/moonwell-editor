<script lang="ts">
/**
 * A total of dice in the details panel (Sven, 2026-10-27): a unit's damage per attack or bounty as the range the game
 * rolls (Attack 1 - Damage 12 - 13), in one box again (Sven, 2026-10-29: `10-15` typed in one go), with its base,
 * number of dice and sides per die under it as fields of their own. Typing a range sets the three (one edit, keeping
 * the number of dice where it can); editing one of the three changes the range. The arrow that shows and
 * hides the three sits in the gutter left of the names, so the total's name lines up with the other fields' (Sven,
 * 2026-10-28); it takes the changed colour when one of the three is changed.
 */
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import type { ChoiceList, FieldView, Kind } from "../api.ts";
import { t } from "../text.ts";
import { type DiceFields, parseRange, rangeEdits, rangeOf, rangeText } from "./dice.ts";
import FavouriteStar from "./FavouriteStar.svelte";
import FieldRow from "./FieldRow.svelte";
import type { Lookup } from "./fields.ts";

type Props = {
  label: string;
  fields: DiceFields;
  showIds: boolean;
  choices: Record<string, ChoiceList> | null;
  lookup: Lookup;
  editable: boolean;
  onset: (field: FieldView, value: string) => Promise<string | null>;
  onreset: (field: FieldView) => Promise<string | null>;
  onopen: (kind: Kind, id: string) => void;
  /** Changes several fields as one edit; answers with why it was refused, or null. */
  onfields: (edits: { field: FieldView; value: string }[]) => Promise<string | null>;
  /** The selected field and level, as `field:level`, or a total as `base:total`. */
  selected: string | null;
  onselect: (field: FieldView) => void;
  onmenu: (field: FieldView, x: number, y: number) => void;
  /** Selects the total itself (not its base), for Ctrl C and Ctrl V. */
  onselecttotal: (dice: DiceFields) => void;
  /** A right click on the total, for its context menu. */
  ontotalmenu: (dice: DiceFields, x: number, y: number) => void;
  /** Whether the three fields show under the total. */
  open: boolean;
  ontoggle: () => void;
  /** Whether a field is a favourite; the total's star is its base's, which keeps the total in the favourites. */
  isFavourite: (field: FieldView) => boolean;
  /** Stars a field, or takes its star off. */
  onfavourite: (field: FieldView) => void;
};

let {
  label,
  fields,
  showIds,
  choices,
  lookup,
  editable,
  onset,
  onreset,
  onopen,
  onfields,
  selected,
  onselect,
  onmenu,
  onselecttotal,
  ontotalmenu,
  open,
  ontoggle,
  isFavourite,
  onfavourite,
}: Props = $props();

const parts = $derived([fields.base, fields.dice, fields.sides]);
const changed = $derived(parts.some((field) => field.changed));
const range = $derived(rangeOf(fields));
const standard = $derived(
  rangeText(
    rangeOf({
      base: { ...fields.base, value: fields.base.base },
      dice: { ...fields.dice, value: fields.dice.base },
      sides: { ...fields.sides, value: fields.sides.base },
    }),
  ),
);

// What was typed and not sent yet; null shows the range.
let draft = $state<string | null>(null);
let error = $state("");
// A range changed elsewhere (an edit of one of the three, undo) replaces what was typed.
$effect(() => {
  void range.min;
  void range.max;
  draft = null;
  error = "";
});

async function commit(): Promise<void> {
  if (draft === null) return;
  const typed = parseRange(draft);
  if (!typed) {
    error = t("dice.notRange", { field: label, text: draft });
    return;
  }
  const edits = rangeEdits(fields, typed);
  if (edits.length === 0) {
    draft = null;
    error = "";
    return;
  }
  const problem = await onfields(edits);
  error = problem ?? "";
  if (problem === null) draft = null;
}

function onkey(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commit();
  } else if (event.key === "Escape" && (draft !== null || error)) {
    event.preventDefault();
    event.stopPropagation();
    draft = null;
    error = "";
  }
}

async function resetAll(): Promise<void> {
  for (const field of parts) {
    if (field.changed) {
      const problem = await onreset(field);
      if (problem) {
        error = problem;
        return;
      }
    }
  }
}
</script>

<div
  data-changed={changed || undefined}
  class="group grid min-h-6 grid-cols-[8px_var(--label-width,220px)_minmax(120px,1fr)] items-center border-b border-hairline {selected ===
  `${fields.base.id}:total`
    ? ''
    : 'hover:bg-raised'}"
  role="group"
  aria-label={label}
  onfocusin={() => onselecttotal(fields)}
  onpointerdown={() => onselecttotal(fields)}
  oncontextmenu={(event) => {
    event.preventDefault();
    onselecttotal(fields);
    ontotalmenu(fields, event.clientX, event.clientY);
  }}
>
  <button
    type="button"
    class="flex h-full items-center justify-center focus:outline-none {changed
      ? 'text-changed'
      : 'text-faint hover:text-fg'}"
    aria-expanded={open}
    title={open ? t("dice.hideParts") : t("dice.showParts")}
    aria-label={open ? t("dice.hideParts") : t("dice.showParts")}
    onclick={ontoggle}
  >
    {#if open}<ChevronDown size={10} />{:else}<ChevronRight size={10} />{/if}
  </button>
  <span class="relative grid self-stretch">
    <button
      type="button"
      class="flex cursor-default items-center border-r border-hairline pr-5 pl-0.5 text-left focus:outline-none {selected === `${fields.base.id}:total` ? 'bg-select text-fg' : ''}"
      aria-expanded={open}
      title={open ? t("dice.hideParts") : t("dice.showParts")}
      onclick={ontoggle}
    >
      {label}
    </button>
    <FavouriteStar {label} on={isFavourite(fields.base)} onclick={() => onfavourite(fields.base)} />
  </span>
  <span class="flex min-w-0 items-center gap-1 px-1">
    {#if editable}
      <!-- Shows only its value, as the other boxes do; a field while the total is selected (Sven, 2026-10-29). -->
      <input
        class="field-sizing-content min-w-[8ch] max-w-full rounded-ui border px-1.5 py-px font-mono text-mono outline-none placeholder:text-faint focus:border-solid focus:border-accent focus:bg-field {error
          ? 'border-warn bg-warn-lo'
          : selected === `${fields.base.id}:total`
            ? 'border-transparent bg-field'
            : 'border-transparent bg-transparent hover:border-dashed hover:border-muted'} {changed ? 'text-changed' : 'text-fg'}"
        value={draft ?? rangeText(range)}
        placeholder="0"
        data-field="{fields.base.id}:total"
        aria-label={label}
        aria-invalid={!!error}
        title={changed ? t("field.standard", { value: standard }) : undefined}
        oninput={(event) => {
          draft = event.currentTarget.value;
          error = "";
        }}
        onkeydown={onkey}
        onblur={commit}
      />
      {#if changed}
        <button
          type="button"
          class="ml-auto shrink-0 px-1 text-changed hover:text-fg"
          title={t("field.resetTitle", { value: standard })}
          aria-label={t("field.resetLabel", { field: label })}
          onclick={resetAll}
        >
          ↺
        </button>
      {/if}
    {:else}
      <span class="px-1.5 py-px font-mono text-mono {changed ? 'text-changed' : 'text-fg'}"
        >{rangeText(range)}</span
      >
    {/if}
  </span>
  {#if error}
    <span class="col-start-2 col-end-4 pr-2 pb-1.5 text-warn" role="alert">{error}</span>
  {/if}
</div>
{#if open}
  {#each parts as part (part.id)}
    <FieldRow
      field={part}
      {showIds}
      {choices}
      {lookup}
      {editable}
      {onset}
      {onreset}
      {onopen}
      selected={selected === `${part.id}:0`}
      {onselect}
      {onmenu}
      nested
      favourite={isFavourite(part)}
      {onfavourite}
    />
  {/each}
{/if}
