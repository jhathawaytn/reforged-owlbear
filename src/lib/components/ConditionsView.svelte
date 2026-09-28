<script lang="ts">
  import {
    PlayerCharacterStore as pc,
    addDeprivationCause,
    clearDeprivationCause,
    isOverburdened,
    filledSlots,
    inventoryCapacity,
  } from "../model/ReforgedCharacter";
  import { CONDITIONS } from "../types";
  import type { ConditionId } from "../types";

  function toggle(id: ConditionId) {
    if (id === "Deprived") {
      if ($pc.conditions.includes(id)) {
        // The generic toggle only removes a Manual cause. Rule-driven causes
        // (Food, Water, Rest, etc.) must be cleared individually so satisfying
        // one need can never erase another unmet need (§14.9 / Appendix A).
        if ($pc.deprivationCauses.includes("Manual")) {
          $pc = clearDeprivationCause($pc, "Manual");
        }
      } else {
        $pc = addDeprivationCause($pc, "Manual");
      }
      return;
    }
    $pc.conditions = $pc.conditions.includes(id)
      ? $pc.conditions.filter((c) => c !== id)
      : [...$pc.conditions, id];
  }

  function clearCause(cause: string) {
    $pc = clearDeprivationCause($pc, cause);
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
      title={
        c.effect +
        (c.id === "Deprived" && $pc.deprivationCauses.length
          ? ` Active causes: ${$pc.deprivationCauses.join(", ")}.`
          : "") +
        (c.core ? "" : " (not core Appendix A)")
      }
      on:click={() => toggle(c.id)}
    >
      {c.id}
    </button>
  {/each}
</div>
{#if $pc.deprivationCauses.length}
  <div class="mt-1 flex flex-wrap items-center gap-1 text-[9px] text-gray-600">
    <span class="font-semibold">Deprived causes:</span>
    {#each $pc.deprivationCauses as cause (cause)}
      <button
        class="border rounded px-1 py-0.5 bg-white"
        title={`Clear only the ${cause} cause (manual correction / need satisfied)`}
        on:click={() => clearCause(cause)}
      >
        {cause} ×
      </button>
    {/each}
  </div>
{/if}
