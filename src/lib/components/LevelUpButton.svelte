<script lang="ts">
  import { PlayerCharacterStore as pc, levelUpAvailable } from "../model/ReforgedCharacter";
  import { ATTRIBUTES, attributeGrows, lowestAttributes, titleForLevel } from "../types";
  import type { Attribute } from "../types";
  import { rollDiceValues, rollNotation } from "../services/DicePlus";
  import { notify } from "../services/Notifier";
  import Modal from "./Modal.svelte";

  let showModal = false;

  $: available = levelUpAvailable($pc);
  $: targetLevel = $pc.level + 1;
  $: targetTitle = titleForLevel(targetLevel);

  // Rolls are checked and displayed against a snapshot of Attributes/HP taken
  // when each roll happens, never against the live $pc - otherwise, once
  // Confirm writes $pc, every "current -> new" figure here would silently
  // re-derive from the just-updated character and the whole card would
  // relabel itself as the NEXT Level up before the player ever rolled for it.
  let beforeMaxHP: number | null = null;
  let beforeHP: number | null = null;
  let hpRoll: number | null = null;
  let hpRollTempered = false;

  let beforeAttributes: Record<Attribute, number> | null = null;
  let beforeAttributeMax: Record<Attribute, number> | null = null;
  let attrRolls: Record<Attribute, number> | null = null;
  let fallbackPick: Attribute | null = null;

  type AppliedSummary = {
    level: number;
    title: string;
    hpFrom: number;
    hpTo: number;
    tempered: boolean;
    attrChanges: { attr: Attribute; from: number; to: number }[];
  };
  let summary: AppliedSummary | null = null;

  // Fresh rolls every time the modal opens, so a level resolved earlier
  // (or abandoned without confirming) never leaks into the next one.
  $: if (showModal) resetRolls();
  function resetRolls() {
    beforeMaxHP = null;
    beforeHP = null;
    hpRoll = null;
    hpRollTempered = false;
    beforeAttributes = null;
    beforeAttributeMax = null;
    attrRolls = null;
    fallbackPick = null;
    summary = null;
  }

  // Tempered (Scar 12, §14.2): the next HP Growth rolls twice and keeps the
  // higher result, then the benefit is spent - consumed here, at the roll,
  // not deferred to Confirm.
  async function rollHP() {
    beforeMaxHP = $pc.maxHitPoints;
    beforeHP = $pc.hitPoints;
    if ($pc.temperedPending) {
      const rolls = await rollDiceValues(2, 6);
      hpRoll = Math.max(...rolls);
      hpRollTempered = true;
      $pc.temperedPending = false;
    } else {
      const result = await rollNotation("d6");
      hpRoll = result?.total ?? 1;
    }
  }

  async function rollAttributes() {
    const before = { ...$pc.attributes };
    const beforeMax = { ...$pc.attributeMax };
    const next = {} as Record<Attribute, number>;
    for (const a of ATTRIBUTES) {
      const result = await rollNotation("3d6");
      next[a] = result?.total ?? 3;
    }
    beforeAttributes = before;
    beforeAttributeMax = beforeMax;
    attrRolls = next;
    // §7.5: checked against the unreduced maximum, not the (possibly
    // Permanent-Injury-reduced) current value.
    const grew = ATTRIBUTES.filter((a) => attributeGrows(next[a], beforeMax[a]));
    if (grew.length > 0) {
      fallbackPick = null;
    } else {
      const lowest = lowestAttributes(beforeMax)[0];
      // §7.5: if every Attribute is already at 18, no fallback increase occurs either.
      fallbackPick = beforeMax[lowest] < 18 ? lowest : null;
    }
  }

  // Whether this Attribute actually grows once rolls are in, folding in the
  // no-natural-growth fallback (lowest unreduced maximum, ties broken by pick).
  function grows(a: Attribute): boolean {
    if (!attrRolls || !beforeAttributeMax) return false;
    if (attributeGrows(attrRolls[a], beforeAttributeMax[a])) return true;
    return fallbackPick === a;
  }

  $: anyGrewNaturally = !!attrRolls && !!beforeAttributeMax && ATTRIBUTES.some((a) => attributeGrows(attrRolls[a], beforeAttributeMax[a]));
  $: tiedFallbackChoices = attrRolls && beforeAttributeMax && !anyGrewNaturally && fallbackPick !== null ? lowestAttributes(beforeAttributeMax) : [];
  $: noAttributeCanGrow = !!attrRolls && !anyGrewNaturally && fallbackPick === null;

  function confirmLevelUp() {
    if (hpRoll === null || beforeMaxHP === null || beforeHP === null || !attrRolls || !beforeAttributes || !beforeAttributeMax) return;

    const hpFrom = beforeMaxHP;
    const hpTo = beforeMaxHP + hpRoll;
    $pc.maxHitPoints = hpTo;
    $pc.hitPoints = Math.min(beforeHP + hpRoll, hpTo);

    // Growth raises both the current value and the unreduced maximum by 1
    // (§7.5) - the gap between them (any applied Permanent Injury reduction)
    // stays exactly as it was, preserving the existing deficit rather than
    // healing it.
    const grownAttrs = ATTRIBUTES.filter((a) => grows(a));
    const attrChanges = grownAttrs.map((a) => ({ attr: a, from: beforeAttributes[a], to: beforeAttributes[a] + 1 }));
    const nextAttributes = { ...$pc.attributes };
    const nextAttributeMax = { ...$pc.attributeMax };
    for (const c of attrChanges) {
      nextAttributes[c.attr] = c.to;
      nextAttributeMax[c.attr] = beforeAttributeMax[c.attr] + 1;
    }
    $pc.attributes = nextAttributes;
    $pc.attributeMax = nextAttributeMax;

    const level = targetLevel;
    const title = targetTitle;
    $pc.level = level;

    summary = { level, title, hpFrom, hpTo, tempered: hpRollTempered, attrChanges };

    const attrText = attrChanges.length > 0 ? attrChanges.map((c) => `${c.attr} ${c.from}→${c.to}`).join(", ") : "none grew";
    const hpText = `HP Growth +${hpRoll}${hpRollTempered ? " (Tempered: kept the higher of two rolls)" : ""} (max ${hpTo})`;
    notify(`Leveled up to ${level} (${title})! ${hpText}. Attribute Growth: ${attrText}.`);
  }
</script>

{#if available}
  <button
    class="text-[10px] px-1.5 py-0.5 rounded-md bg-red-700 text-white whitespace-nowrap"
    title="XP Earned qualifies you for a new Level - resolve HP Growth and Attribute Growth (§7.5)."
    on:click={() => (showModal = true)}
  >
    Level Up
  </button>
{/if}

<Modal bind:showModal vw={40}>
  <h1 slot="header">Level Up</h1>
  <div class="w-full flex flex-col gap-2 text-sm">
    {#if summary}
      <div class="text-sm text-green-700 font-bold">Leveled up to {summary.level} ({summary.title})!</div>
      <div class="text-xs text-gray-500">
        HP Growth: max HP {summary.hpFrom} &rarr; {summary.hpTo}{summary.tempered ? " (Tempered: kept the higher of two rolls)" : ""}.
        Attribute Growth:
        {summary.attrChanges.length > 0
          ? summary.attrChanges.map((c) => `${c.attr} ${c.from}→${c.to}`).join(", ")
          : "none grew"}.
      </div>
      <button class="text-xs px-2 py-1 rounded-md bg-black text-white self-start" on:click={() => (showModal = false)}>
        Close
      </button>
    {:else}
      <div class="text-xs text-gray-500">
        XP Earned qualifies you for Level {targetLevel} ({targetTitle}). Resolve HP Growth and Attribute Growth
        (§7.5), then confirm. Only 1 Level may normally be gained per session (§7.4, not enforced here) - if you're
        still ahead after this, Level Up stays available for next time.
      </div>

      <div class="border rounded-md p-2">
        <div class="font-bold text-xs">
          HP Growth
          <span class="text-gray-500 italic font-normal">
            §7.5 - roll 1d6{$pc.temperedPending && hpRoll === null ? " (Tempered pending: rolls 2d6, keeps the higher)" : ""}
          </span>
        </div>
        <div class="flex items-center gap-2 mt-1">
          <button
            class="text-xs px-2 py-0.5 rounded-md"
            class:bg-black={hpRoll === null}
            class:text-white={hpRoll === null}
            class:bg-gray-300={hpRoll !== null}
            class:text-gray-500={hpRoll !== null}
            disabled={hpRoll !== null}
            on:click={rollHP}
          >
            {hpRoll === null ? "Roll 1d6" : `Rolled ${hpRoll}${hpRollTempered ? " (Tempered)" : ""}`}
          </button>
          {#if hpRoll !== null && beforeMaxHP !== null}
            <span class="text-xs text-gray-500">
              Max HP {beforeMaxHP} &rarr; {beforeMaxHP + hpRoll}
            </span>
          {/if}
        </div>
      </div>

      <div class="border rounded-md p-2">
        <div class="font-bold text-xs">
          Attribute Growth <span class="text-gray-500 italic font-normal">§7.5 - roll 3d6 per Attribute</span>
        </div>
        <button
          class="text-xs px-2 py-0.5 rounded-md mt-1"
          class:bg-black={attrRolls === null}
          class:text-white={attrRolls === null}
          class:bg-gray-300={attrRolls !== null}
          class:text-gray-500={attrRolls !== null}
          disabled={attrRolls !== null}
          on:click={rollAttributes}
        >
          {attrRolls === null ? "Roll 3d6 x4" : "Rolled"}
        </button>
        {#if attrRolls && beforeAttributes}
          <div class="grid grid-cols-4 gap-2 mt-2 text-xs">
            {#each ATTRIBUTES as a}
              <div class="flex flex-col items-center border rounded-md p-1">
                <span class="text-gray-500">{a}</span>
                <span>{beforeAttributes[a]}</span>
                <span class="text-gray-500">rolled {attrRolls[a]}</span>
                {#if grows(a)}
                  <span class="text-green-700 font-bold">&rarr; {beforeAttributes[a] + 1}</span>
                {:else}
                  <span class="text-gray-400">no change</span>
                {/if}
              </div>
            {/each}
          </div>
          {#if tiedFallbackChoices.length > 1}
            <div class="text-xs mt-2">
              No Attribute grew naturally - tied for lowest, pick which one grows instead:
              <div class="flex gap-2 mt-1 flex-wrap">
                {#each tiedFallbackChoices as a}
                  <label class="flex items-center gap-1">
                    <input type="radio" class="w-auto" name="fallback" value={a} bind:group={fallbackPick} />
                    {a}
                  </label>
                {/each}
              </div>
            </div>
          {:else if tiedFallbackChoices.length === 1}
            <div class="text-xs text-gray-500 mt-2">No Attribute grew naturally - {tiedFallbackChoices[0]} grows instead (lowest).</div>
          {:else if noAttributeCanGrow}
            <div class="text-xs text-gray-500 mt-2">No Attribute grows this Level - all four are already at 18.</div>
          {/if}
        {/if}
      </div>

      <button
        class="text-xs px-2 py-1 rounded-md self-start"
        class:bg-black={hpRoll !== null && attrRolls !== null}
        class:text-white={hpRoll !== null && attrRolls !== null}
        class:bg-gray-300={hpRoll === null || attrRolls === null}
        class:text-gray-500={hpRoll === null || attrRolls === null}
        disabled={hpRoll === null || attrRolls === null}
        on:click={confirmLevelUp}
      >
        Confirm Level Up
      </button>
    {/if}
  </div>
</Modal>
