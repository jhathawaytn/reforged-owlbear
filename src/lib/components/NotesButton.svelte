<script lang="ts">
  import Modal from "./Modal.svelte";
  import { PlayerCharacterStore as pc } from "../model/ReforgedCharacter";

  let showModal = false;
</script>

<button class="bg-black text-white px-1" title="Hooks & Notes" on:click={() => (showModal = true)}
  ><i class="material-icons translate-y-1">notes</i></button
>

<Modal bind:showModal>
  <h1 slot="header">Notes</h1>
  <div class="w-[300px] h-[500px] md:w-[700px] md:h-[550px] flex flex-col gap-2">
    <label class="flex flex-col gap-1">
      <h2>Hooks</h2>
      <textarea bind:value={$pc.hooks} class="flex-1 resize-none" placeholder="Rivals, debts, oaths, mysteries..." />
    </label>
    <label class="flex flex-col gap-1">
      <h2>Notes</h2>
      <textarea bind:value={$pc.notes} class="flex-1 resize-none" />
    </label>
  </div>
</Modal>
