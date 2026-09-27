<script lang="ts">
  import Modal from "../Modal.svelte";
  import { PlayerCharacterStore as pc } from "../../model/ReforgedCharacter";
  import { COMPENDIUM, GEAR_CATEGORIES, compendiumItemToGear } from "../../compendium";
  import type { CompendiumItem, GearCategory } from "../../compendium";
  import { newId } from "../../utils";

  let showModal = false;
  let query = "";
  let activeCategories = new Set<GearCategory>(GEAR_CATEGORIES);

  function toggleCategory(cat: GearCategory) {
    if (activeCategories.has(cat)) {
      activeCategories.delete(cat);
    } else {
      activeCategories.add(cat);
    }
    activeCategories = activeCategories;
  }

  $: filtered = COMPENDIUM.filter(
    (item: CompendiumItem) =>
      activeCategories.has(item.category) &&
      item.name.toLowerCase().includes(query.toLowerCase()),
  );

  function addItem(item: CompendiumItem) {
    const gearId = newId();
    $pc.gear = [...$pc.gear, compendiumItemToGear(item, gearId)];

    if (item.category === "Weapon") {
      const noteParts = [item.damageType, item.properties !== "-" ? item.properties : "", item.specialStress !== "-" ? item.specialStress : ""].filter(Boolean);
      $pc.attacks = [
        ...$pc.attacks,
        {
          id: newId(),
          name: item.name,
          roll: item.damageDie,
          notes: noteParts.join(", "),
          gearId,
        },
      ];
    }
  }
</script>

<button class="bg-black text-white px-2 rounded-md text-sm" on:click={() => (showModal = true)}>
  Gear
</button>

<Modal bind:showModal>
  <h1 slot="header">Gear</h1>
  <div class="w-[420px] max-w-full h-[520px] flex flex-col gap-2">
    <input type="text" placeholder="search e.g. Torch" bind:value={query} />
    <div class="flex flex-wrap gap-2 text-xs">
      {#each GEAR_CATEGORIES as cat}
        <label class="flex items-center gap-1">
          <input
            type="checkbox"
            class="w-auto"
            checked={activeCategories.has(cat)}
            on:change={() => toggleCategory(cat)}
          />
          {cat}
        </label>
      {/each}
    </div>
    <div class="overflow-y-auto flex-1 border-t pt-1">
      <table class="table-auto text-left text-sm w-full">
        <tr class="border-b font-bold">
          <td>Name</td>
          <td>Cost</td>
          <td>Slots</td>
          <td></td>
        </tr>
        {#each filtered as item (item.category + "-" + item.name)}
          <tr class="border-b">
            <td>{item.name}</td>
            <td>{item.price}</td>
            <td>{item.slots}</td>
            <td>
              <button class="bg-black text-white rounded-full w-6 h-6" on:click={() => addItem(item)}>
                +
              </button>
            </td>
          </tr>
        {/each}
        {#if !filtered.length}
          <tr><td colspan="4" class="text-gray-400 py-2">No matches</td></tr>
        {/if}
      </table>
    </div>
  </div>
</Modal>
