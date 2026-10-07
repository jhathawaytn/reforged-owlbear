<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { isGM, isTrackedPlayerGM, TrackedPlayer, GmId, PartyStore } from "../services/OBRHelper";

  // GM only: a clear sign that the sheet below is a player's, not the GM's.
  $: playerName = $PartyStore.find((p) => p.id === $TrackedPlayer)?.name ?? "a player";
</script>

{#if $isGM && !$isTrackedPlayerGM}
  <div class="gm-viewing-bar w-full rounded-md px-3 py-1.5 bg-green-600 text-white flex items-center gap-2 text-sm">
    <i class="material-icons text-base">visibility</i>
    <span class="flex-1">
      Viewing <strong>{$pc.name || "an unnamed character"}</strong> ({playerName}'s sheet) - read-only
    </span>
    <button class="bg-white text-green-800 rounded-md px-2 py-0.5 text-xs font-bold" on:click={() => ($TrackedPlayer = $GmId)}>
      Back to my sheet
    </button>
  </div>
{/if}
