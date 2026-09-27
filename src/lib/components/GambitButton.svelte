<script lang="ts">
  import Modal from "./Modal.svelte";
  import { stepWeaponDie } from "../types";
  import type { Attack, GearItem } from "../types";
  import { rollNotation } from "../services/DicePlus";
  import { notify } from "../services/Notifier";

  // One instance per Attack row, matching WeaponStressButton's pattern -
  // each Gambit declaration is entirely local to its own modal, no shared
  // state between rows.
  export let attack: Attack;
  export let gear: GearItem | undefined;

  let showModal = false;

  type GambitType = "Disarm" | "Shove" | "Trip" | "Bind" | "Feint" | "Blind" | "Drag" | "Custom";
  // §13.9.4 - the book's named Gambits are examples, not an exhaustive or
  // Attribute-mapped list; the GM picks the Resistance Attribute case by
  // case (§13.9.3), so this deliberately doesn't guess one per Gambit.
  const GAMBITS: { id: GambitType; desc: string }[] = [
    { id: "Disarm", desc: "Force the target to drop or lose control of a held item." },
    { id: "Shove", desc: "Drive the target away, out of Engagement, or into a less favorable position." },
    { id: "Trip", desc: "Knock the target Prone." },
    { id: "Bind", desc: "Restrict the target's movement or weapon." },
    {
      id: "Feint",
      desc: "Trick the target into committing to the wrong defense. On success, the target is Exposed until the start of its next turn - the first melee or ranged Action against it before then cannot be Blocked or Parried (still Dodgeable or answerable with Fight Back).",
    },
    { id: "Blind", desc: "Obstruct the target's vision." },
    { id: "Drag", desc: "Pull the target toward you." },
    { id: "Custom", desc: "Any other maneuver the GM approves, resolved the same way (§13.9.4)." },
  ];

  type Phase = "declare" | "rolled" | "resolved";
  let phase: Phase = "declare";
  let gambitType: GambitType = "Disarm";
  let customName = "";
  let damage = 0;
  let sacrifice = 0;
  let resultLog = "";

  function reset() {
    phase = "declare";
    gambitType = "Disarm";
    customName = "";
    damage = 0;
    sacrifice = 0;
    resultLog = "";
  }
  function open() {
    reset();
    showModal = true;
  }

  $: selectedGambit = GAMBITS.find((g) => g.id === gambitType)!;
  $: gambitLabel = gambitType === "Custom" ? customName || "Custom Gambit" : gambitType;

  // Weapon Condition (§9.4.2), same as the plain Roll button and Weapon
  // Stress - Damaged steps the die down, Broken has no damage to sacrifice.
  function effectiveRoll(): { notation: string; broken: boolean } {
    if (!gear || gear.condition === "Healthy" || !gear.condition) return { notation: attack.roll, broken: false };
    if (gear.condition === "Damaged") return { notation: stepWeaponDie(attack.roll), broken: false };
    return { notation: attack.roll, broken: true };
  }

  async function rollDamage() {
    const { notation, broken } = effectiveRoll();
    if (broken) {
      notify(`${attack.name || "Attack"}: Broken - no normal damage, can't Gambit.`);
      return;
    }
    const result = await rollNotation(notation);
    if (!result) {
      notify(`${attack.name || "Attack"}: couldn't parse "${notation}"`);
      return;
    }
    damage = result.total;
    sacrifice = 0;
    resultLog = `Rolled ${result.breakdown}.`;
    phase = "rolled";
  }

  function confirmGambit() {
    const clamped = Math.max(0, Math.min(sacrifice, damage));
    const remaining = damage - clamped;
    const msg =
      `${attack.name || "Attack"}: ${gambitLabel} Gambit - sacrificed ${clamped} of ${damage} as Gambit Difficulty, ${remaining} damage applied normally. ` +
      `Target's Resistance Save (GM picks the Attribute) succeeds only if the result is > ${clamped} AND ≤ that Attribute; otherwise the Gambit succeeds.` +
      (gambitType === "Feint"
        ? " On success: target is Exposed until the start of its next turn (first melee/ranged Action against it can't be Blocked or Parried)."
        : "");
    notify(msg);
    resultLog = msg;
    phase = "resolved";
  }
</script>

<button
  class="border rounded-md px-1 text-xs"
  title="Declare a Gambit (§13.9) - trade weapon damage for a tactical effect"
  on:click={open}
>
  Gambit
</button>

<Modal bind:showModal vw={40}>
  <h1 slot="header">Gambit - {attack.name || "Attack"}</h1>
  <div class="w-full flex flex-col gap-2 text-sm">
    {#if phase === "declare"}
      <label class="flex flex-col text-xs">
        Gambit
        <select bind:value={gambitType}>
          {#each GAMBITS as g (g.id)}<option value={g.id}>{g.id}</option>{/each}
        </select>
      </label>
      {#if gambitType === "Custom"}
        <label class="flex flex-col text-xs">
          Describe it (the GM approves)
          <input type="text" bind:value={customName} placeholder="e.g. Kick sand in their eyes" />
        </label>
      {/if}
      <div class="text-xs text-gray-500">{selectedGambit.desc}</div>
      <div class="text-xs text-gray-500">
        Resistance Save: the GM chooses the most appropriate Attribute - common examples are STR (shoved/
        restrained), DEX (footing/weapon retention), INT (deception), WIL (intimidation/hesitation).
      </div>
      <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={rollDamage}>Roll Damage</button>
    {/if}

    {#if phase === "rolled"}
      <div class="text-xs">Rolled <strong>{damage}</strong> damage.</div>
      <label class="flex flex-col text-xs">
        Sacrifice as Gambit Difficulty (0-{damage})
        <input type="number" inputmode="numeric" min="0" max={damage} bind:value={sacrifice} class="w-24" />
      </label>
      <div class="text-xs text-gray-500">Remaining damage applied normally: {Math.max(0, damage - sacrifice)}</div>
      <button class="bg-black text-white rounded-md px-2 py-1 text-xs" on:click={confirmGambit}>Confirm</button>
    {/if}

    {#if resultLog}
      <pre class="text-xs whitespace-pre-wrap bg-gray-100 rounded-md p-2">{resultLog}</pre>
    {/if}

    {#if phase === "resolved"}
      <button class="border rounded-md px-2 py-1 text-xs" on:click={() => (showModal = false)}>Close</button>
    {/if}
  </div>
</Modal>
