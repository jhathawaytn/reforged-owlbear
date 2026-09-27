<script lang="ts">
  import Modal from "./Modal.svelte";
  let showModal = false;
</script>

<button
  class="bg-black text-white rounded-full w-5 h-5 text-xs"
  title="About this sheet"
  on:click={() => (showModal = true)}
>
  i
</button>

<Modal bind:showModal vw={40}>
  <h1 slot="header">Reforged Sheet</h1>
  <div class="flex flex-col gap-2 max-w-md">
    <p>An unofficial character sheet for Reforged (Gods of the Forbidden North).</p>
    <p>
      Click an Attribute's roll button for a normal Save. Right-click (or press and hold on mobile) for
      Roll Secretly, Advantage, or Disadvantage.
    </p>
    <p>
      Gear capacity, Overburdened status, and Technique capacity are computed from your STR and Level
      automatically.
    </p>
  </div>
</Modal>
