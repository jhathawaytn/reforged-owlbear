<script lang="ts">
  import Modal from "../Modal.svelte";
  import { PlayerCharacterStore as pc } from "../../model/ReforgedCharacter";
  import { COMPENDIUM, GEAR_CATEGORIES, withCompendiumItem } from "../../compendium";
  import type { CompendiumItem, GearCategory } from "../../compendium";
  import { formatCoins, formatFarthings, hasHaggler, planPurchase, purseOf, purseValue } from "../../coins";
  import type { PurchasePlan } from "../../coins";

  let showModal = false;
  let query = "";
  let activeCategories = new Set<GearCategory>(GEAR_CATEGORIES);
  // The item whose Buy confirmation is open, if any.
  let buying: CompendiumItem | undefined;
  let lastMessage = "";

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

  $: plan = buying ? planPurchase($pc, buying) : undefined;
  $: notForSale = plan && "reason" in plan ? plan.reason : "";
  $: shortBy = plan && "payment" in plan && "shortBy" in plan.payment ? plan.payment.shortBy : 0;
  $: coinTotal = purseValue(purseOf($pc));
  $: haggler = hasHaggler($pc);

  function addFree(item: CompendiumItem) {
    pc.set(withCompendiumItem($pc, item));
    lastMessage = `Added ${item.name} (free - no coin spent).`;
  }

  function confirmBuy(item: CompendiumItem, p: PurchasePlan) {
    if (!p.buyable || !p.after || !p.payment.ok) return;
    pc.set(p.after);
    const change = p.payment.change;
    const changeText = Object.values(change).some((n) => n > 0) ? `, got ${formatCoins(change)} change` : "";
    lastMessage = p.price === 0 ? `Bought ${item.name} (no cost).` : `Bought ${item.name}: paid ${formatCoins(p.payment.paid)}${changeText}.`;
    buying = undefined;
  }
</script>

<button class="bg-black text-white px-2 rounded-md text-sm" on:click={() => { showModal = true; buying = undefined; lastMessage = ""; }}>
  Gear
</button>

<Modal bind:showModal>
  <h1 slot="header">Gear</h1>
  <div class="w-[460px] max-w-full h-[560px] flex flex-col gap-2">
    <div class="text-xs text-gray-600">
      Your coin: <strong>{formatFarthings(coinTotal)}</strong>{haggler ? " · Haggler: 90% of listed price" : ""}
    </div>
    {#if buying && plan}
      <div class="border rounded-md p-2 text-sm flex flex-col gap-1 bg-gray-50">
        <div class="font-bold">Buy {buying.name}?</div>
        {#if !plan.buyable}
          <div>{notForSale}</div>
        {:else}
          <div>Listed price: {buying.price}</div>
          {#if plan.haggler}
            <div>Haggler price: {formatFarthings(plan.price)} <span class="text-gray-500">(90%, rounded up to the farthing)</span></div>
          {/if}
          {#if plan.payment.ok}
            {#if plan.price > 0}
              <div>
                Pay {formatCoins(plan.payment.paid)}{Object.values(plan.payment.change).some((n) => n > 0) ? `, get ${formatCoins(plan.payment.change)} change` : ""}.
                Coin left: {formatFarthings(purseValue(plan.payment.after))}.
              </div>
            {/if}
            <div class={plan.overburdenedAfter ? "text-red-700 font-bold" : ""}>
              Slots after: {plan.slotsAfter} / {plan.capacity}{plan.overburdenedAfter ? " - you will be Overburdened" : ""}
            </div>
          {:else}
            <div class="text-red-700 font-bold">Not enough coin: short by {formatFarthings(shortBy)}.</div>
          {/if}
        {/if}
        <div class="flex gap-2 mt-1">
          <button
            class="bg-black text-white px-2 rounded-md disabled:opacity-40"
            disabled={!plan.buyable || !plan.payment.ok}
            on:click={() => buying && plan && confirmBuy(buying, plan)}
          >
            Confirm Buy
          </button>
          <button class="border px-2 rounded-md" on:click={() => (buying = undefined)}>Cancel</button>
        </div>
      </div>
    {:else if lastMessage}
      <div class="text-xs text-green-800">{lastMessage}</div>
    {/if}
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
            <td class="whitespace-nowrap">
              <button
                class="bg-black text-white rounded-md px-2 text-xs"
                title="Pay for it from your coin"
                on:click={() => { buying = item; lastMessage = ""; }}
              >
                Buy
              </button>
              <button
                class="border rounded-md px-2 text-xs"
                title="Loot or GM grant - adds the item without spending coin"
                on:click={() => addFree(item)}
              >
                Add free
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
