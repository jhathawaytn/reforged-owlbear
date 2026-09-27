<script lang="ts">
  import { PlayerCharacterStore as pc, isOverburdened } from "../model/ReforgedCharacter";
  import { notify } from "../services/Notifier";
  import { ATTRIBUTES, DIE_SIDES, stepDownDie } from "../types";
  import type { Attribute, UsageDieState } from "../types";
  import { rollDieSides } from "../utils";
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
  // also the only way Strain clears (besides Rest/Sleep, below), so a
  // successful Catch Your Breath clears it too.
  function catchYourBreath(label = "Catch Your Breath") {
    const waterItem = $pc.gear.find((g) => g.usageKind === "Water" && g.usageDie && g.usageDie !== "depleted");

    if (!waterItem) {
      notify(`${label}: no accessible Water stock - you're Deprived and cannot ${label}.`);
      return; // HP is NOT restored, Strain is NOT cleared
    }

    const size = waterItem.usageDie as Exclude<UsageDieState, "depleted">;
    const roll = rollDieSides(DIE_SIDES[size]);
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

    const beforeHp = $pc.hitPoints;
    $pc.hitPoints = $pc.maxHitPoints;
    const strainCleared = $pc.strain > 0;
    $pc.strain = 0;
    notify(
      `${label}: ${waterNote}. HP restored ${beforeHp} -> ${$pc.maxHitPoints}` +
        (strainCleared ? ", Strain cleared." : "."),
    );
  }

  // Rest quality (§14.9): Perilous only prevents Deprived-from-lack-of-Rest;
  // Normal also removes all Fatigue; Comfortable also restores 1 lost
  // Attribute point (up to that Attribute's unreduced maximum). HP
  // restoration/Strain clearing reuse Catch Your Breath's water-gated
  // mechanic (§14.1) - a full Rest obviously includes catching your breath.
  let restQuality: "Perilous" | "Normal" | "Comfortable" = "Normal";
  $: lostAttributes = ATTRIBUTES.filter((a) => $pc.attributes[a] < $pc.attributeMax[a]);
  let restoreAttr: Attribute = "STR";
  $: if (restQuality === "Comfortable" && lostAttributes.length && !lostAttributes.includes(restoreAttr)) {
    restoreAttr = lostAttributes[0];
  }

  // Light Injury healing (§14.4): needs "appropriate herbs or supplies and a
  // full night's rest" - modeled as an accessible Medical Usage Die stock,
  // gated the same way Water gates Catch Your Breath. Perilous Rest isn't a
  // full night's rest, so it doesn't heal Light Injuries either.
  function healLightInjuries() {
    const medItem = $pc.gear.find((g) => g.usageKind === "Medical" && g.usageDie && g.usageDie !== "depleted");
    const lightInjuries = $pc.injuries.filter((i) => i.severity === "Light");
    if (!lightInjuries.length) return;
    if (!medItem) {
      notify(`Rest: ${lightInjuries.length} Light Injury(ies) can't heal - no accessible Medical supplies.`);
      return;
    }
    const size = medItem.usageDie as Exclude<UsageDieState, "depleted">;
    const roll = rollDieSides(DIE_SIDES[size]);
    if (roll <= 3) {
      const stepped = stepDownDie(size);
      medItem.usageDie = stepped;
      $pc.gear = $pc.gear;
    }
    $pc.injuries = $pc.injuries.filter((i) => i.severity !== "Light");
    notify(`Rest: ${medItem.name} treats ${lightInjuries.length} Light Injury(ies) - healed.`);
  }

  function restOrSleep() {
    const hadWater = $pc.gear.some((g) => g.usageKind === "Water" && g.usageDie && g.usageDie !== "depleted");
    catchYourBreath(`${restQuality} Rest`);
    if (hadWater && restQuality !== "Perilous") {
      if ($pc.fatigue > 0) {
        const cleared = $pc.fatigue;
        $pc.fatigue = 0;
        notify(`${restQuality} Rest: ${cleared} Fatigue removed.`);
      }
      healLightInjuries();
      if (restQuality === "Comfortable" && lostAttributes.includes(restoreAttr)) {
        const before = $pc.attributes[restoreAttr];
        $pc.attributes = { ...$pc.attributes, [restoreAttr]: before + 1 };
        notify(`Comfortable Rest: ${restoreAttr} restored ${before} -> ${before + 1}.`);
      }
    }
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
  <button class="bg-black text-white rounded-md text-sm px-2" on:click={() => catchYourBreath()}>
    Catch Your Breath
  </button>
  <div class="flex gap-1">
    <select bind:value={restQuality} class="text-xs flex-1 min-w-0" title="§14.9 - Normal or Comfortable also removes Fatigue and heals Light Injuries (needs Medical supplies); Comfortable also restores 1 lost Attribute point">
      <option>Perilous</option>
      <option>Normal</option>
      <option>Comfortable</option>
    </select>
    {#if restQuality === "Comfortable" && lostAttributes.length}
      <select bind:value={restoreAttr} class="text-xs w-16" title="Which Attribute to restore 1 point to (§14.9)">
        {#each lostAttributes as a}<option value={a}>{a}</option>{/each}
      </select>
    {/if}
    <button class="bg-black text-white rounded-md text-sm px-2" on:click={restOrSleep} title="Restores HP and clears Strain (needs Water); Normal/Comfortable also clears Fatigue and heals Light Injuries; Comfortable also restores 1 lost Attribute point">
      Rest
    </button>
  </div>
</div>
