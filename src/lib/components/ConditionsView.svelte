<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { isOverburdened, filledSlots, inventoryCapacity } from "../model/ReforgedCharacter";
  import { CONDITIONS } from "../types";
  import type { ConditionId } from "../types";

  function toggle(id: ConditionId) {
    if (id === "Deprived") {
      if ($pc.conditions.includes(id)) {
        $pc.conditions = $pc.conditions.filter((c) => c !== id);
        $pc.deprivationCauses = [];
      } else {
        $pc.conditions = [...$pc.conditions, id];
        $pc.deprivationCauses = ["Manual"];
      }
      return;
    }
    $pc.conditions = $pc.conditions.includes(id)
      ? $pc.conditions.filter((c) => c !== id)
      : [...$pc.conditions, id];
  }

  $: overburdened = isOverburdened($pc);
  $: capacity = inventoryCapacity($pc);
  $: used = filledSlots($pc);
</script>

<div class="flex justify-between items-center gap-1">
  <h2 title="Appendix A - Conditions Reference. Click to mark a condition active; nothing here enforces its effect automatically.">
    CONDITIONS
  </h2>
  <span
    class="text-[9px] rounded px-1 whitespace-nowrap {overburdened ? 'bg-red-600 text-white' : 'text-gray-500'}"
    title="Gear slots used vs. STR capacity - see the Equipment page for the full breakdown. Overburdened: HP is immediately 0, and while it lasts, damaging Actions strike STR directly instead of HP."
  >
    {capacity} slots, {Math.max(0, capacity - used)} free{overburdened ? ", OVERBURDENED" : ""}
  </span>
</div>
<div class="flex-1 overflow-auto grid grid-cols-4 gap-1 content-start mt-1">
  {#each CONDITIONS as c (c.id)}
    <button
      class="text-[10px] px-1 py-0.5 rounded-md border whitespace-nowrap"
      class:bg-black={$pc.conditions.includes(c.id)}
      class:text-white={$pc.conditions.includes(c.id)}
      class:italic={!c.core}
      title={c.effect + (c.core ? "" : " (not core Appendix A)")}
      on:click={() => toggle(c.id)}
    >
      {c.id}
    </button>
  {/each}
</div>
