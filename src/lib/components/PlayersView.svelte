<script lang="ts">
  import {
    isGM,
    PartyStore,
    TrackedPlayer,
    isTrackedPlayerGM,
    GmId,
    GmPlayer,
    sendHPNudge,
  } from "../services/OBRHelper";
  import Modal from "./Modal.svelte";

  let showModal = false;

  type PlayerItem = { id: string; name: string };
  let allPlayers: PlayerItem[];

  $: {
    allPlayers = $PartyStore.map((p) => ({ id: p.id, name: p.name }));
    allPlayers.unshift({ id: $GmId, name: $GmPlayer?.name ?? "GM" });
  }

  function onLoadPlayer(p: PlayerItem) {
    $TrackedPlayer = p.id;
  }

  // GM write-back MVP (§ CLAUDE.md Backlog) - there's no way to write
  // directly into another client's metadata, so this is a room broadcast the
  // target player's own client applies to itself. Only they see/keep it;
  // this doesn't touch what the GM is currently viewing.
  let nudgeAmount: Record<string, number> = {};
  let nudgeReason: Record<string, string> = {};
  function sendNudge(p: PlayerItem) {
    const delta = nudgeAmount[p.id];
    if (!delta) return;
    sendHPNudge(p.id, delta, nudgeReason[p.id] ?? "");
    nudgeAmount[p.id] = 0;
    nudgeReason[p.id] = "";
  }
</script>

{#if $isGM}
  <button
    on:click={() => (showModal = true)}
    title="Players: load a player's sheet (read-only)"
    class="{$isTrackedPlayerGM ? 'bg-black' : 'bg-green-600'} text-white px-1"
  >
    <i class="material-icons translate-y-1">group</i>
  </button>
{/if}

<Modal bind:showModal>
  <h1 slot="header">Players</h1>
  <div class="w-96 mt-4 mb-4">
    NOTE: loading another player's sheet is a READ-ONLY view. Edits you make there don't save back to
    them. The HP nudge below is the one exception - it's sent to that player's own client, which applies
    it to their own sheet (they need the extension open to receive it).
  </div>
  <div class="flex flex-col gap-1 w-full">
    {#each allPlayers as p}
      <div
        class="flex gap-1 justify-between items-center p-1 rounded-md w-full flex-wrap"
        class:bg-yellow-300={$TrackedPlayer === p.id}
      >
        <div>{p.name}{p.id == $GmId ? " (you)" : ""}</div>
        <div class="flex items-center gap-1">
          {#if p.id !== $GmId}
            <input
              type="number"
              inputmode="numeric"
              placeholder="+/-HP"
              class="w-16 text-xs"
              bind:value={nudgeAmount[p.id]}
            />
            <input
              type="text"
              placeholder="reason"
              class="w-20 text-xs"
              bind:value={nudgeReason[p.id]}
            />
            <button
              class="bg-black text-white p-1 rounded-md px-1 text-xs"
              title="Broadcasts this HP change to {p.name}'s own client, which applies it to their own sheet"
              on:click={() => sendNudge(p)}
            >
              Nudge
            </button>
          {/if}
          {#if $TrackedPlayer !== p.id}
            <button class="bg-black text-white p-1 rounded-md px-1" on:click={() => onLoadPlayer(p)}>
              Load
            </button>
          {:else if !$isTrackedPlayerGM}
            <div>In Sync</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</Modal>
