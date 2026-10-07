<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { isGM } from "../services/OBRHelper";
  import { sendLifeAction } from "../services/LifeActions";
  import { lifeStateOf, LIFE_ACTION_LABEL } from "../lifeState";
  import type { LifeAction } from "../lifeState";

  // Mortally Wounded / Clinging / Dead banner (§14.5–14.10, V-011). Shown on
  // every page. The buttons are GM-only: the GM judges the helper's roll and
  // the exits; the player sees what's going on and what they're waiting for.
  $: state = lifeStateOf($pc);
  $: name = $pc.name || "This character";
  let busy = false;
  let message = "";
  let lastState = state;
  $: if (state !== lastState) {
    lastState = state;
    message = "";
  }

  async function act(action: LifeAction) {
    if (busy) return;
    busy = true;
    message = "";
    try {
      message = await sendLifeAction(action);
    } finally {
      busy = false;
    }
  }
</script>

{#if state !== "alive"}
  <div
    class="w-full rounded-md px-3 py-2 text-white"
    class:bg-red-700={state === "mortallyWounded"}
    class:bg-purple-900={state === "clinging"}
    class:bg-gray-700={state === "dead"}
    role="alert"
  >
    {#if state === "mortallyWounded"}
      <div class="font-bold text-lg leading-tight">MORTALLY WOUNDED</div>
      <div class="text-sm">
        {name} dies in <strong>1 hour</strong> (game time) unless stabilized. Another character spends an Action and makes an
        INT or WIL Save (Healing R1: automatic). A second Mortal Wound first is death.
      </div>
    {:else if state === "clinging"}
      <div class="font-bold text-lg leading-tight">CLINGING</div>
      <div class="text-sm">
        {name} is unconscious and can't act. <strong>Any damage kills</strong>, before Armor. Exits: someone gives a Healing
        Potion, or a full week of professional care.
      </div>
    {:else}
      <div class="font-bold text-lg leading-tight">DEAD</div>
      <div class="text-sm">{name} has died.</div>
    {/if}

    {#if $isGM}
      <div class="flex flex-wrap gap-1 mt-2">
        {#if state === "mortallyWounded"}
          <button class="bg-white text-red-800 font-bold rounded-md px-3 py-1 text-sm" disabled={busy} on:click={() => act("stabilize")}>
            {LIFE_ACTION_LABEL.stabilize}
          </button>
          <button class="border border-white rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("dead")} title="The hour ran out, or another death trigger (§14.10).">
            {LIFE_ACTION_LABEL.dead}
          </button>
        {:else if state === "clinging"}
          <button class="bg-white text-purple-900 font-bold rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("potion")} title="Out of Clinging, all HP, STR to half of max (rounded down).">
            {LIFE_ACTION_LABEL.potion}
          </button>
          <button class="bg-white text-purple-900 font-bold rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("professional")} title="One full week of professional settlement treatment: out of Clinging at STR 1.">
            {LIFE_ACTION_LABEL.professional}
          </button>
          <button class="border border-white rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("override")} title="E.g. Trauma Surgeon. Ends Clinging only; set STR and HP by hand.">
            {LIFE_ACTION_LABEL.override}
          </button>
          <button class="border border-white rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("dead")}>
            {LIFE_ACTION_LABEL.dead}
          </button>
        {:else}
          <button class="border border-white rounded-md px-2 py-1 text-xs" disabled={busy} on:click={() => act("revive")} title="For a mistake only.">
            {LIFE_ACTION_LABEL.revive}
          </button>
        {/if}
        {#if busy}<span class="text-xs self-center">Sending…</span>{/if}
      </div>
      {#if message}<div class="text-xs mt-1">{message}</div>{/if}
    {:else if state === "mortallyWounded"}
      <div class="text-xs mt-1 italic">Waiting for the GM to confirm stabilization.</div>
    {:else if state === "clinging"}
      <div class="text-xs mt-1 italic">The GM ends Clinging when you get a Healing Potion or a week of care.</div>
    {/if}
  </div>
{/if}
