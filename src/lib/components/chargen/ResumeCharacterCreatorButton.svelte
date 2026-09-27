<script lang="ts">
  import { ShowCharacterCreator } from "../../model/CharacterCreatorStore";
</script>

<button
  class="bg-black text-white px-1"
  title="Resume Character Creator (does not erase anything)"
  on:click={() => ($ShowCharacterCreator = true)}
>
  <i class="material-icons translate-y-1">badge</i>
</button>
