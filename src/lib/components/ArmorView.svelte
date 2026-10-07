<script lang="ts">
  import { PlayerCharacterStore as pc, totalArmor, hasIronDiscipline } from "../model/ReforgedCharacter";
  import { CONDITION_COLOR_CLASS } from "../types";

  $: total = totalArmor($pc);
  $: wornArmor = $pc.gear.filter((g) => g.armorValue !== undefined && g.equipped);
  $: ironDiscipline = hasIronDiscipline($pc);
</script>

<h2 title="Sum of equipped Armor gear's A-value. Normal ceiling is A4 (§13.13).">ARMOR</h2>
<div class="flex-1 flex flex-col min-h-0">
  <div class="text-6xl font-bold text-center" title="Sum of equipped Armor gear's A-value. Normal ceiling is A4 (§13.13).">
    A{total}
  </div>

  {#if wornArmor.length}
    <div class="text-[10px] mt-1 flex flex-col gap-0.5 overflow-y-auto">
      {#each wornArmor as g (g.id)}
        <div class="flex items-center justify-between gap-1" title={g.properties?.length ? g.properties.join(", ") : ""}>
          <span class="truncate">{g.name || "(unnamed)"} (A{g.armorValue})</span>
          <span class="font-bold {CONDITION_COLOR_CLASS[g.condition ?? 'Healthy']}">{g.condition ?? "Healthy"}</span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-[10px] text-gray-400 text-center mt-1">No Armor equipped - see the Equipment page's Gear table.</div>
  {/if}

  {#if ironDiscipline}
    <label
      class="flex items-center gap-1 text-[10px] mt-1 cursor-pointer"
      title="Iron Discipline (Armor R3, §9.5.7): the first Deflect step this box absorbs instead of degrading the armor; the second clears the box and degrades normally. Normally set automatically by Take Damage - correct it by hand if needed."
    >
      <input type="checkbox" class="w-auto" bind:checked={$pc.armorWear} />
      Armor Wear marked
    </label>
  {/if}

  <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] mt-1">
    <label class="flex items-center gap-1 cursor-pointer" title="Dies within one hour unless stabilized (§14.5). Set automatically by Take Damage; the GM's Stabilized button on the banner clears it. Tick by hand only to correct a mistake.">
      <input type="checkbox" class="w-auto" bind:checked={$pc.mortalWound} />
      Mortal Wound
    </label>
    <label class="flex items-center gap-1 cursor-pointer" title="A Mortal Wound suffered later this session cannot be stabilized. Clear at session end.">
      <input type="checkbox" class="w-auto" bind:checked={$pc.doomActive} />
      Doom
    </label>
    <label class="flex items-center gap-1 cursor-pointer" title="Your next Action is Impaired (Scar: Stunned). Clear once that Action is taken.">
      <input type="checkbox" class="w-auto" bind:checked={$pc.impairedNextAction} />
      Impaired (next)
    </label>
    <label class="flex items-center gap-1 cursor-pointer" title="Next time you gain a Level, roll HP Growth twice and keep the higher result, then this clears automatically (Scar: Tempered).">
      <input type="checkbox" class="w-auto" bind:checked={$pc.temperedPending} />
      Tempered
    </label>
  </div>
</div>
