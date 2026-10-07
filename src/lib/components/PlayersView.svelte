<script lang="ts">
  import {
    isGM,
    PartyStore,
    TrackedPlayer,
    isTrackedPlayerGM,
    GmId,
    GmPlayer,
    ReforgedPresenceStore,
    sendHPNudge,
  } from "../services/OBRHelper";
  import Modal from "./Modal.svelte";

  let showModal = false;

  type PlayerItem = { id: string; name: string; character: string };
  let allPlayers: PlayerItem[];

  $: {
    const characterOf = new Map($ReforgedPresenceStore.map((p) => [p.id, p.characterName]));
    allPlayers = $PartyStore
      .filter((p) => p.role === "PLAYER")
      .map((p) => ({ id: p.id, name: p.name, character: characterOf.get(p.id) ?? "" }));
  }

  function view(p: PlayerItem) {
    $TrackedPlayer = p.id;
    showModal = false;
  }

  function backToMine() {
    $TrackedPlayer = $GmId;
    showModal = false;
  }

  // GM HP adjustment: there's no way to write into another client's
  // metadata, so this is a room broadcast the player's own sheet applies to
  // itself, then answers so the GM sees the result.
  let nudgeAmount: Record<string, number> = {};
  let nudgeReason: Record<string, string> = {};
  let nudgeResult: Record<string, string> = {};
  let nudgeBusy: Record<string, boolean> = {};
  async function sendNudge(p: PlayerItem) {
    const delta = nudgeAmount[p.id];
    if (!delta || nudgeBusy[p.id]) return;
    nudgeBusy = { ...nudgeBusy, [p.id]: true };
    nudgeResult = { ...nudgeResult, [p.id]: "Sending…" };
    const message = await sendHPNudge(p.id, delta, nudgeReason[p.id] ?? "");
    nudgeResult = { ...nudgeResult, [p.id]: message };
    nudgeAmount[p.id] = 0;
    nudgeReason[p.id] = "";
    nudgeBusy = { ...nudgeBusy, [p.id]: false };
  }
</script>

{#if $isGM}
  <button
    on:click={() => (showModal = true)}
    title="Players: view a player's sheet, or adjust their HP"
    class="{$isTrackedPlayerGM ? 'bg-black' : 'bg-green-600'} text-white px-1"
  >
    <i class="material-icons translate-y-1">group</i>
  </button>
{/if}

<Modal bind:showModal>
  <h1 slot="header">Players</h1>
  <div class="text-xs text-gray-600 mt-2 mb-2">
    <strong>View sheet</strong> shows a player's character here (read-only: your edits don't save to them, but the
    banner's GM buttons and HP adjust do). <strong>Adjust HP</strong> is applied on the player's own sheet, so it
    has to be open.
  </div>
  <div class="flex flex-col gap-2 w-full">
    <div class="flex items-center gap-2 p-2 rounded-md border" class:bg-yellow-200={$isTrackedPlayerGM}>
      <div class="font-bold flex-1">{$GmPlayer?.name ?? "GM"} (you)</div>
      {#if $isTrackedPlayerGM}
        <span class="text-xs">Showing</span>
      {:else}
        <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={backToMine}>Back to my sheet</button>
      {/if}
    </div>

    {#each allPlayers as p (p.id)}
      <div class="p-2 rounded-md border" class:bg-yellow-200={$TrackedPlayer === p.id}>
        <div class="flex items-center gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-bold truncate">{p.character || p.name}</div>
            {#if p.character}<div class="text-[10px] text-gray-500">played by {p.name}</div>{/if}
          </div>
          {#if $TrackedPlayer === p.id}
            <span class="text-xs">Showing</span>
          {:else}
            <button class="bg-black text-white rounded-md px-3 py-1 text-sm" on:click={() => view(p)}>
              View sheet
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-1 mt-1 text-xs">
          <span class="whitespace-nowrap">Adjust HP</span>
          <input type="number" inputmode="numeric" placeholder="+/-" class="!w-16 text-xs" bind:value={nudgeAmount[p.id]} />
          <input type="text" placeholder="reason (optional)" class="flex-1 min-w-0 text-xs" bind:value={nudgeReason[p.id]} />
          <button
            class="bg-black text-white rounded-md px-2 py-0.5 text-xs disabled:opacity-40"
            disabled={!nudgeAmount[p.id] || nudgeBusy[p.id]}
            on:click={() => sendNudge(p)}
          >
            Send
          </button>
        </div>
        {#if nudgeResult[p.id]}<div class="text-[10px] mt-1">{nudgeResult[p.id]}</div>{/if}
      </div>
    {:else}
      <div class="text-xs text-gray-500">No players have joined the room.</div>
    {/each}
  </div>
</Modal>
