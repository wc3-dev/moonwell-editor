<script lang="ts">
/**
 * The 24 player colours as a grid of squares, the chosen one outlined; a click picks one. The model preview's colour
 * list and the settings' default team colour (Sven, 2026-10-29) both show it.
 */
import { RadioGroup } from "bits-ui";
import { playerIndex, teamColors } from "../teamColors.ts";
import { t } from "../text.ts";

type Props = {
  /** The chosen player, 0 for player 1 (Red) to 23 (Peanut). */
  value: number;
  onpick: (index: number) => void;
};

let { value, onpick }: Props = $props();
</script>

<RadioGroup.Root
  class="grid w-[264px] grid-cols-12 gap-0.5"
  orientation="horizontal"
  aria-label={t("model.teamColour")}
  value={String(playerIndex(value))}
  onValueChange={(index) => onpick(Number(index))}
>
  {#each teamColors as colour, index (colour.name)}
    <RadioGroup.Item
      value={String(index)}
      class="aspect-square rounded-ui border {playerIndex(value) === index
        ? 'relative z-10 border-deep outline-2 outline-normal'
        : 'border-line hover:border-muted'}"
      style="background-color: {colour.hex}"
      title={t("model.playerTitle", { player: index + 1, colour: colour.name })}
      aria-label={t("model.playerLabel", { player: index + 1, colour: colour.name })}
    />
  {/each}
</RadioGroup.Root>
