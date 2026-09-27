<script lang="ts">
  import { Page } from "../model/PageStore";
</script>

<button
  class="bg-black text-white px-1"
  title={$Page === "expedition" ? "Back to character sheet" : "Company Expedition"}
  on:click={() => ($Page = $Page === "expedition" ? "sheet" : "expedition")}
>
  <i class="material-icons translate-y-1">{$Page === "expedition" ? "arrow_back" : "explore"}</i>
</button>
