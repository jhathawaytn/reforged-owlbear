<script lang="ts">
  import { PlayerCharacterStore as pc, canUseTechnique, useTechnique, startCombat, endCombat, advanceCombatStage } from "../model/ReforgedCharacter";
  import { techniqueCapacityForLevel, TECHNIQUES, COMBAT_STAGES, DIE_SIDES } from "../types";
  import type { TechniqueName, CombatStage, DieSize } from "../types";
  import { stocksToRollAfterCombat, ammunitionAfterRoll } from "../ammunition";
  import { rollSingleDie } from "../services/DicePlus";
  import { notify } from "../services/Notifier";
  import type { SaveRollResult } from "../utils";
  import RollButton from "./RollButton.svelte";
  import Modal from "./Modal.svelte";

  $: capacity = techniqueCapacityForLevel($pc.level);
  $: used = $pc.techniquesUsedNames.length;

  let showModal = false;

  // These four Techniques modify a specific roll mid-flow, so they're used
  // directly at the point of that roll instead of from a "Use" button here:
  // Act Decisively/Tactical Consideration in Attacks & Techniques, Defensive
  // Maneuvering/Hold Fast in Take Damage. Shown here for reference only.
  const HOOKED_ELSEWHERE: Partial<Record<TechniqueName, string>> = {
    "Act Decisively": "Used from Attacks & Techniques, when rolling during Initiative.",
    "Tactical Consideration": "Used from Attacks & Techniques, right after rolling during the Clash.",
    "Defensive Maneuvering": "Used from Take Damage, when choosing a Block/Dodge/Parry/Fight Back Reaction.",
    "Hold Fast": "Used from Take Damage, after Armor and Deflect resolve.",
  };

  let initiativeFailed = false;
  function onInitiativeRolled(e: CustomEvent<SaveRollResult>) {
    initiativeFailed = !e.detail.success;
  }

  function useStandalone(name: TechniqueName) {
    if (!canUseTechnique($pc, name)) return;
    useTechnique($pc, name);
    $pc = $pc;
    if (name === "Take the Initiative") {
      initiativeFailed = false;
    }
    if (name === "Desperate Effort") {
      $pc.strain += 2;
    }
  }

  function doStart() {
    startCombat($pc);
    $pc = $pc;
    initiativeFailed = false;
  }
  // §9.4.8 - each ammunition stock fired from this combat rolls its Usage
  // Die once now; 1–3 steps it down.
  let ending = false;
  async function doEnd() {
    if (ending) return;
    ending = true;
    try {
      const lines: string[] = [];
      for (const stock of stocksToRollAfterCombat($pc)) {
        const before = stock.usageDie as DieSize;
        const roll = await rollSingleDie(DIE_SIDES[before], { rollTarget: "everyone", showResults: true });
        const after = ammunitionAfterRoll(before, roll);
        stock.usageDie = after;
        lines.push(`${stock.name} ${before}: ${roll} - ${after === before ? "holds" : after === "depleted" ? "depleted" : `steps to ${after}`}`);
      }
      endCombat($pc);
      $pc = $pc;
      initiativeFailed = false;
      if (lines.length) notify(`After combat, ammunition: ${lines.join("; ")}.`);
    } finally {
      ending = false;
    }
  }
  function doAdvance() {
    advanceCombatStage($pc);
    $pc = $pc;
    initiativeFailed = false;
  }

  function nextStageLabel(stage: CombatStage | null): string {
    if (stage === "Initiative") return "Resolve the Clash";
    if (stage === "Clash") return "Begin the Fray";
    if (stage === "Fray") return "New Fray Round";
    return "";
  }

  function why(name: TechniqueName): string {
    if (!$pc.combatActive) return "Not in combat";
    if ($pc.techniquesUsedNames.includes(name)) return "Already used this combat";
    if ($pc.techniqueUsedThisStageInstance) return "Already used a Technique this stage";
    if (used >= capacity) return "Technique capacity spent for this combat";
    return "";
  }
</script>

<h2 title="Technique capacity by Level (§13.6.1): 1-2 -> 1, 3-4 -> 2, 5-7 -> 3, 8-10 -> 4. Once per combat, and at most one per Initiative/Clash/Fray Round.">
  COMBAT
</h2>
<div class="flex-1 flex flex-col items-center justify-center gap-1">
  <div class="flex items-center gap-2" title="Techniques used this combat, Level {$pc.level}">
    {#each Array(capacity) as _, i (i)}
      <span class="w-4 h-4 rounded-full border border-black inline-block" class:bg-black={i < used} />
    {/each}
  </div>
  <div class="text-[10px] text-gray-500">
    {$pc.combatActive ? `${$pc.combatStage}${$pc.combatStage === "Fray" ? ` (Round ${$pc.frayRound})` : ""}` : "Not in combat"}
  </div>
</div>
<div class="flex items-center justify-end">
  <button class="bg-black text-white rounded-md px-2 text-xs" on:click={() => (showModal = true)}>Combat</button>
</div>

<Modal bind:showModal vw={55}>
  <h1 slot="header">Combat</h1>
  <div class="w-full flex flex-col gap-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
    <div class="flex items-center gap-2">
      {#if $pc.combatActive}
        <button class="border rounded-md px-2 py-1 text-xs" on:click={doEnd} disabled={ending}>End Combat</button>
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={doAdvance}>
          {nextStageLabel($pc.combatStage)}
        </button>
        <span class="text-xs text-gray-500">
          Stage: <strong>{$pc.combatStage}</strong>{$pc.combatStage === "Fray" ? ` - Round ${$pc.frayRound}` : ""}
        </span>
      {:else}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={doStart}>Start Combat</button>
        <span class="text-xs text-gray-500">Not currently in combat.</span>
      {/if}
    </div>
    <div class="text-xs text-gray-500">
      Technique capacity: {used}/{capacity} used this combat (Level {$pc.level}). Ending combat clears Strain
      (§13.11.4) and resets Technique use - only click it once the encounter has genuinely ended.
    </div>

    {#if $pc.combatActive && $pc.combatStage === "Initiative"}
      <div class="border rounded-md p-2 flex items-center gap-2">
        <span class="text-xs">Initiative (DEX Save):</span>
        <RollButton label="Initiative" target={$pc.attributes.DEX} on:rolled={onInitiativeRolled}>
          <div class="rounded-md bg-black text-white px-2 py-1 text-xs flex items-center gap-1">
            <i class="material-icons text-sm">casino</i> Roll Initiative
          </div>
        </RollButton>
        {#if initiativeFailed}
          <span class="text-xs text-red-700">Failed - Take the Initiative below to treat it as a success.</span>
        {/if}
      </div>
    {/if}

    {#each COMBAT_STAGES as stage (stage)}
      <div class="text-xs font-bold mt-1">{stage} Techniques</div>
      {#each TECHNIQUES.filter((t) => t.stage === stage) as t (t.name)}
        {@const hooked = HOOKED_ELSEWHERE[t.name]}
        {@const usable = canUseTechnique($pc, t.name)}
        {@const alreadyUsed = $pc.techniquesUsedNames.includes(t.name)}
        <div class="border rounded-md p-2">
          <div class="flex justify-between items-start gap-2">
            <div class="font-bold text-xs">{t.name}</div>
            {#if !hooked}
              <button
                class="text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
                class:bg-black={usable}
                class:text-white={usable}
                class:bg-gray-300={!usable}
                class:text-gray-500={!usable}
                disabled={!usable}
                title={usable ? "" : alreadyUsed ? "Already used this combat" : why(t.name)}
                on:click={() => useStandalone(t.name)}
              >
                {alreadyUsed ? "Used" : "Use"}
              </button>
            {/if}
          </div>
          <div class="text-[10px] text-gray-500 italic">{t.opportunity}</div>
          <div class="text-xs mt-0.5">{t.effect}</div>
          {#if hooked}
            <div class="text-[10px] text-gray-400 mt-0.5">{hooked}{alreadyUsed ? " (used this combat)" : ""}</div>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</Modal>
