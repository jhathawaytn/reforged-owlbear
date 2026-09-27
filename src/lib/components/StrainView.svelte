<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";

  function incr() {
    $pc.strain += 1;
  }
  function decr() {
    $pc.strain = Math.max(0, $pc.strain - 1);
  }
</script>

<h2
  title="Strain (§13.11): builds up during a fight from pushing yourself past normal limits. Each point costs 1 Inventory Slot while it lasts. Clears via Catch Your Breath or Rest."
>
  STRAIN
</h2>
<div class="flex-1 flex items-center justify-center gap-2">
  <button on:click={decr}><i class="material-icons">remove</i></button>
  <span class="text-4xl font-bold w-12 text-center">{$pc.strain}</span>
  <button on:click={incr}><i class="material-icons">add</i></button>
</div>
<div class="text-xs text-center" title="Each point of Strain costs 1 Inventory Slot until cleared">1 slot each</div>
