<script lang="ts">
/**
 * Per-level fields as a grid: one row per field, its levels (a doodad's variations) across. When the object can be
 * edited, each cell is the level's editor, with ↺ when the level is changed.
 */
import type { ChoiceList, FieldView, Kind } from "../api.ts";
import { t } from "../text.ts";
import FavouriteStar from "./FavouriteStar.svelte";
import FieldEditor from "./FieldEditor.svelte";
import { isChanged, type Lookup, namesOf, type Row, shownValue } from "./fields.ts";

type Props = {
  rows: Row[];
  showIds: boolean;
  choices: Record<string, ChoiceList> | null;
  lookup: Lookup;
  /** False for an object that cannot be edited: the values are only shown. */
  editable: boolean;
  onset: (field: FieldView, value: string) => Promise<string | null>;
  onreset: (field: FieldView) => Promise<string | null>;
  onopen: (kind: Kind, id: string) => void;
  /** The selected field and level, as `field:level`; null for none. */
  selected: string | null;
  onselect: (field: FieldView) => void;
  /** A right click on a level's cell, for its context menu. */
  onmenu: (field: FieldView, x: number, y: number) => void;
  /** Whether a field is a favourite. */
  isFavourite: (field: FieldView) => boolean;
  /** Stars a field, or takes its star off. */
  onfavourite: (field: FieldView) => void;
};

let {
  rows,
  showIds,
  choices,
  lookup,
  editable,
  onset,
  onreset,
  onopen,
  selected,
  onselect,
  onmenu,
  isFavourite,
  onfavourite,
}: Props = $props();

function menuOf(field: FieldView, event: MouseEvent): void {
  event.preventDefault();
  onselect(field);
  onmenu(field, event.clientX, event.clientY);
}

// Why a cell's last value was refused, by `field:level`.
let errors = $state<Record<string, string>>({});

const nameOf = namesOf((listOf, id) => lookup(listOf, id));
const columns = $derived(
  Array.from(
    { length: Math.max(0, ...rows.map((row) => row.levels?.length ?? 0)) },
    (_, index) => index + 1,
  ),
);

function cellTitle(field: FieldView, shown: string): string {
  const lines = [t("levelGrid.cellTitle", { level: field.level, value: shown })];
  if (field.changed) lines.push(t("field.standard", { value: standardOf(field) }));
  if (field.warning) lines.push(field.warning);
  return lines.join("\n");
}

function standardOf(field: FieldView): string {
  return shownValue({ ...field, value: field.base }, choices, nameOf);
}

async function reset(field: FieldView): Promise<void> {
  errors[`${field.id}:${field.level}`] = (await onreset(field)) ?? "";
}
</script>

<div class="grid grid-cols-[8px_1fr] border-b border-hairline">
  <span></span>
  <div class="overflow-x-auto py-1 pr-2 pb-2">
    <table class="border-collapse">
      <thead>
        <tr>
          <th class="border border-hairline px-2 py-0.5"></th>
          {#each columns as level (level)}
            <th class="border border-hairline px-2 py-0.5 text-right font-mono text-mono font-normal text-muted">
              {level}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr class="group" data-changed={isChanged(row) || undefined}>
            <th class="relative border border-hairline py-0.5 pr-6 pl-2 text-left font-normal whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-3.5 w-1 rounded-ui {isChanged(row) ? 'bg-changed' : ''}"></span>
                {row.label}
                {#if showIds}<span class="font-mono text-mono text-faint">{row.id}</span>{/if}
              </span>
              <FavouriteStar label={row.label} on={isFavourite(row.field)} onclick={() => onfavourite(row.field)} />
            </th>
            {#each row.levels ?? [] as field (field.level)}
              {@const shown = shownValue(field, choices, nameOf)}
              {@const key = `${field.id}:${field.level}`}
              {#if editable}
                <td
                  class="group border p-0 align-middle {field.warning || errors[key]
                    ? 'border-warn'
                    : 'border-hairline'} {selected === key ? 'bg-select' : ''}"
                  title={field.warning ?? undefined}
                  onfocusin={() => onselect(field)}
                  onpointerdown={() => onselect(field)}
                  ondblclick={async (event) => {
                    // A double click turns a True or False cell, as on a field's row (Sven, 2026-10-29).
                    if (field.type !== "bool" || (event.target as Element).closest("[aria-pressed]")) return;
                    errors[key] = (await onset(field, field.value === "1" ? "0" : "1")) ?? "";
                  }}
                  oncontextmenu={(event) => menuOf(field, event)}
                >
                  <span class="flex items-center">
                    <span class="min-w-0 flex-1">
                      <FieldEditor
                        {field}
                        {choices}
                        {lookup}
                        compact
                        selected={selected === key}
                        {showIds}
                        {onset}
                        {onopen}
                        bind:error={errors[key]}
                      />
                    </span>
                    {#if field.changed}
                      <button
                        type="button"
                        class="px-1 text-changed opacity-40 group-hover:opacity-100 hover:text-fg focus:opacity-100"
                        title={t("levelGrid.resetTitle", {
                          level: field.level,
                          value: standardOf(field) || t("field.empty"),
                        })}
                        aria-label={t("levelGrid.resetLabel", { field: row.label, level: field.level })}
                        onclick={() => reset(field)}
                      >
                        ↺
                      </button>
                    {/if}
                  </span>
                  {#if errors[key]}
                    <span class="block max-w-56 px-1.5 pb-0.5 text-small whitespace-normal text-warn" role="alert">
                      {errors[key]}
                    </span>
                  {/if}
                </td>
              {:else}
                <td
                  class="max-w-56 truncate border px-2 py-0.5 font-mono text-mono {field.type ===
                    'int' || field.type === 'float'
                    ? 'text-right'
                    : 'text-left'} {field.changed ? 'text-changed' : 'text-fg'} {field.warning
                    ? 'border-warn bg-warn-lo'
                    : 'border-hairline'}"
                  title={cellTitle(field, shown)}
                  oncontextmenu={(event) => menuOf(field, event)}
                >
                  {shown}
                </td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
