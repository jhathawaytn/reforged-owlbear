<script lang="ts">
  import { isGM, PartyStore } from "../services/OBRHelper";
  import {
    ExpeditionStore as expedition,
    saveExpeditionState,
    type ExpeditionMode,
    type TravelQuarter,
    type RouteMode,
    type TravelPace,
    type WildernessExpeditionState,
    type ExplorationExpeditionState,
  } from "../model/ExpeditionStore";

  const QUARTERS: TravelQuarter[] = ["Morning", "Day", "Evening", "Night"];
  const ROUTES: RouteMode[] = ["Known Route", "Unmapped Country"];
  const PACES: TravelPace[] = ["Cautious", "Steady", "Forced"];

  $: company = $PartyStore.map((p) => ({ id: p.id, name: p.name }));

  async function setMode(mode: ExpeditionMode) {
    if (!$isGM) return;
    await saveExpeditionState({ ...$expedition, mode });
  }

  async function patchWilderness(patch: Partial<WildernessExpeditionState>) {
    if (!$isGM) return;
    await saveExpeditionState({
      ...$expedition,
      wilderness: { ...$expedition.wilderness, ...patch },
    });
  }

  async function patchExploration(patch: Partial<ExplorationExpeditionState>) {
    if (!$isGM) return;
    await saveExpeditionState({
      ...$expedition,
      exploration: { ...$expedition.exploration, ...patch },
    });
  }

  function quarterIndex(q: TravelQuarter): number {
    return QUARTERS.indexOf(q);
  }
</script>

<div class="w-full h-full flex flex-col gap-2">
  <div class="exp-cell shrink-0">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h2>COMPANY EXPEDITION</h2>
        <div class="text-[10px] text-gray-500">
          Shared room state — everyone sees the same expedition board. GM controls procedure state.
        </div>
      </div>
      <div class="flex gap-1">
        <button
          class="px-3 py-1 rounded-md text-xs"
          class:bg-black={$expedition.mode === "wilderness"}
          class:text-white={$expedition.mode === "wilderness"}
          class:border={$expedition.mode !== "wilderness"}
          disabled={!$isGM}
          on:click={() => setMode("wilderness")}
        >
          Wilderness
        </button>
        <button
          class="px-3 py-1 rounded-md text-xs"
          class:bg-black={$expedition.mode === "exploration"}
          class:text-white={$expedition.mode === "exploration"}
          class:border={$expedition.mode !== "exploration"}
          disabled={!$isGM}
          on:click={() => setMode("exploration")}
        >
          Dungeon / Location
        </button>
      </div>
    </div>
  </div>

  {#if $expedition.mode === "wilderness"}
    <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2 flex-1 min-h-0">
      <div class="exp-cell min-h-0 overflow-y-auto">
        <div class="flex items-center justify-between gap-2">
          <h2>WILDERNESS TRAVEL</h2>
          <span class="text-xs font-bold">Day {$expedition.wilderness.day}</span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
          <label>
            Route
            <select
              disabled={!$isGM}
              value={$expedition.wilderness.routeMode}
              on:change={(e) => patchWilderness({ routeMode: e.currentTarget.value as RouteMode })}
            >
              {#each ROUTES as route}<option value={route}>{route}</option>{/each}
            </select>
          </label>
          <label>
            Pace
            <select
              disabled={!$isGM}
              value={$expedition.wilderness.pace}
              on:change={(e) => patchWilderness({ pace: e.currentTarget.value as TravelPace })}
            >
              {#each PACES as pace}<option value={pace}>{pace}</option>{/each}
            </select>
          </label>
          <label>
            Weather
            <input
              disabled={!$isGM}
              value={$expedition.wilderness.weather}
              on:change={(e) => patchWilderness({ weather: e.currentTarget.value })}
            />
          </label>
          <label>
            Target Quarters
            <input
              type="number"
              min="0"
              disabled={!$isGM}
              value={$expedition.wilderness.targetQuarters}
              on:change={(e) => patchWilderness({ targetQuarters: parseInt(e.currentTarget.value) || 0 })}
            />
          </label>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-2 text-xs">
          <label>
            From
            <input
              disabled={!$isGM}
              value={$expedition.wilderness.currentLocation}
              placeholder="Current location"
              on:change={(e) => patchWilderness({ currentLocation: e.currentTarget.value })}
            />
          </label>
          <label>
            To
            <input
              disabled={!$isGM}
              value={$expedition.wilderness.destination}
              placeholder="Destination"
              on:change={(e) => patchWilderness({ destination: e.currentTarget.value })}
            />
          </label>
        </div>

        <div class="mt-3">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="font-bold">Travel Phase</span>
            <span>{$expedition.wilderness.progress} / {$expedition.wilderness.targetQuarters || "?"} Quarters</span>
          </div>
          <div class="grid grid-cols-4 gap-1">
            {#each QUARTERS as q}
              <button
                class="rounded-md border px-2 py-2 text-xs"
                class:bg-black={$expedition.wilderness.quarter === q}
                class:text-white={$expedition.wilderness.quarter === q}
                class:bg-gray-100={quarterIndex(q) < quarterIndex($expedition.wilderness.quarter)}
                disabled={!$isGM}
                on:click={() => patchWilderness({ quarter: q })}
              >
                {q}
              </button>
            {/each}
          </div>
        </div>

        <div class="mt-3 border rounded-md p-2 bg-gray-50">
          <div class="font-bold text-xs">Quarter Activities & Travel Roles</div>
          <div class="text-[10px] text-gray-500 mt-1">
            Assignment/resolution controls land in the next pass. This shared board is now the authoritative Company travel state.
          </div>
        </div>
      </div>

      <div class="exp-cell min-h-0 overflow-y-auto">
        <h2>COMPANY</h2>
        <div class="text-[10px] text-gray-500 mb-2">
          Connected Owlbear players currently available for expedition assignments.
        </div>
        {#if company.length}
          <div class="flex flex-col gap-1">
            {#each company as p}
              <div class="border rounded-md px-2 py-1 text-xs flex items-center gap-2">
                <i class="material-icons text-sm">person</i>
                <span class="truncate">{p.name}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-xs text-gray-400">No player characters currently connected.</div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2 flex-1 min-h-0">
      <div class="exp-cell min-h-0 overflow-y-auto">
        <div class="flex items-center justify-between gap-2">
          <h2>DUNGEON / LOCATION EXPLORATION</h2>
          <span class="text-xs font-bold">Turn {$expedition.exploration.turn}</span>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-2 text-xs">
          <label>
            Site
            <input
              disabled={!$isGM}
              value={$expedition.exploration.siteName}
              placeholder="Ruin, cave, tomb..."
              on:change={(e) => patchExploration({ siteName: e.currentTarget.value })}
            />
          </label>
          <label>
            Current Site Area
            <input
              disabled={!$isGM}
              value={$expedition.exploration.siteArea}
              placeholder="Entry hall, lower crypt..."
              on:change={(e) => patchExploration({ siteArea: e.currentTarget.value })}
            />
          </label>
        </div>

        <div class="mt-3 border rounded-md p-2 bg-gray-50">
          <div class="font-bold text-xs">Shared Exploration Turn</div>
          <div class="text-[10px] text-gray-500 mt-1">
            Chapter 10 uses one shared Company turn of about 10 minutes. Activity assignment, pressure checkpoints,
            formation, light and Dungeon Event handling come in the exploration pass.
          </div>
        </div>

        <label class="text-xs mt-3 block">
          Company Notes
          <textarea
            class="w-full resize-none"
            rows="6"
            disabled={!$isGM}
            value={$expedition.exploration.notes}
            on:change={(e) => patchExploration({ notes: e.currentTarget.value })}
          />
        </label>
      </div>

      <div class="exp-cell min-h-0 overflow-y-auto">
        <h2>COMPANY</h2>
        {#if company.length}
          <div class="flex flex-col gap-1 mt-2">
            {#each company as p}
              <div class="border rounded-md px-2 py-1 text-xs flex items-center gap-2">
                <i class="material-icons text-sm">person</i>
                <span class="truncate">{p.name}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-xs text-gray-400">No player characters currently connected.</div>
        {/if}
      </div>
    </div>
  {/if}

  {#if !$isGM}
    <div class="text-[10px] text-gray-500 text-center">
      Viewing shared expedition state. Procedure controls are GM-only.
    </div>
  {/if}
</div>


<style lang="postcss">
  .exp-cell {
    @apply bg-white p-2 flex flex-col relative rounded-lg min-w-0;
    box-shadow: inset 0 0 5px #000;
  }

  input,
  select,
  textarea {
    @apply border rounded px-1 py-0.5 bg-white disabled:bg-gray-100 disabled:text-gray-500;
  }
</style>
