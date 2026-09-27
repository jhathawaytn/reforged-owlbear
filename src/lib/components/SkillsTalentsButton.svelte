<script lang="ts">
  import Modal from "./Modal.svelte";
  import SkillsTalentsPicker from "./SkillsTalentsPicker.svelte";

  let showModal = false;
</script>

<button class="bg-black text-white px-2 rounded-md text-sm" on:click={() => (showModal = true)}>
  Manage
</button>

<Modal bind:showModal vw={75}>
  <h1 slot="header">Skills &amp; Talents</h1>
  <div class="w-full max-w-3xl max-h-[65vh] overflow-y-auto pr-1">
    <SkillsTalentsPicker />
  </div>
</Modal>
