<script lang="ts">
  import type { UsageDieState } from "../types";

  export let size: UsageDieState;

  // Simplified, commonly-used shape convention (not literal face geometry):
  // d4 triangle, d6 square, d8 diamond, d10 pentagon, d12 hexagon.
  const points: Record<string, string> = {
    d4: "30,4 56,52 4,52",
    d6: "6,6 54,6 54,54 6,54",
    d8: "30,2 58,30 30,58 2,30",
    d10: "30,2 56,20 46,54 14,54 4,20",
    d12: "30,2 52,15 52,45 30,58 8,45 8,15",
  };
</script>

{#if size === "depleted"}
  <div
    class="w-14 h-14 flex items-center justify-center rounded-md border-2 border-dashed border-gray-400 text-gray-400 text-xs font-bold"
  >
    empty
  </div>
{:else}
  <svg viewBox="0 0 60 60" width="56" height="56">
    <polygon points={points[size]} fill="#000" stroke="#fff" stroke-width="1.5" />
    <text x="30" y="35" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">
      {size}
    </text>
  </svg>
{/if}
