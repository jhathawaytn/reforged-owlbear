<script lang="ts">
  import { isGM, CurrentPlayerId, PartyStore, ReforgedPresenceStore } from "../services/OBRHelper";
  import {
    ExpeditionStore as expedition,
    saveExpeditionState,
    type ExpeditionMode,
    type TravelQuarter,
    type RouteMode,
    type TravelPace,
    type TravelTerrain,
    type WildernessExpeditionState,
    type ExplorationExpeditionState,
    type ExpeditionAssignment,
    type WildernessActivity,
    type WildernessRole,
  } from "../model/ExpeditionStore";
  import {
    PendingExpeditionRollStore,
    requestExpeditionRoll,
    resolvePendingExpeditionRoll,
    declinePendingExpeditionRoll,
    type ExpeditionRollKind,
    type ExpeditionRollResponse,
    type ExpeditionAttributeMode,
  } from "../services/ExpeditionRolls";

  type CompanyMember = { id: string; name: string };
  type QuarterTask = {
    id: string;
    kind: ExpeditionRollKind;
    playerId: string;
    playerName: string;
    attributeMode: ExpeditionAttributeMode;
    baseModifier: number;
    note?: string;
    status: "ready" | "waiting" | "done";
    response?: ExpeditionRollResponse;
  };

  const QUARTERS: TravelQuarter[] = ["Morning", "Day", "Evening", "Night"];
  const ROUTES: RouteMode[] = ["Known Route", "Unmapped Country"];
  const PACES: TravelPace[] = ["Cautious", "Steady", "Forced"];
  const TERRAINS: TravelTerrain[] = ["Open", "Broken", "Difficult", "Severe"];
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

  let quarterTasks: QuarterTask[] = [];
  let quarterPlanActive = false;
  let quarterMessage = "";
  let playerRollBusy = false;

  $: {
    const merged = new Map<string, CompanyMember>();

    for (const player of $PartyStore) {
      if (player.id !== $CurrentPlayerId && player.role === "PLAYER") {
        merged.set(player.id, { id: player.id, name: player.name });
      }
    }

    for (const client of $ReforgedPresenceStore) {
      if (client.id !== $CurrentPlayerId && client.role === "PLAYER") {
        merged.set(client.id, { id: client.id, name: client.name });
      }
    }

    company = [...merged.values()];
  }
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
  $: travelingThisQuarter =
    !haltsForActivity && assignedCompany.some(({ assignment }) => assignment.activity === "Travel");
  $: allQuarterTasksDone = quarterPlanActive && quarterTasks.every((task) => task.status === "done");

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

  function clearQuarterPlan() {
    quarterTasks = [];
    quarterPlanActive = false;
    quarterMessage = "";
  }

  function quarterIndex(q: TravelQuarter): number {
    return QUARTERS.indexOf(q);
  }

  function terrainPressure(): number {
    const terrain = $expedition.wilderness.terrain;
    return terrain === "Difficult" ? 2 : terrain === "Severe" ? 4 : 0;
  }

  function nextQuarter(q: TravelQuarter): { quarter: TravelQuarter; newDay: boolean } {
    const idx = QUARTERS.indexOf(q);
    if (idx >= QUARTERS.length - 1) return { quarter: "Morning", newDay: true };
    return { quarter: QUARTERS[idx + 1], newDay: false };
  }

  function onRouteChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({ routeMode: (e.currentTarget as HTMLSelectElement).value as RouteMode });
  }

  function onPaceChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({ pace: (e.currentTarget as HTMLSelectElement).value as TravelPace });
  }

  function onTerrainChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({ terrain: (e.currentTarget as HTMLSelectElement).value as TravelTerrain });
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
    clearQuarterPlan();
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
    clearQuarterPlan();
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
    clearQuarterPlan();
    await patchWilderness({ assignments: [] });
  }

  function makeTask(
    kind: ExpeditionRollKind,
    member: CompanyMember,
    attributeMode: ExpeditionAttributeMode,
    baseModifier = 0,
    note?: string,
  ): QuarterTask {
    return {
      id: `${kind}:${member.id}`,
      kind,
      playerId: member.id,
      playerName: member.name,
      attributeMode,
      baseModifier,
      note,
      status: "ready",
    };
  }

  function planQuarterResolution() {
    if (!$isGM) return;
    quarterMessage = "";
    const tasks: QuarterTask[] = [];

    if (!company.length) {
      quarterPlanActive = false;
      quarterTasks = [];
      quarterMessage = "No connected player characters are available to resolve this Quarter.";
      return;
    }

    if (travelingThisQuarter && $expedition.wilderness.routeMode === "Unmapped Country") {
      const trailAssignment = currentAssignments.find((a) => a.role === "Trailblazer");
      const trailMember = trailAssignment ? company.find((p) => p.id === trailAssignment.playerId) : undefined;
      if (!trailAssignment || !trailMember) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "Unmapped travel requires a connected Trailblazer before this Quarter can resolve.";
        return;
      }
      tasks.push(
        makeTask(
          "Trailblaze",
          trailMember,
          "INT",
          terrainPressure(),
          `Terrain pressure: ${$expedition.wilderness.terrain} ${terrainPressure() ? `+${terrainPressure()}` : "+0"}.`,
        ),
      );
    }

    for (const entry of assignedCompany) {
      const activity = entry.assignment.activity;
      if (activity === "Forage for Food" || activity === "Forage for Water") {
        tasks.push(makeTask(activity, entry.member, "INT"));
      } else if (activity === "Hunt" || activity === "Fish") {
        tasks.push(makeTask(activity, entry.member, "HIGHER_INT_DEX"));
      }
    }

    const campMembers = assignedCompany.filter(({ assignment }) => assignment.activity === "Make Camp");
    if (campMembers.length > 1) {
      quarterPlanActive = false;
      quarterTasks = [];
      quarterMessage =
        "More than one character is assigned Make Camp. The rules require one leader and helpers; leader/helper selection is the next resolver step. Leave only the leader on Make Camp for this pass.";
      return;
    }
    if (campMembers.length === 1) {
      tasks.push(
        makeTask(
          "Make Camp",
          campMembers[0].member,
          "INT_OR_STR",
          terrainPressure(),
          `Terrain pressure: ${$expedition.wilderness.terrain} ${terrainPressure() ? `+${terrainPressure()}` : "+0"}.`,
        ),
      );
    }

    quarterTasks = tasks;
    quarterPlanActive = true;
    quarterMessage = tasks.length
      ? "Request each required Save, then complete the Quarter."
      : "No Save is required for the declared Activities. The Quarter is ready to complete.";
  }

  async function requestTaskRoll(task: QuarterTask) {
    if (!$isGM || task.status === "waiting") return;
    task.status = "waiting";
    quarterTasks = [...quarterTasks];

    const response = await requestExpeditionRoll({
      targetPlayerId: task.playerId,
      kind: task.kind,
      attributeMode: task.attributeMode,
      baseModifier: task.baseModifier,
      note: task.note,
    });

    const current = quarterTasks.find((t) => t.id === task.id);
    if (!current) return;
    if (!response) {
      current.status = "ready";
      quarterTasks = [...quarterTasks];
      quarterMessage = `${task.playerName} did not answer the ${task.kind} request. You can request it again.`;
      return;
    }
    if (response.status === "declined") {
      current.status = "ready";
      quarterTasks = [...quarterTasks];
      quarterMessage = `${task.playerName} declined the ${task.kind} request.`;
      return;
    }
    current.status = "done";
    current.response = response;
    quarterTasks = [...quarterTasks];
  }

  async function completeQuarter() {
    if (!$isGM || !allQuarterTasksDone) return;

    let progress = $expedition.wilderness.progress;
    let progressMade = false;
    if (travelingThisQuarter) {
      if ($expedition.wilderness.routeMode === "Known Route") {
        progressMade = true;
      } else {
        const trail = quarterTasks.find((task) => task.kind === "Trailblaze");
        progressMade = trail?.response?.roll?.success === true;
      }
    }
    if (progressMade) progress += 1;

    const next = nextQuarter($expedition.wilderness.quarter);
    const completedLabel = `Day ${$expedition.wilderness.day} ${$expedition.wilderness.quarter}`;
    await patchWilderness({
      progress,
      quarter: next.quarter,
      day: $expedition.wilderness.day + (next.newDay ? 1 : 0),
      assignments: [],
    });

    quarterTasks = [];
    quarterPlanActive = false;
    quarterMessage = `${completedLabel} resolved. ${progressMade ? "Travel progress +1." : travelingThisQuarter ? "No travel progress." : "Company did not travel."}`;
  }

  async function playerResolve(choice?: "INT" | "STR") {
    if (playerRollBusy) return;
    playerRollBusy = true;
    try {
      await resolvePendingExpeditionRoll(choice);
    } finally {
      playerRollBusy = false;
    }
  }

  async function playerDecline() {
    if (playerRollBusy) return;
    await declinePendingExpeditionRoll();
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
            Terrain
            <select disabled={!$isGM} value={$expedition.wilderness.terrain} on:change={onTerrainChange}>
              {#each TERRAINS as terrain}<option value={terrain}>{terrain}</option>{/each}
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
        </div>

        <div class="mt-2 text-xs">
          <div class="font-bold mb-0.5">Journey</div>
          <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
            <input
              disabled={!$isGM}
              value={$expedition.wilderness.currentLocation}
              placeholder="Origin"
              aria-label="Journey origin"
              on:change={(e) => patchWilderness({ currentLocation: e.currentTarget.value })}
            />
            <i class="material-icons text-base text-gray-500">arrow_forward</i>
            <input
              disabled={!$isGM}
              value={$expedition.wilderness.destination}
              placeholder="Destination"
              aria-label="Journey destination"
              on:change={(e) => patchWilderness({ destination: e.currentTarget.value })}
            />
          </div>
        </div>

        {#if $expedition.wilderness.routeMode === "Known Route"}
          <label class="block mt-2 text-xs max-w-[180px]">
            Recorded Route Time
            <div class="flex items-center gap-1">
              <input
                type="number"
                min="0"
                disabled={!$isGM}
                value={$expedition.wilderness.routeTimeQuarters}
                on:change={(e) => patchWilderness({ routeTimeQuarters: parseInt(e.currentTarget.value) || 0 })}
              />
              <span class="text-[10px] text-gray-500 whitespace-nowrap">Quarters</span>
            </div>
          </label>
        {/if}

        <div class="mt-3">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="font-bold">Travel Phase</span>
            {#if $expedition.wilderness.routeMode === "Known Route"}
              <span>{$expedition.wilderness.progress} / {$expedition.wilderness.routeTimeQuarters || "?"} Quarters</span>
            {:else}
              <span>{$expedition.wilderness.progress} successful travel {$expedition.wilderness.progress === 1 ? "Quarter" : "Quarters"}</span>
            {/if}
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

        {#key JSON.stringify($expedition.wilderness.assignments)}
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
        {/key}

        {#if $isGM}
          <div class="mt-3 border rounded-md p-2 bg-gray-50">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold text-xs">Resolve Quarter</div>
                <div class="text-[10px] text-gray-500">
                  First resolver pass: Attribute, Wilderness Craft Rank, terrain pressure, and activity outcomes. Pace, Weather, Forced March, Events, and supply consumption come next.
                </div>
              </div>
              <button class="bg-black text-white rounded-md px-3 py-1 text-xs" on:click={planQuarterResolution}>
                {quarterPlanActive ? "Rebuild Plan" : "Resolve Quarter"}
              </button>
            </div>

            {#if quarterMessage}
              <div class="text-[10px] mt-2 border rounded px-2 py-1 bg-white">{quarterMessage}</div>
            {/if}

            {#if quarterPlanActive}
              <div class="flex flex-col gap-1 mt-2">
                {#each quarterTasks as task (task.id)}
                  <div class="border rounded-md p-2 bg-white text-xs">
                    <div class="flex items-center gap-2">
                      <span class="font-bold">{task.kind}</span>
                      <span class="text-gray-500">— {task.playerName}</span>
                      <span class="ml-auto text-[10px] uppercase">{task.status}</span>
                    </div>
                    {#if task.note}
                      <div class="text-[10px] text-gray-500 mt-0.5">{task.note}</div>
                    {/if}
                    {#if task.response?.roll}
                      <div class="mt-1">
                        {task.response.characterName}: {task.response.attribute} {task.response.target},
                        WC R{task.response.skillRank}, modifier {task.response.modifier >= 0 ? "+" : ""}{task.response.modifier},
                        {task.response.mode}.
                        <span class:font-bold={task.response.roll.success}>
                          d20 {task.response.roll.natural} → {task.response.roll.total}
                          {task.response.roll.success ? " SUCCESS" : " FAILURE"}
                        </span>
                      </div>
                      {#if task.response.outcome}
                        <div class="text-[10px] mt-0.5">{task.response.outcome}</div>
                      {/if}
                    {:else}
                      <button
                        class="mt-1 border rounded-md px-2 py-1"
                        disabled={task.status === "waiting"}
                        on:click={() => requestTaskRoll(task)}
                      >
                        {task.status === "waiting" ? "Waiting for player…" : "Request Roll"}
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>

              <button
                class="mt-2 rounded-md px-3 py-1 text-xs"
                class:bg-green-600={allQuarterTasksDone}
                class:text-white={allQuarterTasksDone}
                class:bg-gray-200={!allQuarterTasksDone}
                disabled={!allQuarterTasksDone}
                on:click={completeQuarter}
              >
                Complete {$expedition.wilderness.quarter} Quarter
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <div class="exp-cell min-h-0 overflow-y-auto">
        {#if !$isGM && $PendingExpeditionRollStore}
          <div class="border-2 border-black rounded-md p-2 mb-2 bg-gray-50">
            <div class="font-bold text-xs">GM ROLL REQUEST</div>
            <div class="text-xs mt-1">
              {$PendingExpeditionRollStore.kind}
              {#if $PendingExpeditionRollStore.note}
                <span class="text-gray-500">— {$PendingExpeditionRollStore.note}</span>
              {/if}
            </div>
            <div class="text-[10px] text-gray-500 mt-1">
              Uses your currently active Reforged character and Dice+.
            </div>
            <div class="flex flex-wrap gap-1 mt-2">
              {#if $PendingExpeditionRollStore.attributeMode === "INT_OR_STR"}
                <button class="bg-black text-white rounded-md px-2 py-1 text-xs" disabled={playerRollBusy} on:click={() => playerResolve("INT")}>
                  Roll INT
                </button>
                <button class="bg-black text-white rounded-md px-2 py-1 text-xs" disabled={playerRollBusy} on:click={() => playerResolve("STR")}>
                  Roll STR
                </button>
              {:else}
                <button class="bg-black text-white rounded-md px-2 py-1 text-xs" disabled={playerRollBusy} on:click={() => playerResolve()}>
                  {playerRollBusy ? "Rolling…" : "Roll Save"}
                </button>
              {/if}
              <button class="border rounded-md px-2 py-1 text-xs" disabled={playerRollBusy} on:click={playerDecline}>Decline</button>
            </div>
          </div>
        {/if}

        <h2>COMPANY ASSIGNMENTS</h2>
        <div class="text-[10px] text-gray-500 mb-1">
          Choose each character's Quarter Activity and optional Travel Role. Everyone defaults to Travel.
        </div>
        <div class="text-[9px] text-gray-400 mb-2">
          Owlbear party: {$PartyStore.filter((p) => p.role === "PLAYER").length}
          · Reforged clients: {$ReforgedPresenceStore.filter((p) => p.role === "PLAYER" && p.id !== $CurrentPlayerId).length}
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
