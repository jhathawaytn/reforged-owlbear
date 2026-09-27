<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { DIE_SIDES, stepDownDie } from "../types";
  import type { GearItem, UsageDieState } from "../types";
  import { rollDieSides } from "../utils";
  import { notify } from "../services/Notifier";
  import DieIcon from "./DieIcon.svelte";

  $: usageItems = $pc.gear.filter((g) => g.usageDie !== undefined);

  function displayName(item: GearItem): string {
    const matches = usageItems.filter((g) => g.name === item.name);
    if (matches.length <= 1) return item.name;
    return `${item.name} #${matches.findIndex((g) => g.id === item.id) + 1}`;
  }

  function checkUsageDie(item: GearItem) {
    if (!item.usageDie || item.usageDie === "depleted") return;
    const sides = DIE_SIDES[item.usageDie];
    const roll = rollDieSides(sides);
    if (roll <= 3) {
      const before = item.usageDie;
      const stepped: UsageDieState = stepDownDie(item.usageDie);
      item.usageDie = stepped;
      $pc.gear = $pc.gear;
      notify(
        stepped === "depleted"
          ? `${item.name}: rolled ${roll} on ${before} -> depleted (still supplied this use)`
          : `${item.name}: rolled ${roll} on ${before} -> steps down to ${stepped}`,
      );
    } else {
      notify(`${item.name}: rolled ${roll} on ${item.usageDie} -> holds`);
    }
  }

  function restock(item: GearItem) {
    if (!item.usageDieMax) return;
    item.usageDie = item.usageDieMax;
    $pc.gear = $pc.gear;
  }
</script>

<h2>USAGE DICE</h2>
{#if !usageItems.length}
  <div class="text-xs text-gray-400 flex-1 flex items-center justify-center text-center px-2">
    Consumable stocks (Rations, Water, Ammunition, Torches...) added from the Gear shop show up here.
  </div>
{:else}
  <div class="overflow-x-auto overflow-y-hidden flex-1 min-w-0 flex flex-nowrap gap-2">
    {#each usageItems as item (item.id)}
      <div class="flex flex-col items-center gap-1 border rounded-md p-1 w-24 shrink-0">
        <DieIcon size={item.usageDie} />
        <span class="text-xs text-center leading-tight">{displayName(item)}</span>
        <div class="flex gap-1">
          <button
            class="bg-black text-white text-xs px-1 rounded-md"
            disabled={item.usageDie === "depleted"}
            class:opacity-30={item.usageDie === "depleted"}
            on:click={() => checkUsageDie(item)}
          >
            Check
          </button>
          <button class="text-xs px-1 rounded-md border" title="Restock" on:click={() => restock(item)}>
            <i class="material-icons text-xs">refresh</i>
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
