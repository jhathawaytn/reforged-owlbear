<script lang="ts">
  import { Page } from "../model/PageStore";
</script>

<button
  class="text-white px-1 rounded-md"
  class:bg-green-600={$Page === "equipment"}
  class:bg-black={$Page !== "equipment"}
  title="Equipment & Usage Dice"
  on:click={() => ($Page = "equipment")}
>
  <i class="material-icons translate-y-1">backpack</i>
</button>
