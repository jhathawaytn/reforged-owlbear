<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { coinBurdenSlots } from "../types";

  $: burden = coinBurdenSlots({
    farthings: $pc.farthings,
    silverPennies: $pc.silverPennies,
    goldPieces: $pc.goldPieces,
    goldCrowns: $pc.goldCrowns,
  });
</script>

<h2 title="§9.1.5 - each denomination is tracked separately: at/below its free threshold it's weightless, above it adds slots. Farthing free to 1,000 (2,000/slot above); Silver Penny free to 250 (500/slot); Gold Piece free to 25 (100/slot); Gold Crown free to 1 (25/slot).">
  COIN{burden > 0 ? ` (${burden} slot${burden === 1 ? "" : "s"})` : ""}
</h2>
<div class="grid grid-cols-4 gap-1 text-sm min-w-0">
  <label class="min-w-0" title="Farthings">
    fa
    <input type="number" inputmode="numeric" bind:value={$pc.farthings} min="0" class="w-full min-w-0 px-1" />
  </label>
  <label class="min-w-0" title="Silver Pennies">
    sp
    <input type="number" inputmode="numeric" bind:value={$pc.silverPennies} min="0" class="w-full min-w-0 px-1" />
  </label>
  <label class="min-w-0" title="Gold Pieces">
    gp
    <input type="number" inputmode="numeric" bind:value={$pc.goldPieces} min="0" class="w-full min-w-0 px-1" />
  </label>
  <label class="min-w-0" title="Gold Crowns">
    gc
    <input type="number" inputmode="numeric" bind:value={$pc.goldCrowns} min="0" class="w-full min-w-0 px-1" />
  </label>
</div>
