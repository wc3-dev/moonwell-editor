<script lang="ts">
/** Stands in for `RichText` in tests of the tooltip editor: TipTap needs a real browser. */
type Props = {
  markup: string;
  label: string;
  onchange: (markup: string) => void;
  onfocus?: () => void;
};

let { markup, label, onchange, onfocus }: Props = $props();

let colour = $state("");

export function color(css: string | null): void {
  colour = css ?? "";
}

export function insert(): void {}
</script>

<input aria-label={label} data-colour={colour} value={markup} {onfocus} oninput={(event) => onchange(event.currentTarget.value)} />
