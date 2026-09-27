<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { filledSlots, inventoryCapacity, isOverburdened, slotsForZone, zoneCapacity } from "../model/ReforgedCharacter";
  import { newId } from "../utils";
  import {
    GEAR_ZONES,
    QUALITIES,
    INJURY_SEVERITIES,
    INJURY_LOCATIONS,
    occupiesSlotWhenDepleted,
    degradeCondition,
    repairCondition,
    injuryTooltip,
    PERMANENT_INJURY_ATTRIBUTE,
    PERMANENT_INJURY_CONSEQUENCE,
    CONDITION_COLOR_CLASS,
  } from "../types";
  import type { GearItem, Injury } from "../types";
  import GearShopButton from "./gear/GearShopButton.svelte";
  import { applyStartingKit } from "../compendium";

  function isFreedByDepletion(g: GearItem): boolean {
    return g.usageDie === "depleted" && !occupiesSlotWhenDepleted(g.usageKind);
  }

  function addCustomGear() {
    $pc.gear = [
      ...$pc.gear,
      { id: newId(), name: "", zone: "Backpack", slots: 1, equipped: false, notes: "" },
    ];
  }
  function removeGear(g: GearItem) {
    $pc.gear = $pc.gear.filter((x) => x.id !== g.id);
  }

  function addInjury() {
    $pc.injuries = [...$pc.injuries, { id: newId(), severity: "Light", location: "Leg", notes: "" }];
  }
  function removeInjury(i: Injury) {
    $pc.injuries = $pc.injuries.filter((x) => x.id !== i.id);
  }

  // Which Attribute a Permanent Injury lowers (§14.4) - fixed for every
  // location except Head, which is the GM's call per the book.
  function permanentAttrFor(i: Injury) {
    return i.location === "Head" ? i.headAttribute : PERMANENT_INJURY_ATTRIBUTE[i.location];
  }

  // One-time application (not derived/auto-reversing - see the `applied`
  // comment in types.ts): lowers the mapped Attribute by 1, and for Torso
  // also lowers max HP by 1 (§14.4's only location with a second effect).
  function applyPermanentInjury(i: Injury) {
    if (i.applied) return;
    const attr = permanentAttrFor(i);
    if (!attr) return;
    $pc.attributes = { ...$pc.attributes, [attr]: $pc.attributes[attr] - 1 };
    if (i.location === "Torso") {
      $pc.maxHitPoints = $pc.maxHitPoints - 1;
      $pc.hitPoints = Math.min($pc.hitPoints, $pc.maxHitPoints);
    }
    i.applied = true;
    $pc.injuries = $pc.injuries;
  }

  function degrade(g: GearItem) {
    degradeCondition(g);
    $pc.gear = $pc.gear;
  }
  function repair(g: GearItem) {
    repairCondition(g);
    $pc.gear = $pc.gear;
  }

  $: capacity = inventoryCapacity($pc);
  $: used = filledSlots($pc);
  $: overburdened = isOverburdened($pc);
  $: startingKitLocked = $pc.startingKitApplied || $pc.characterCreationFinalized;

  // Soft per-zone caps (§9.1.2) - a warning only, never enforced. Backpack's
  // "cap" is just whatever capacity remains once Hand/Handy/Worn/Fatigue &
  // Injury/Strain are accounted for, so it can't be overfilled independently
  // of already being Overburdened overall - shown anyway for a complete
  // zone-by-zone picture.
  $: zoneUsage = GEAR_ZONES.map((zone) => ({
    zone,
    used: slotsForZone($pc, zone),
    cap: zoneCapacity($pc, zone),
  }));
</script>

<div class="flex justify-between items-center gap-2 flex-wrap">
  <h2>
    GEAR ({capacity} slots, {Math.max(0, capacity - used)} free{overburdened ? ", OVERBURDENED" : ""})
  </h2>
  <div class="flex gap-1">
    <button
      class="px-2 rounded-md text-sm"
      class:bg-black={!startingKitLocked}
      class:text-white={!startingKitLocked}
      class:bg-gray-300={startingKitLocked}
      class:text-gray-500={startingKitLocked}
      disabled={startingKitLocked}
      title={startingKitLocked
        ? "Already added (or Character Creation finalized)"
        : "Character creation (§3.10): Backpack, Trail Rations, Waterskin, Torch Bundle, Tinderbox + roll 3d6×10 SP"}
      on:click={() => applyStartingKit(pc)}
    >
      + Starting Kit
    </button>
    <GearShopButton />
    <button class="bg-black text-white px-2 rounded-md text-sm" on:click={addCustomGear}>
      Custom Gear
    </button>
  </div>
</div>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1">
  {#each zoneUsage as z (z.zone)}
    <span
      class="rounded px-1 {z.used > z.cap ? 'bg-red-600 text-white' : 'bg-gray-100'}"
      title="{z.zone} zone capacity (§9.1.2) - a soft warning only, never enforced."
    >
      {z.zone} {z.used}/{z.cap}
    </span>
  {/each}
</div>

<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 bg-gray-100 rounded-md px-1 py-0.5">
  <span title="Fatigue & Injury zone - 1 slot each, always counts against STR, never dropped with the Backpack. Fatigue clears only on a Normal or Comfortable Rest.">
    Fatigue
    <button on:click={() => ($pc.fatigue = Math.max(0, $pc.fatigue - 1))}><i class="material-icons text-xs">remove</i></button>
    <strong>{$pc.fatigue}</strong>
    <button on:click={() => ($pc.fatigue += 1)}><i class="material-icons text-xs">add</i></button>
  </span>
  <button class="bg-black text-white rounded-md px-1" title="Add an Injury (1 slot each)" on:click={addInjury}>+ Injury</button>
  <span title="Strain is tracked in the Strain box; shown here because it also takes 1 slot each">Strain {$pc.strain}</span>
  <label class="flex items-center gap-1 w-auto" title="While dropped, Backpack-zone items stop counting toward slots. Fatigue, Injuries, and Strain still count.">
    <input type="checkbox" class="w-auto" bind:checked={$pc.backpackDropped} /> Backpack dropped
  </label>
</div>

<div class="overflow-auto flex-1 min-w-0 mt-1">
  <table class="table-auto text-left text-sm w-full">
    <tr class="border-b">
      <th class="w-6">Eq.</th>
      <th>Item</th>
      <th>Zone</th>
      <th class="w-14">Slots</th>
      <th title="Equipment Quality (§9.3.1) - Weapon/Armor only">Qual.</th>
      <th title="Condition (§9.3.3) - Weapon/Armor only. Degradation isn't automatic; click to record what happened.">Cond.</th>
      <th>Notes</th>
      <th></th>
    </tr>
    {#each $pc.injuries as inj (inj.id)}
      {@const permanentAttr = inj.severity === "Permanent" ? permanentAttrFor(inj) : undefined}
      <tr class="border-b bg-red-50" title={injuryTooltip(inj)}>
        <td><i class="material-icons text-sm text-red-700">healing</i></td>
        <td>
          <div class="flex gap-1 items-center flex-wrap">
            <select bind:value={inj.severity} class="text-xs">
              {#each INJURY_SEVERITIES as sv}<option value={sv}>{sv}</option>{/each}
            </select>
            <select bind:value={inj.location} class="text-xs">
              {#each INJURY_LOCATIONS as loc}<option value={loc}>{loc}</option>{/each}
            </select>
            {#if inj.severity === "Permanent" && inj.location === "Head"}
              <select bind:value={inj.headAttribute} class="text-xs" title="§14.4 - the GM determines whether INT or WIL is affected">
                <option value={undefined}>INT or WIL?</option>
                <option value="INT">INT</option>
                <option value="WIL">WIL</option>
              </select>
            {/if}
          </div>
        </td>
        <td class="text-xs whitespace-nowrap">Fatigue &amp; Injury</td>
        <td class="text-xs">1</td>
        {#if inj.severity === "Permanent"}
          <td colspan="2" class="text-xs whitespace-nowrap">
            {#if permanentAttr}
              <button
                class="text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
                class:bg-black={!inj.applied}
                class:text-white={!inj.applied}
                class:bg-gray-300={inj.applied}
                class:text-gray-500={inj.applied}
                disabled={inj.applied}
                title={`${permanentAttr} maximum -1.${inj.location === "Torso" ? " Also -1 max HP." : ""} ${PERMANENT_INJURY_CONSEQUENCE[inj.location]}`}
                on:click={() => applyPermanentInjury(inj)}
              >
                {inj.applied ? `Applied (-1 ${permanentAttr})` : `Apply -1 ${permanentAttr}${inj.location === "Torso" ? ", -1 HP" : ""}`}
              </button>
            {:else}
              <span class="text-gray-400">pick INT or WIL above</span>
            {/if}
          </td>
        {:else}
          <td colspan="2" class="text-xs text-gray-500 cursor-help">hover for effect</td>
        {/if}
        <td><input type="text" bind:value={inj.notes} placeholder="how it happened" /></td>
        <td>
          <button class="text-red-700" on:click={() => removeInjury(inj)}>
            <i class="material-icons text-sm">delete</i>
          </button>
        </td>
      </tr>
    {/each}
    {#each GEAR_ZONES as zone}
      {@const zUsage = zoneUsage.find((z) => z.zone === zone)}
      <tr class="border-y bg-gray-200">
        <td colspan="8" class="px-2 py-1">
          <div class="flex items-center justify-between">
            <strong class="text-xs tracking-wide">{zone.toUpperCase()}</strong>
            <span
              class="text-xs rounded px-1.5 py-0.5 {zUsage && zUsage.used > zUsage.cap ? 'bg-red-600 text-white' : 'bg-gray-100'}"
              title="{zone} zone capacity (§9.1.2) - a soft warning only, never enforced."
            >
              {zUsage?.used ?? 0}/{zUsage?.cap ?? 0} slots
            </span>
          </div>
        </td>
      </tr>
      {#each $pc.gear.filter((g) => g.zone === zone) as g (g.id)}
        <tr class="border-b" class:opacity-50={g.usageDie === "depleted" || ($pc.backpackDropped && g.zone === "Backpack")} class:bg-red-50={g.usageDie === "depleted"}>
          <td><input type="checkbox" class="w-auto" bind:checked={g.equipped} /></td>
          <td>
            <div class="flex items-center gap-1">
              <input type="text" bind:value={g.name} placeholder="Hemp Rope, 50ft" />
              {#if g.usageDie === "depleted"}
                <span class="text-red-700 text-xs font-bold whitespace-nowrap">
                  {isFreedByDepletion(g) ? "USED UP" : "EMPTY"}
                </span>
              {/if}
            </div>
          </td>
          <td>
            <select bind:value={g.zone} on:change={() => ($pc.gear = $pc.gear)}>
              {#each GEAR_ZONES as z}
                <option value={z}>{z}</option>
              {/each}
            </select>
          </td>
          <td>
            {#if isFreedByDepletion(g)}
              <span class="text-gray-400" title="Used up - no longer carried">0</span>
            {:else}
              <input type="number" inputmode="numeric" min="0" bind:value={g.slots} class="w-12" />
            {/if}
          </td>
          <td>
            {#if g.durableCategory}
              <select bind:value={g.quality} class="text-xs">
                {#each QUALITIES as q}
                  <option value={q}>{q}</option>
                {/each}
              </select>
            {:else}
              <span class="text-gray-300">-</span>
            {/if}
          </td>
          <td>
            {#if g.durableCategory}
              <div class="flex items-center gap-1 whitespace-nowrap">
                <button class="px-1" title="Degrade one step" on:click={() => degrade(g)}>
                  <i class="material-icons text-xs">remove</i>
                </button>
                <span
                  class="text-xs font-bold {CONDITION_COLOR_CLASS[g.condition ?? 'Healthy']}"
                  title={g.quality === "Masterwork" && g.masterworkReserveSpent
                    ? "Masterwork Reserve already spent"
                    : g.quality}
                >
                  {g.condition}{g.quality === "Masterwork" && !g.masterworkReserveSpent ? " (+Reserve)" : ""}
                </span>
                <button class="px-1" title="Repair one step" on:click={() => repair(g)}>
                  <i class="material-icons text-xs">add</i>
                </button>
              </div>
            {:else}
              <span class="text-gray-300">-</span>
            {/if}
          </td>
          <td><input type="text" bind:value={g.notes} /></td>
          <td>
            <button class="text-red-700" on:click={() => removeGear(g)}>
              <i class="material-icons text-sm">delete</i>
            </button>
          </td>
        </tr>
      {/each}
    {/each}
  </table>
</div>
