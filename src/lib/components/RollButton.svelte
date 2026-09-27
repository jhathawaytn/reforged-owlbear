<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { rollSave } from "../utils";
  import type { SaveRollMode, SaveRollResult } from "../utils";
  import Menu from "./Menu/Menu.svelte";
  import MenuOption from "./Menu/MenuOption.svelte";
  import { notify } from "../services/Notifier";

  export let label: string;
  export let target: number; // the Attribute score to roll under
  export let modifier: number = 0;
  export let disabled = false;

  // Callers that only care "a roll happened" can ignore the payload; callers
  // that need to branch on the outcome (e.g. a Critical Save gating whether
  // an Injury follows) read event.detail.
  const dispatch = createEventDispatcher<{ rolled: SaveRollResult }>();

  let showMenu = false;
  let pos = { x: 0, y: 0 };
  let touchTimer: ReturnType<typeof setTimeout>;

  function touchStart(e: TouchEvent) {
    touchTimer = setTimeout(() => {
      onRightClick(e as unknown as MouseEvent);
      touchTimer = null;
    }, 500);
  }
  function touchEnd() {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  }

  function formatMsg(r: SaveRollResult, mode: SaveRollMode) {
    const rollNote =
      r.otherRoll !== undefined ? `${r.natural} vs. ${r.otherRoll}, kept ${r.natural}` : `${r.natural}`;
    const modNote = modifier ? ` ${modifier >= 0 ? "+" : ""}${modifier} = ${r.total}` : "";
    const outcome = r.autoResult
      ? r.autoResult === "success"
        ? "Natural 1: automatic Success"
        : "Natural 20: automatic Failure"
      : r.success
        ? `Success (vs. ${target})`
        : `Failure (vs. ${target})`;
    return `${label} Save${mode !== "normal" ? ` (${mode})` : ""}: rolled ${rollNote}${modNote} -> ${outcome}`;
  }

  function roll() {
    const r = rollSave(target, modifier, "normal");
    notify(formatMsg(r, "normal"));
    dispatch("rolled", r);
  }
  function rollWithAdvantage() {
    const r = rollSave(target, modifier, "advantage");
    notify(formatMsg(r, "advantage"));
    dispatch("rolled", r);
  }
  function rollWithDisadvantage() {
    const r = rollSave(target, modifier, "disadvantage");
    notify(formatMsg(r, "disadvantage"));
    dispatch("rolled", r);
  }
  function rollSecretly() {
    const r = rollSave(target, modifier, "normal");
    notify(formatMsg(r, "normal"), { secret: true });
    dispatch("rolled", r);
  }

  async function onRightClick(e: MouseEvent) {
    if (disabled) return;
    if (showMenu) {
      showMenu = false;
      await new Promise((res) => setTimeout(res, 100));
    }
    pos = { x: e.clientX, y: e.clientY };
    showMenu = true;
  }
  function closeMenu() {
    showMenu = false;
  }
</script>

<div>
  <button
    on:click={roll}
    {disabled}
    on:contextmenu|preventDefault={onRightClick}
    on:touchstart={touchStart}
    on:touchend={touchEnd}
    class="bg-black text-white pt-1 px-1 rounded-md"
    class:opacity-50={disabled}
    class:cursor-not-allowed={disabled}
  >
    <slot><div class="rounded-md bg-black text-white p-1">{target}</div></slot>
  </button>

  {#if showMenu}
    <Menu {...pos} on:click={closeMenu} on:clickoutside={closeMenu}>
      <MenuOption on:click={roll} text="Roll" />
      <MenuOption on:click={rollSecretly}>
        <div class="text-black">Roll Secretly</div>
      </MenuOption>
      <MenuOption on:click={rollWithAdvantage}>
        <div class="text-green-700">Roll With Advantage</div>
      </MenuOption>
      <MenuOption on:click={rollWithDisadvantage}>
        <div class="text-red-700">Roll With Disadvantage</div>
      </MenuOption>
    </Menu>
  {/if}
</div>
