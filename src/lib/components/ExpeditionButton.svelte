<script lang="ts">
  import { Page } from "../model/PageStore";
</script>

<button
  class="text-white px-1 rounded-md"
  class:bg-green-600={$Page === "expedition"}
  class:bg-black={$Page !== "expedition"}
  title="Company Expedition"
  on:click={() => ($Page = "expedition")}
>
  <i class="material-icons translate-y-1">explore</i>
</button>
