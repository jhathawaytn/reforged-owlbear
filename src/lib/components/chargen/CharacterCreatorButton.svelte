<script lang="ts">
  import { defaultPC, PlayerCharacterStore as pc } from "../../model/ReforgedCharacter";
  import { CurrentSaveSlot } from "../../services/SaveSlotTracker";
  import { ShowCharacterCreator } from "../../model/CharacterCreatorStore";

  // Bound to the parent Options modal's own showModal - lets us close Options
  // when the wizard launches, and re-arm the confirm if Options closes first.
  export let optionsOpen = false;

  let armed = false;

  $: if (!optionsOpen) armed = false;

  function onClick() {
    if (!armed) {
      armed = true;
      return;
    }
    $pc = defaultPC();
    armed = false;
    optionsOpen = false;
    $ShowCharacterCreator = true;
  }
</script>

<button class:bg-red-700={armed} class:bg-black={!armed} class="text-white px-1 rounded-md" on:click={onClick}>
  {armed ? `Click again to erase Slot ${$CurrentSaveSlot} and start` : "Character Creator"}
</button>
