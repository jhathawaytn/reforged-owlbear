<script lang="ts">
  import RollButton from "./RollButton.svelte";
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import type { Attribute } from "../types";

  export let forStat: Attribute;

  // Per-roll adjustment for THIS attempt only - Skill Ranks (-2 each,
  // §2.4) and situational Difficulty (-4 to +11, §2.7). Resets after
  // every roll so a forgotten value can't silently apply to the next
  // unrelated Save.
  let modifier = 0;

  function onInput(e: Event) {
    $pc.attributes[forStat] = parseInt((e.target as HTMLInputElement).value) || 0;
  }

  // The unreduced maximum (§7.5) only shows once it's diverged from the
  // current value - normally via an applied Permanent Injury (§14.4), or
  // Growth outpacing a temporarily-reduced current score.
  $: unreducedMax = $pc.attributeMax[forStat];
  // §14.5/§14.7: STR goes red while Mortally Wounded; a Clinging character
  // is off the STR track, so it shows a dash instead of a number.
  $: mortallyWounded = forStat === "STR" && $pc.mortalWound && !$pc.dead;
  $: offTrack = forStat === "STR" && $pc.conditions.includes("Clinging");
  $: showMax = unreducedMax !== $pc.attributes[forStat];
</script>

<div class="flex flex-col">
  <label>
    <h2
      title={showMax
        ? `Unreduced maximum ${unreducedMax} - what this Attribute would be without a Permanent Injury's reduction (used for Level Up's Attribute Growth check, §7.5).`
        : ""}
    >
      {forStat}{showMax ? ` (max ${unreducedMax})` : ""}
    </h2>
    <div class="sheet-stat flex gap-1 items-center">
      {#if offTrack}
        <div class="w-1/2 text-center text-3xl font-bold text-purple-900" title="Clinging: off the STR track (§14.7)">—</div>
      {:else}
        <input
          type="number"
          inputmode="numeric"
          value={$pc.attributes[forStat]}
          on:input={onInput}
          min="1"
          max="20"
          class="w-1/2"
          class:mortal-wound-stat={mortallyWounded}
        />
      {/if}
      <RollButton
        label={forStat}
        target={$pc.attributes[forStat]}
        {modifier}
        on:rolled={() => (modifier = 0)}
      >
        <div class="rounded-md bg-black text-white px-2 py-1 text-xs flex items-center gap-1">
          <i class="material-icons text-sm">casino</i> Save
        </div>
      </RollButton>
    </div>
    <div class="flex items-center gap-1 text-xs" title="Skill Ranks (-2 each) and situational Difficulty for this roll only - resets after you roll">
      <span>this roll:</span>
      <input type="number" inputmode="numeric" bind:value={modifier} class="w-12 text-right" placeholder="0" />
    </div>
  </label>
</div>
