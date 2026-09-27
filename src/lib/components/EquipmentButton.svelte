<script lang="ts">
  import { Page } from "../model/PageStore";
</script>

<button
  class="bg-black text-white px-1"
  title={$Page === "sheet" ? "Equipment & Usage Dice" : "Back to sheet"}
  on:click={() => ($Page = $Page === "sheet" ? "equipment" : "sheet")}
>
  <i class="material-icons translate-y-1">{$Page === "sheet" ? "backpack" : "arrow_back"}</i>
</button>
