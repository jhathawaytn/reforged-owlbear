<script context="module" lang="ts">
  import { writable } from "svelte/store";
  // Shared across every WeaponStressButton instance purely so opening one
  // row's menu closes any other row's menu left open - each instance still
  // owns and renders its own menu state independently (see below), this
  // just coordinates visibility, avoiding the bugs of a single shared menu.
  const openAttackId = writable<string | null>(null);
</script>

<script lang="ts">
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";
  import { degradeCondition, stepWeaponDie } from "../types";
  import type { Attack, GearItem } from "../types";
  import { parseAndRoll } from "../utils";
  import { notify } from "../services/Notifier";
  import Menu from "./Menu/Menu.svelte";
  import MenuOption from "./Menu/MenuOption.svelte";

  // One instance per Attack row (see AttacksView) - each gets its own local
  // menu state, the same pattern RollButton uses for its Advantage/
  // Disadvantage menu, so opening one row's menu can never affect another's.
  export let attack: Attack;
  export let gear: GearItem;

  let pos = { x: 0, y: 0 };
  $: showMenu = $openAttackId === attack.id;

  function open(e: MouseEvent) {
    pos = { x: e.clientX, y: e.clientY };
    openAttackId.set(attack.id);
  }
  function close() {
    openAttackId.set(null);
  }

  // Weapon Condition (§9.4.2): Damaged steps the native die down one size;
  // Broken has no normal damage.
  function effectiveRoll(): { notation: string; broken: boolean } {
    if (gear.condition === "Healthy" || !gear.condition) return { notation: attack.roll, broken: false };
    if (gear.condition === "Damaged") return { notation: stepWeaponDie(attack.roll), broken: false };
    return { notation: attack.roll, broken: true };
  }

  function applyStress(option: string, brutalSteps = 1) {
    close();
    const steps = option === "Brutal" ? brutalSteps : 1;
    for (let i = 0; i < steps; i++) degradeCondition(gear);
    $pc.gear = $pc.gear;

    if (option === "Cleaving") {
      const result = parseAndRoll("d4");
      notify(
        `${attack.name || "Attack"}: Cleaving Stress - ${gear.name} degrades 1 step, one Impaired attack (d4) against another target in reach (no chain): ${result?.breakdown ?? "?"}.`,
      );
      return;
    }

    const { notation, broken } = effectiveRoll();
    if (broken) {
      notify(`${attack.name || "Attack"}: Broken - no normal damage.`);
      return;
    }
    const result = parseAndRoll(notation);
    if (!result) {
      notify(`${attack.name || "Attack"}: couldn't parse "${notation}"`);
      return;
    }
    const bonus = option === "Brutal" ? brutalSteps : 0;
    const total = result.total + bonus;
    const reminder =
      option === "Drive Through"
        ? " - ignores 1 Armor (resolve with the GM)."
        : option === "Force Maneuver"
          ? " - +1 Gambit Difficulty (resolve with the GM)."
          : option === "Vicious"
            ? " - may inflict Bleeding if the fiction supports it (resolve with the GM)."
            : "";
    notify(
      `${attack.name || "Attack"} (${option} Stress, ${gear.name} degrades ${steps} step${steps === 1 ? "" : "s"}): ${result.breakdown}${bonus ? ` +${bonus} (Brutal)` : ""} = ${total}${reminder}`,
    );
  }
</script>

<button
  class="border rounded-md px-1 text-xs"
  title="Spend Weapon Stress (§9.4.6) - degrades the weapon 1 Condition step"
  on:click|stopPropagation={open}
>
  Stress
</button>

{#if showMenu}
  <Menu x={pos.x} y={pos.y} on:click={close} on:clickoutside={close}>
    <MenuOption on:click={() => applyStress("Drive Through")} text="Drive Through - ignore 1 Armor" />
    <MenuOption on:click={() => applyStress("Force Maneuver")} text="Force Maneuver - +1 Gambit Difficulty" />
    {#if gear.specialStress === "Brutal"}
      <MenuOption on:click={() => applyStress("Brutal", 1)} text="Brutal - 1 step, +1 damage" />
      <MenuOption on:click={() => applyStress("Brutal", 2)} text="Brutal - 2 steps, +2 damage" />
    {/if}
    {#if gear.specialStress === "Cleaving"}
      <MenuOption on:click={() => applyStress("Cleaving")} text="Cleaving - Impaired attack on another target" />
    {/if}
    {#if gear.specialStress === "Vicious"}
      <MenuOption on:click={() => applyStress("Vicious")} text="Vicious - may inflict Bleeding" />
    {/if}
  </Menu>
{/if}
