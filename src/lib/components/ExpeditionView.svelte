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
    type ExpeditionAssignment,
    type WildernessActivity,
    type WildernessRole,
  } from "../model/ExpeditionStore";

  type CompanyMember = { id: string; name: string };

  const QUARTERS: TravelQuarter[] = ["Morning", "Day", "Evening", "Night"];
  const ROUTES: RouteMode[] = ["Known Route", "Unmapped Country"];
  const PACES: TravelPace[] = ["Cautious", "Steady", "Forced"];
  const ACTIVITIES: WildernessActivity[] = [
    "Travel",
    "Forage for Food",
    "Forage for Water",
    "Hunt",
    "Fish",
    "Make Camp",
    "Sleep",
    "Other",
  ];
  const ROLES: WildernessRole[] = ["Trailblazer", "Keep Watch", "Quartermaster"];

  $: company = $PartyStore.map((p) => ({ id: p.id, name: p.name }));
  $: currentAssignments = $expedition.wilderness.assignments;
  $: assignedCompany = company.map((member) => ({
    member,
    assignment: currentAssignments.find((a) => a.playerId === member.id) ?? {
      playerId: member.id,
      activity: "Travel" as WildernessActivity,
    },
  }));
  $: roleCards = ROLES.map((role) => {
    const assignment = currentAssignments.find((a) => a.role === role);
    const member = assignment ? company.find((p) => p.id === assignment.playerId) : undefined;
    return { role, assignment, member };
  });
  $: activityCards = ACTIVITIES.map((activity) => ({
    activity,
    members: assignedCompany.filter(({ assignment }) => assignment.activity === activity),
  }));
  $: haltsForActivity = assignedCompany.some(({ assignment }) =>
    ["Forage for Food", "Forage for Water", "Hunt", "Fish"].includes(assignment.activity),
  );

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

  function onRouteChange(e: Event) {
    patchWilderness({ routeMode: (e.currentTarget as HTMLSelectElement).value as RouteMode });
  }

  function onPaceChange(e: Event) {
    patchWilderness({ pace: (e.currentTarget as HTMLSelectElement).value as TravelPace });
  }

  function assignmentFor(playerId: string): ExpeditionAssignment {
    return (
      currentAssignments.find((a) => a.playerId === playerId) ?? {
        playerId,
        activity: "Travel",
      }
    );
  }

  function incompatibleWithQuartermaster(activity: WildernessActivity): boolean {
    return ["Forage for Food", "Forage for Water", "Hunt", "Fish"].includes(activity);
  }

  async function saveAssignment(nextAssignment: ExpeditionAssignment) {
    const others = $expedition.wilderness.assignments.filter((a) => a.playerId !== nextAssignment.playerId);
    await patchWilderness({ assignments: [...others, nextAssignment] });
  }

  async function onActivityChange(playerId: string, e: Event) {
    if (!$isGM) return;
    const activity = (e.currentTarget as HTMLSelectElement).value as WildernessActivity;
    const current = assignmentFor(playerId);
    let role = current.role;

    // Trailblazer and Keep Watch are Travel Roles: the character remains Traveling.
    if ((role === "Trailblazer" || role === "Keep Watch") && activity !== "Travel") {
      role = undefined;
    }

    // Quartermaster may Travel or assist Make Camp, but cannot Forage, Hunt, or Fish.
    if (role === "Quartermaster" && incompatibleWithQuartermaster(activity)) {
      role = undefined;
    }

    await saveAssignment({ playerId, activity, role });
  }

  async function onRoleChange(playerId: string, e: Event) {
    if (!$isGM) return;
    const raw = (e.currentTarget as HTMLSelectElement).value;
    const role = raw ? (raw as WildernessRole) : undefined;
    const current = assignmentFor(playerId);
    let activity = current.activity;

    if (role === "Trailblazer" || role === "Keep Watch") {
      activity = "Travel";
    } else if (role === "Quartermaster" && incompatibleWithQuartermaster(activity)) {
      activity = "Travel";
    }

    // Each Travel Role accepts one character. Assigning it here clears it from anyone else.
    let assignments = $expedition.wilderness.assignments
      .filter((a) => a.playerId !== playerId)
      .map((a) => (role && a.role === role ? { ...a, role: undefined } : a));

    assignments = [...assignments, { playerId, activity, role }];
    await patchWilderness({ assignments });
  }

  async function resetAssignments() {
    if (!$isGM) return;
    await patchWilderness({ assignments: [] });
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
            <select disabled={!$isGM} value={$expedition.wilderness.routeMode} on:change={onRouteChange}>
              {#each ROUTES as route}<option value={route}>{route}</option>{/each}
            </select>
          </label>
          <label>
            Pace
            <select disabled={!$isGM} value={$expedition.wilderness.pace} on:change={onPaceChange}>
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

        <div class="mt-3">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div>
              <div class="font-bold text-xs">Travel Roles</div>
              <div class="text-[10px] text-gray-500">Roles are performed while Traveling; each role accepts one character.</div>
            </div>
            {#if $isGM}
              <button class="border rounded-md px-2 py-1 text-[10px]" on:click={resetAssignments}>Reset Assignments</button>
            {/if}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-1">
            {#each roleCards as card (card.role)}
              <div class="assignment-card">
                <div class="font-bold text-xs">{card.role}</div>
                {#if card.assignment}
                  <div class="flex items-center gap-1 mt-1 text-xs">
                    <i class="material-icons text-sm">person</i>
                    <span class="truncate">{card.member?.name ?? "Disconnected character"}</span>
                  </div>
                {:else}
                  <div class="text-[10px] text-gray-400 mt-1">Unassigned</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-xs">Quarter Activities</div>
              <div class="text-[10px] text-gray-500">Each character takes one Activity this Quarter.</div>
            </div>
            {#if haltsForActivity}
              <div class="text-[10px] font-bold text-red-700 border border-red-300 bg-red-50 rounded px-2 py-1">
                Company halts — no travel progress this Quarter.
              </div>
            {/if}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-1 mt-1">
            {#each activityCards as card (card.activity)}
              <div class="assignment-card min-h-[74px]">
                <div class="font-bold text-xs">{card.activity}</div>
                {#if card.members.length}
                  <div class="flex flex-col gap-1 mt-1">
                    {#each card.members as entry (entry.member.id)}
                      <div class="flex items-center gap-1 text-xs min-w-0">
                        <i class="material-icons text-sm">person</i>
                        <span class="truncate">{entry.member.name}</span>
                        {#if entry.assignment.role}
                          <span class="role-chip">{entry.assignment.role}</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="text-[10px] text-gray-400 mt-1">—</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="exp-cell min-h-0 overflow-y-auto">
        <h2>COMPANY ASSIGNMENTS</h2>
        <div class="text-[10px] text-gray-500 mb-2">
          Choose each character's Quarter Activity and optional Travel Role. Everyone defaults to Travel.
        </div>
        {#if company.length}
          <div class="flex flex-col gap-2">
            {#each company as p}
              {@const assignment = assignmentFor(p.id)}
              <div class="border rounded-md p-2 text-xs">
                <div class="font-bold flex items-center gap-1 mb-1">
                  <i class="material-icons text-sm">person</i>
                  <span class="truncate">{p.name}</span>
                </div>
                <label class="block">
                  Activity
                  <select disabled={!$isGM} value={assignment.activity} on:change={(e) => onActivityChange(p.id, e)}>
                    {#each ACTIVITIES as activity}
                      <option value={activity}>{activity}</option>
                    {/each}
                  </select>
                </label>
                <label class="block mt-1">
                  Travel Role
                  <select disabled={!$isGM} value={assignment.role ?? ""} on:change={(e) => onRoleChange(p.id, e)}>
                    <option value="">None</option>
                    {#each ROLES as role}
                      <option value={role}>{role}</option>
                    {/each}
                  </select>
                </label>
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

  .assignment-card {
    @apply border rounded-md p-2 bg-gray-50 min-w-0;
  }

  .role-chip {
    @apply ml-auto text-[9px] px-1 rounded bg-black text-white whitespace-nowrap;
  }

  input,
  select,
  textarea {
    @apply border rounded px-1 py-0.5 bg-white disabled:bg-gray-100 disabled:text-gray-500;
  }
</style>
