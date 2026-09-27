<script lang="ts">
  import { PlayerCharacterStore as pc, canUseTechnique, useTechnique } from "../model/ReforgedCharacter";
  import { newId } from "../utils";
  import { rollNotation } from "../services/DicePlus";
  import { notify } from "../services/Notifier";
  import { stepWeaponDie, stepWeaponDieUp } from "../types";
  import type { Attack, GearItem } from "../types";
  import WeaponStressButton from "./WeaponStressButton.svelte";
  import GambitButton from "./GambitButton.svelte";

  function addAttack() {
    $pc.attacks = [...$pc.attacks, { id: newId(), name: "", roll: "d6", notes: "" }];
  }
  function removeAttack(a: Attack) {
    $pc.attacks = $pc.attacks.filter((x) => x.id !== a.id);
  }

  function linkedGear(a: Attack): GearItem | undefined {
    return a.gearId ? $pc.gear.find((g) => g.id === a.gearId) : undefined;
  }

  // Weapon Condition (§9.4.2): Damaged steps the native die down one size;
  // Broken has no normal damage. Profile is unchanged either way - only
  // rolling reads this, a.roll itself always stays the Healthy/native die.
  function effectiveRoll(a: Attack): { notation: string; broken: boolean } {
    const gear = linkedGear(a);
    if (!gear || gear.condition === "Healthy" || !gear.condition) return { notation: a.roll, broken: false };
    if (gear.condition === "Damaged") return { notation: stepWeaponDie(a.roll), broken: false };
    return { notation: a.roll, broken: true };
  }

  async function rollAttack(a: Attack) {
    const { notation, broken } = effectiveRoll(a);
    if (broken) {
      notify(`${a.name || "Attack"}: Broken - no normal damage.`);
      return;
    }
    const result = await rollNotation(notation);
    if (!result) {
      notify(`${a.name || "Attack"}: couldn't parse "${notation}" (try e.g. d6, 2d6+1)`);
      return;
    }
    notify(`${a.name || "Attack"}: ${result.breakdown}`);
  }

  // Act Decisively (§13.6, Initiative only): step the die UP one size before
  // rolling. This is a one-time boost for this Action only - a.roll itself
  // never changes.
  async function rollActDecisively(a: Attack) {
    if (!canUseTechnique($pc, "Act Decisively")) return;
    const { notation, broken } = effectiveRoll(a);
    if (broken) {
      notify(`${a.name || "Attack"}: Broken - no normal damage.`);
      return;
    }
    const stepped = stepWeaponDieUp(notation);
    const result = await rollNotation(stepped);
    if (!result) {
      notify(`${a.name || "Attack"}: couldn't parse "${stepped}"`);
      return;
    }
    useTechnique($pc, "Act Decisively");
    $pc = $pc;
    notify(`${a.name || "Attack"} (Act Decisively, ${notation} → ${stepped}): ${result.breakdown}`);
  }

  // Tactical Consideration (§13.6, Clash only): reroll one of your own dice,
  // must keep the second result - resolved here as rolling twice and only
  // reporting the kept (second) roll.
  async function rollTacticalConsideration(a: Attack) {
    if (!canUseTechnique($pc, "Tactical Consideration")) return;
    const { notation, broken } = effectiveRoll(a);
    if (broken) {
      notify(`${a.name || "Attack"}: Broken - no normal damage.`);
      return;
    }
    const first = await rollNotation(notation);
    const second = await rollNotation(notation);
    if (!first || !second) {
      notify(`${a.name || "Attack"}: couldn't parse "${notation}"`);
      return;
    }
    useTechnique($pc, "Tactical Consideration");
    $pc = $pc;
    notify(
      `${a.name || "Attack"} (Tactical Consideration): first roll ${first.breakdown}, rerolled and kept ${second.breakdown}.`,
    );
  }
</script>

<h2>ATTACKS &amp; TECHNIQUES</h2>
<div class="overflow-auto flex-1 min-w-0">
  <table class="table-auto text-left text-sm w-full">
    <tr class="border-b">
      <th>Name</th>
      <th>Roll</th>
      <th></th>
    </tr>
    {#each $pc.attacks as a (a.id)}
      {@const gear = linkedGear(a)}
      {@const eff = effectiveRoll(a)}
      {@const stressable = !!gear && gear.condition !== "Broken" && gear.condition !== "Destroyed"}
      {@const gambitable = !gear || (gear.condition !== "Broken" && gear.condition !== "Destroyed")}
      {@const canActDecisively = $pc.combatActive && $pc.combatStage === "Initiative" && canUseTechnique($pc, "Act Decisively")}
      {@const canTacticalConsider = $pc.combatActive && $pc.combatStage === "Clash" && canUseTechnique($pc, "Tactical Consideration")}
      <tr class="border-b">
        <td>
          <input type="text" bind:value={a.name} placeholder="Longsword" class="w-full" />
          <input
            type="text"
            bind:value={a.notes}
            placeholder="Balanced, can Block"
            class="w-full text-[10px] text-gray-500 mt-0.5"
          />
        </td>
        <td>
          <div class="flex gap-1 items-center flex-wrap">
            <input type="text" bind:value={a.roll} placeholder="d8+1" class="w-16" />
            <button class="bg-black text-white px-1 rounded-md text-xs" on:click={() => rollAttack(a)}>
              Roll
            </button>
            {#if stressable}
              <!-- §9.4.6 - Weapon Stress (Brutal, Cleaving, Vicious, and the
                   universal Drive Through/Force Maneuver options), gated to
                   this weapon's own Special Stress Property. Precise and
                   Guarding are defensive options used on a Block/Parry
                   Reaction instead - see Take Damage. -->
              <WeaponStressButton attack={a} gear={gear} />
            {/if}
            {#if gambitable}
              <!-- §13.9 - trade some/all of this roll for a tactical effect;
                   available on any Action, not gated to a linked weapon. -->
              <GambitButton attack={a} {gear} />
            {/if}
            {#if canActDecisively}
              <button
                class="border rounded-md px-1 text-xs whitespace-nowrap"
                title="Act Decisively (Technique) - step the die up one size for this Initiative Action"
                on:click={() => rollActDecisively(a)}
              >
                Act Decisively
              </button>
            {/if}
            {#if canTacticalConsider}
              <button
                class="border rounded-md px-1 text-xs whitespace-nowrap"
                title="Tactical Consideration (Technique) - reroll, must keep the second result"
                on:click={() => rollTacticalConsideration(a)}
              >
                Tactical Consideration
              </button>
            {/if}
          </div>
          {#if gear && gear.condition && gear.condition !== "Healthy"}
            <div class="text-[10px] text-gray-500">
              {gear.condition}{eff.broken ? " - no normal damage" : ` - rolls ${eff.notation}`}
            </div>
          {/if}
        </td>
        <td>
          <button class="text-red-700" on:click={() => removeAttack(a)}>
            <i class="material-icons text-sm">close</i>
          </button>
        </td>
      </tr>
    {/each}
  </table>
</div>
<button class="bg-black text-white rounded-md text-xs self-center px-2 mt-1" on:click={addAttack}>
  + Add Attack
</button>
