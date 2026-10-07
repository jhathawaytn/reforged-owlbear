<script lang="ts">
  import {
    PlayerCharacterStore as pc,
    isOverburdened,
    addDeprivationCause,
    clearDeprivationCause,
  } from "../model/ReforgedCharacter";
  import { notify } from "../services/Notifier";
  import { DIE_SIDES, stepDownDie } from "../types";
  import type { Attribute, UsageDieState } from "../types";
  import { rollSingleDie } from "../services/DicePlus";
  import { lostAttributes, resolveRestForCurrentCharacter } from "../services/RestRecovery";
  import TakeDamageButton from "./TakeDamageButton.svelte";

  // Overburdened (Appendix A): "your HP is immediately reduced to 0... while
  // you remain Overburdened, incoming damaging Actions strike STR directly
  // instead." "Becoming Overburdened is not itself damage," and ending it
  // doesn't say HP is restored by name - but since it never gets touched (a
  // real damage instance during this state hits STR, not HP), the real
  // stored value is simply never spent, so revealing it again once the
  // Condition ends amounts to the same thing. Shown as 0, never mutated.
  $: overburdened = isOverburdened($pc);
  $: displayHp = overburdened ? 0 : $pc.hitPoints;
  $: mortallyWounded = $pc.mortalWound && !$pc.dead;
  // §14.7: Clinging can't Catch Your Breath or recover normally.
  $: clinging = $pc.conditions.includes("Clinging");

  function incrMaxHp() {
    $pc.maxHitPoints += 1;
  }
  function decrMaxHp() {
    $pc.maxHitPoints = Math.max(1, $pc.maxHitPoints - 1);
    if ($pc.hitPoints > $pc.maxHitPoints) {
      $pc.hitPoints = $pc.maxHitPoints;
    }
  }

  // §14.1: Catch Your Breath requires a safe location, a light source, and
  // a drink of water - one Water Usage roll from an accessible Water stock.
  // A stock that depletes on this roll still supplied the drink. No
  // accessible Water stock -> Deprived, cannot Catch Your Breath. This is
  // Catch Your Breath clears Strain as part of the existing recovery helper;
  // Rest itself is a separate procedure and does not imply this water-gated action.
  async function catchYourBreath(label = "Catch Your Breath") {
    const waterItem = $pc.gear.find((g) => g.usageKind === "Water" && g.usageDie && g.usageDie !== "depleted");

    if (!waterItem) {
      $pc = addDeprivationCause($pc, "Water");
      notify(`${label}: no accessible Water stock - you're Deprived and cannot ${label}.`);
      return; // HP is NOT restored, Strain is NOT cleared
    }

    const size = waterItem.usageDie as Exclude<UsageDieState, "depleted">;
    const roll = await rollSingleDie(DIE_SIDES[size]);
    let waterNote: string;
    if (roll <= 3) {
      const stepped = stepDownDie(size);
      waterItem.usageDie = stepped;
      $pc.gear = $pc.gear;
      waterNote =
        stepped === "depleted"
          ? `${waterItem.name} depletes (still supplied the drink)`
          : `${waterItem.name} steps down to ${stepped}`;
    } else {
      waterNote = `${waterItem.name} holds`;
    }

    $pc = clearDeprivationCause($pc, "Water");
    const beforeHp = $pc.hitPoints;
    $pc.hitPoints = $pc.maxHitPoints;
    const strainCleared = $pc.strain > 0;
    $pc.strain = 0;
    notify(
      `${label}: ${waterNote}. HP restored ${beforeHp} -> ${$pc.maxHitPoints}` +
        (strainCleared ? ", Strain cleared." : "."),
    );
  }

  // Rest quality (§14.9) is resolved independently from Catch Your Breath.
  // Rest does not automatically restore HP or consume Water; those belong to
  // Catch Your Breath. Normal/Comfortable remove Fatigue, Comfortable may
  // restore one lost Attribute, and a full night's Rest can heal Light
  // Injuries when Medical supplies are available.
  let restQuality: "Perilous" | "Normal" | "Comfortable" = "Normal";
  $: restLostAttributes = lostAttributes($pc);
  let restoreAttr: Attribute = "STR";
  $: if (
    restQuality === "Comfortable" &&
    restLostAttributes.length &&
    !restLostAttributes.includes(restoreAttr)
  ) {
    restoreAttr = restLostAttributes[0];
  }

  async function restOrSleep() {
    await resolveRestForCurrentCharacter(
      restQuality,
      restQuality === "Comfortable" ? restoreAttr : undefined,
    );
  }
</script>

<h2 title={overburdened ? "Overburdened (Appendix A): HP shows 0 while filled slots exceed STR - your real HP is untouched underneath and reappears once that's no longer true." : ""}>
  HP{overburdened ? " (Overburdened)" : ""}
</h2>
<label for="hitpoints" />
<input
  id="hitpoints"
  type="number"
  inputmode="numeric"
  class="text-5xl text-center font-bold"
  class:text-red-700={overburdened}
  class:mortal-wound-stat={mortallyWounded}
  min="0"
  disabled={overburdened}
  title={overburdened ? "Overburdened - HP is forced to 0 and can't be edited until filled slots no longer exceed STR" : ""}
  value={displayHp}
  on:input={(e) => ($pc.hitPoints = parseInt(e.currentTarget.value) || 0)}
/>

<div class="flex gap-1 justify-between">
  <div>Max: {$pc.maxHitPoints}</div>
  <div>
    <button on:click={decrMaxHp}><i class="material-icons">remove</i></button>
    <button on:click={incrMaxHp}><i class="material-icons">add</i></button>
  </div>
</div>

<div class="flex flex-col gap-1">
  <TakeDamageButton />
  <button
    class="bg-black text-white rounded-md text-sm px-2 disabled:opacity-40"
    disabled={clinging}
    title={clinging ? "Clinging: can't Catch Your Breath (§14.7)." : ""}
    on:click={() => catchYourBreath()}
  >
    Catch Your Breath
  </button>
  <div class="flex gap-1">
    <select bind:value={restQuality} class="text-xs flex-1 min-w-0" title="§14.9 - Perilous prevents Rest deprivation; Normal/Comfortable remove Fatigue; a full night's Rest can heal Light Injuries with Medical supplies; Comfortable also restores 1 lost Attribute point">
      <option>Perilous</option>
      <option>Normal</option>
      <option>Comfortable</option>
    </select>
    {#if restQuality === "Comfortable" && restLostAttributes.length}
      <select bind:value={restoreAttr} class="text-xs w-16" title="Which Attribute to restore 1 point to (§14.9)">
        {#each restLostAttributes as a}<option value={a}>{a}</option>{/each}
      </select>
    {/if}
    <button
      class="bg-black text-white rounded-md text-sm px-2 disabled:opacity-40"
      disabled={clinging}
      on:click={restOrSleep}
      title={clinging ? "Clinging: can't recover normally (§14.7)." : "Resolve Rest quality. Rest is separate from Catch Your Breath: it does not automatically restore HP or consume Water."}
    >
      Rest
    </button>
  </div>
</div>
