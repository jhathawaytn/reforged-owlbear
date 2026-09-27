<script lang="ts">
  import { isGM, CurrentPlayerId, CurrentPlayerName, PartyStore, ReforgedPresenceStore } from "../services/OBRHelper";
  import {
    ExpeditionStore as expedition,
    saveExpeditionState,
    type ExpeditionMode,
    type TravelQuarter,
    type RouteMode,
    type TravelPace,
    type TravelTerrain,
    type TravelClimate,
    type TravelWeatherEffect,
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
  import { rollDiceValues } from "../services/DicePlus";

  type CompanyMember = { id: string; name: string };
  type QuarterTask = {
    id: string;
    kind: ExpeditionRollKind;
    playerId: string;
    playerName: string;
    attributeMode: ExpeditionAttributeMode;
    baseModifier: number;
    useWildernessCraft: boolean;
    hasAdvantage: boolean;
    hasDisadvantage: boolean;
    applyFailureFatigue: boolean;
    note?: string;
    status: "ready" | "waiting" | "done";
    response?: ExpeditionRollResponse;
  };

  const QUARTERS: TravelQuarter[] = ["Morning", "Day", "Evening", "Night"];
  const ROUTES: RouteMode[] = ["Known Route", "Unmapped Country"];
  const PACES: TravelPace[] = ["Cautious", "Steady", "Forced"];
  const TERRAINS: TravelTerrain[] = ["Open", "Broken", "Difficult", "Severe"];
  const CLIMATES: TravelClimate[] = [
    "Cold / Winter",
    "Temperate Spring / Fall",
    "Temperate Summer",
    "Tropical",
    "Desert / Arid",
  ];
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

  let company: CompanyMember[] = [];
  let quarterTasks: QuarterTask[] = [];
  let quarterPlanActive = false;
  let quarterMessage = "";
  let dayMessage = "";
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

    // OBR.party returns the other room participants, not this client.
    // A player must still see their own Company assignment and role.
    if (!$isGM && $CurrentPlayerId) {
      merged.set($CurrentPlayerId, {
        id: $CurrentPlayerId,
        name: $CurrentPlayerName || "You",
      });
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
  $: forcedMarchFailures = quarterTasks.filter(
    (task) => task.kind === "Forced March" && task.response?.roll?.success === false,
  );
  $: allQuarterTasksDone =
    quarterPlanActive &&
    quarterTasks.every((task) => task.status === "done") &&
    forcedMarchFailures.length === 0;
  $: paceTravelTarget =
    $expedition.wilderness.pace === "Cautious"
      ? 1
      : $expedition.wilderness.pace === "Steady"
        ? 2
        : $expedition.wilderness.forcedTravelTarget;
  $: weatherReady = $expedition.wilderness.weatherRolledDay === $expedition.wilderness.day;
  $: paceReady = $expedition.wilderness.paceDeclaredDay === $expedition.wilderness.day;

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

  function weatherNextModifier(modified: number): number {
    if (modified <= 2) return -1;
    if (modified === 3) return -2;
    if (modified === 4 || modified === 5) return -1;
    if (modified <= 7) return 0;
    if (modified === 8) return 1;
    if (modified === 9) return 2;
    return 1;
  }

  function weatherDescription(climate: TravelClimate, modified: number): string {
    if (modified >= 10) return "Clear skies";
    if (modified === 9) return climate === "Desert / Arid" ? "High thin clouds" : "Scattered clouds";
    if (modified === 8) return climate === "Desert / Arid" ? "Cloudy / haze" : "Cloudy";
    if (modified >= 6) return climate === "Desert / Arid" ? "Overcast / heavy haze" : "Overcast";

    if (climate === "Cold / Winter") {
      if (modified <= 2) return "Blizzard";
      if (modified === 3) return "Heavy snow";
      if (modified === 4) return "Snow";
      return "Light snow / flurries";
    }
    if (climate === "Temperate Spring / Fall") {
      if (modified <= 2) return "Thunderstorm / Torrential Rain";
      if (modified === 3) return "Heavy rain";
      if (modified === 4) return "Rain";
      return "Light rain / drizzle";
    }
    if (climate === "Temperate Summer") {
      if (modified <= 2) return "Thunderstorm / Torrential Rain";
      if (modified === 3) return "Heavy rain";
      if (modified === 4) return "Rain / showers";
      return "Light rain / warm showers";
    }
    if (climate === "Tropical") {
      if (modified <= 2) return "Thunderstorm / Torrential Rain";
      if (modified === 3) return "Heavy rain / downpour";
      if (modified === 4) return "Rain";
      return "Light showers";
    }

    if (modified <= 2) return "Sandstorm";
    if (modified === 3) return "Dust storm";
    if (modified === 4) return "Blowing sand";
    return "Dusty wind";
  }

  function weatherEffectFor(modified: number): TravelWeatherEffect {
    if (modified <= 2) return "severe";
    if (modified === 3) return "heavy";
    return "normal";
  }

  function extremeCandidate(climate: TravelClimate): "" | "Cold Snap" | "Heat Wave" {
    if (climate === "Cold / Winter") return "Cold Snap";
    if (climate === "Temperate Summer" || climate === "Tropical" || climate === "Desert / Arid") {
      return "Heat Wave";
    }
    return "";
  }

  function weatherTravelDelay(): number {
    if ($expedition.wilderness.weatherEffect === "heavy") return 1;
    if ($expedition.wilderness.weatherEffect === "severe") return 2;
    return 0;
  }

  function weatherDisadvantages(kind: ExpeditionRollKind): boolean {
    const effect = $expedition.wilderness.weatherEffect;
    if (effect === "heavy") {
      return ["Trailblaze", "Forage for Food", "Forage for Water", "Hunt", "Fish", "Make Camp"].includes(kind);
    }
    if (effect === "severe") {
      return kind === "Trailblaze" || kind === "Make Camp";
    }
    if (effect === "cold-snap" || effect === "heat-wave") {
      return kind === "Forage for Food" || kind === "Forage for Water" || kind === "Hunt";
    }
    return false;
  }

  function weatherUnavailable(kind: ExpeditionRollKind): boolean {
    return (
      $expedition.wilderness.weatherEffect === "severe" &&
      ["Forage for Food", "Forage for Water", "Hunt", "Fish"].includes(kind)
    );
  }

  function advanceClock(q: TravelQuarter, steps: number): { quarter: TravelQuarter; daysAdvanced: number } {
    const total = quarterIndex(q) + steps;
    return {
      quarter: QUARTERS[total % QUARTERS.length],
      daysAdvanced: Math.floor(total / QUARTERS.length),
    };
  }

  async function rollWeather() {
    if (!$isGM || weatherReady) return;
    clearQuarterPlan();
    dayMessage = "";

    const priorModified = $expedition.wilderness.weatherModifiedRoll;
    const priorDay = $expedition.wilderness.weatherRolledDay;
    const priorModifier = $expedition.wilderness.weatherModifier;
    const dice = await rollDiceValues(2, 6, { rollTarget: "everyone", showResults: true });
    const natural = dice[0] + dice[1];

    let modified = natural + priorModifier;
    let weather = "";
    let nextModifier = 0;
    let effect: TravelWeatherEffect = "normal";

    if (natural === 7) {
      modified = 7;
      weather = $expedition.wilderness.climate === "Desert / Arid" ? "Overcast / heavy haze" : "Overcast";
      nextModifier = 0;
    } else {
      weather = weatherDescription($expedition.wilderness.climate, modified);
      nextModifier = weatherNextModifier(modified);
      effect = weatherEffectFor(modified);
    }

    const candidate =
      modified >= 10 &&
      priorDay === $expedition.wilderness.day - 1 &&
      priorModified >= 10
        ? extremeCandidate($expedition.wilderness.climate)
        : "";

    await patchWilderness({
      weather,
      weatherEffect: effect,
      weatherModifier: nextModifier,
      weatherNaturalRoll: natural,
      weatherModifiedRoll: modified,
      weatherRolledDay: $expedition.wilderness.day,
      weatherExtremeCandidate: candidate,
      paceDeclaredDay: 0,
    });
  }

  async function applyWeatherExtreme(kind: "Cold Snap" | "Heat Wave") {
    if (!$isGM) return;
    await patchWilderness({
      weather: kind,
      weatherEffect: kind === "Cold Snap" ? "cold-snap" : "heat-wave",
      weatherExtremeCandidate: "",
    });
  }

  async function keepClearWeather() {
    if (!$isGM) return;
    await patchWilderness({ weatherExtremeCandidate: "" });
  }

  async function applyWeatherExtremeCandidate() {
    const candidate = $expedition.wilderness.weatherExtremeCandidate;
    if (candidate === "Cold Snap" || candidate === "Heat Wave") {
      await applyWeatherExtreme(candidate);
    }
  }

  async function declarePace() {
    if (!$isGM) return;
    if (!weatherReady) {
      dayMessage = "Roll and announce today's Weather before declaring Pace.";
      return;
    }
    dayMessage = "";
    await patchWilderness({ paceDeclaredDay: $expedition.wilderness.day });
  }

  async function unlockPace() {
    if (!$isGM) return;
    clearQuarterPlan();
    await patchWilderness({ paceDeclaredDay: 0 });
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
    patchWilderness({
      pace: (e.currentTarget as HTMLSelectElement).value as TravelPace,
      paceDeclaredDay: 0,
    });
  }

  function onForcedTravelTargetChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({
      forcedTravelTarget: parseInt((e.currentTarget as HTMLSelectElement).value, 10) === 4 ? 4 : 3,
      paceDeclaredDay: 0,
    });
  }

  function onClimateChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({
      climate: (e.currentTarget as HTMLSelectElement).value as TravelClimate,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
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
    options: {
      baseModifier?: number;
      useWildernessCraft?: boolean;
      hasAdvantage?: boolean;
      hasDisadvantage?: boolean;
      applyFailureFatigue?: boolean;
      note?: string;
    } = {},
  ): QuarterTask {
    return {
      id: `${kind}:${member.id}`,
      kind,
      playerId: member.id,
      playerName: member.name,
      attributeMode,
      baseModifier: options.baseModifier ?? 0,
      useWildernessCraft: options.useWildernessCraft ?? true,
      hasAdvantage: options.hasAdvantage ?? false,
      hasDisadvantage: options.hasDisadvantage ?? false,
      applyFailureFatigue: options.applyFailureFatigue ?? false,
      note: options.note,
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

    if (travelingThisQuarter) {
      if (!weatherReady) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "Roll and announce today's Weather before resolving a travel Quarter.";
        return;
      }
      if (!paceReady) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "Declare today's Pace before resolving a travel Quarter.";
        return;
      }
      if ($expedition.wilderness.travelQuartersToday >= paceTravelTarget) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage =
          `${$expedition.wilderness.pace} Pace allows ${paceTravelTarget} travel Quarter${paceTravelTarget === 1 ? "" : "s"} today. Choose a non-Travel Activity or change the day plan.`;
        return;
      }

      const stopped = assignedCompany.filter(
        ({ member, assignment }) =>
          assignment.activity === "Travel" &&
          $expedition.wilderness.forcedMarchStoppedPlayerIds.includes(member.id),
      );
      if (stopped.length) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage =
          `${stopped.map(({ member }) => member.name).join(", ")} already failed a Forced March today and cannot travel another Quarter.`;
        return;
      }

      // The third and fourth traveling Quarters are Forced Marches.
      if ($expedition.wilderness.travelQuartersToday >= 2) {
        for (const entry of assignedCompany.filter(({ assignment }) => assignment.activity === "Travel")) {
          tasks.push(
            makeTask("Forced March", entry.member, "STR", {
              useWildernessCraft: false,
              hasDisadvantage: true,
              applyFailureFatigue: true,
              note:
                "Forced March: STR Save with Disadvantage. Failure adds 1 Fatigue and prevents another travel Quarter today.",
            }),
          );
        }
      }

      if ($expedition.wilderness.routeMode === "Unmapped Country") {
        const trailAssignment = currentAssignments.find((a) => a.role === "Trailblazer");
        const trailMember = trailAssignment ? company.find((p) => p.id === trailAssignment.playerId) : undefined;
        if (!trailAssignment || !trailMember) {
          quarterPlanActive = false;
          quarterTasks = [];
          quarterMessage = "Unmapped travel requires a connected Trailblazer before this Quarter can resolve.";
          return;
        }

        const cautiousAdvantage = $expedition.wilderness.pace === "Cautious";
        const weatherDisadvantage = weatherDisadvantages("Trailblaze");
        const delay = weatherTravelDelay();
        tasks.push(
          makeTask("Trailblaze", trailMember, "INT", {
            baseModifier: terrainPressure(),
            useWildernessCraft: true,
            hasAdvantage: cautiousAdvantage,
            hasDisadvantage: weatherDisadvantage,
            note:
              `Terrain: ${$expedition.wilderness.terrain} ${terrainPressure() ? `+${terrainPressure()}` : "+0"}.` +
              `${cautiousAdvantage ? " Cautious Pace grants Advantage." : ""}` +
              `${weatherDisadvantage ? ` ${$expedition.wilderness.weather} imposes Disadvantage.` : ""}` +
              `${delay ? ` Weather adds ${delay} Quarter${delay === 1 ? "" : "s"} of travel time.` : ""}`,
          }),
        );
      }
    }

    for (const entry of assignedCompany) {
      const activity = entry.assignment.activity;
      let kind: ExpeditionRollKind | null = null;
      let attributeMode: ExpeditionAttributeMode = "INT";

      if (activity === "Forage for Food" || activity === "Forage for Water") {
        kind = activity;
        attributeMode = "INT";
      } else if (activity === "Hunt" || activity === "Fish") {
        kind = activity;
        attributeMode = "HIGHER_INT_DEX";
      }

      if (kind) {
        if (weatherUnavailable(kind)) {
          quarterPlanActive = false;
          quarterTasks = [];
          quarterMessage =
            `${kind} is Unavailable in ${$expedition.wilderness.weather} unless a specific capability or established fiction makes it possible.`;
          return;
        }
        tasks.push(
          makeTask(kind, entry.member, attributeMode, {
            hasDisadvantage: weatherDisadvantages(kind),
            note: weatherDisadvantages(kind)
              ? `${$expedition.wilderness.weather}: this Activity is at Disadvantage.`
              : undefined,
          }),
        );
      }
    }

    const campMembers = assignedCompany.filter(({ assignment }) => assignment.activity === "Make Camp");
    if (campMembers.length > 1) {
      quarterPlanActive = false;
      quarterTasks = [];
      quarterMessage =
        "More than one character is assigned Make Camp. The rules require one leader and helpers; leave only the leader on Make Camp for this pass.";
      return;
    }
    if (campMembers.length === 1) {
      const severeNote =
        $expedition.wilderness.weatherEffect === "severe"
          ? " Severe storm conditions may make adequate camping impossible without suitable gear, capability, shelter, or established fiction."
          : "";
      tasks.push(
        makeTask("Make Camp", campMembers[0].member, "INT_OR_STR", {
          baseModifier: terrainPressure(),
          hasDisadvantage: weatherDisadvantages("Make Camp"),
          note:
            `Terrain: ${$expedition.wilderness.terrain} ${terrainPressure() ? `+${terrainPressure()}` : "+0"}.` +
            `${weatherDisadvantages("Make Camp") ? ` ${$expedition.wilderness.weather} imposes Disadvantage.` : ""}` +
            severeNote,
        }),
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
      useWildernessCraft: task.useWildernessCraft,
      hasAdvantage: task.hasAdvantage,
      hasDisadvantage: task.hasDisadvantage,
      applyFailureFatigue: task.applyFailureFatigue,
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

    if (response.kind === "Forced March" && response.roll?.success === false) {
      await patchWilderness({
        forcedMarchStoppedPlayerIds: [
          ...new Set([...$expedition.wilderness.forcedMarchStoppedPlayerIds, response.targetPlayerId]),
        ],
      });
    }
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

    const weatherDelay = travelingThisQuarter ? weatherTravelDelay() : 0;
    const clockCost = 1 + weatherDelay;
    const next = advanceClock($expedition.wilderness.quarter, clockCost);
    const completedLabel = `Day ${$expedition.wilderness.day} ${$expedition.wilderness.quarter}`;
    const travelCount = $expedition.wilderness.travelQuartersToday + (travelingThisQuarter ? 1 : 0);
    const nextDay = $expedition.wilderness.day + next.daysAdvanced;

    await patchWilderness({
      progress,
      quarter: next.quarter,
      day: nextDay,
      travelQuartersToday: next.daysAdvanced ? 0 : travelCount,
      forcedMarchStoppedPlayerIds: next.daysAdvanced ? [] : $expedition.wilderness.forcedMarchStoppedPlayerIds,
      assignments: [],
    });

    quarterTasks = [];
    quarterPlanActive = false;
    quarterMessage =
      `${completedLabel} resolved. ` +
      `${progressMade ? "Travel progress +1. " : travelingThisQuarter ? "No travel progress. " : "Company did not travel. "}` +
      `${weatherDelay ? `Weather consumed +${weatherDelay} additional Quarter${weatherDelay === 1 ? "" : "s"}. ` : ""}` +
      `${next.daysAdvanced ? `Day ${nextDay} begins; roll new Weather and declare a new Pace before further travel.` : ""}`;
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
            Terrain
            <select disabled={!$isGM} value={$expedition.wilderness.terrain} on:change={onTerrainChange}>
              {#each TERRAINS as terrain}<option value={terrain}>{terrain}</option>{/each}
            </select>
          </label>
          <label>
            Climate / Season
            <select
              disabled={!$isGM || weatherReady}
              value={$expedition.wilderness.climate}
              on:change={onClimateChange}
            >
              {#each CLIMATES as climate}<option value={climate}>{climate}</option>{/each}
            </select>
          </label>
          <div>
            <div class="font-bold">Weather</div>
            {#if weatherReady}
              <div class="border rounded px-1 py-0.5 bg-gray-50 min-h-[23px]">
                {$expedition.wilderness.weather}
              </div>
              <div class="text-[9px] text-gray-500 mt-0.5">
                2d6 {$expedition.wilderness.weatherNaturalRoll}
                {#if $expedition.wilderness.weatherModifiedRoll !== $expedition.wilderness.weatherNaturalRoll}
                  → {$expedition.wilderness.weatherModifiedRoll}
                {/if}
                · next {$expedition.wilderness.weatherModifier >= 0 ? "+" : ""}{$expedition.wilderness.weatherModifier}
              </div>
            {:else}
              <button
                class="border rounded px-2 py-1 w-full"
                disabled={!$isGM}
                on:click={rollWeather}
              >
                Roll Weather
              </button>
            {/if}
          </div>
        </div>

        <div class="mt-2 border rounded-md p-2 bg-gray-50 text-xs">
          <div class="flex flex-wrap items-end gap-2">
            <label>
              Pace
              <select
                disabled={!$isGM || paceReady}
                value={$expedition.wilderness.pace}
                on:change={onPaceChange}
              >
                {#each PACES as pace}<option value={pace}>{pace}</option>{/each}
              </select>
            </label>
            {#if $expedition.wilderness.pace === "Forced"}
              <label>
                Travel Quarters
                <select
                  disabled={!$isGM || paceReady}
                  value={$expedition.wilderness.forcedTravelTarget}
                  on:change={onForcedTravelTargetChange}
                >
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
            {/if}
            {#if $isGM}
              {#if paceReady}
                <button class="border rounded px-2 py-1" on:click={unlockPace}>Unlock Pace</button>
              {:else}
                <button
                  class="bg-black text-white rounded px-2 py-1"
                  disabled={!weatherReady}
                  on:click={declarePace}
                >
                  Declare Pace
                </button>
              {/if}
            {/if}
            <div class="ml-auto text-[10px] text-gray-600">
              {$expedition.wilderness.travelQuartersToday} / {paceTravelTarget} planned travel Quarters today
            </div>
          </div>
          <div class="text-[10px] text-gray-500 mt-1">
            Cautious: 1 Quarter, Trailblaze/Keep Watch Advantage · Steady: 2 Quarters · Forced: 3–4 Quarters; the 3rd and 4th are Forced March.
          </div>
        </div>

        {#if dayMessage}
          <div class="mt-1 text-[10px] border rounded px-2 py-1 bg-yellow-50">{dayMessage}</div>
        {/if}

        {#if $expedition.wilderness.weatherExtremeCandidate}
          <div class="mt-1 text-[10px] border rounded px-2 py-1 bg-yellow-50 flex items-center gap-2">
            <span>
              Consecutive 10+ weather: the GM may replace Clear Skies with
              {$expedition.wilderness.weatherExtremeCandidate}{ $expedition.wilderness.climate === "Tropical" ? " when the hot/dry season supports it" : ""}.
            </span>
            {#if $isGM}
              <button
                class="bg-black text-white rounded px-2 py-1 whitespace-nowrap"
                on:click={applyWeatherExtremeCandidate}
              >
                Apply
              </button>
              <button class="border rounded px-2 py-1 whitespace-nowrap" on:click={keepClearWeather}>Keep Clear</button>
            {/if}
          </div>
        {/if}

        {#if weatherReady && $expedition.wilderness.weatherEffect !== "normal"}
          <div class="mt-1 text-[10px] border rounded px-2 py-1 bg-gray-50">
            {#if $expedition.wilderness.weatherEffect === "heavy"}
              Heavy weather: each Travel Quarter costs +1 Quarter; Trailblaze, Keep Watch, Forage, Hunt, Fish, and Make Camp are at Disadvantage.
            {:else if $expedition.wilderness.weatherEffect === "severe"}
              Severe weather: each Travel Quarter usually costs +2 Quarters; Trailblaze/Keep Watch are at Disadvantage; Forage/Hunt/Fish are Unavailable; travel or Make Camp may be impossible when the fiction supports it.
            {:else if $expedition.wilderness.weatherEffect === "cold-snap"}
              Cold Snap: Forage and Hunt are at Disadvantage; Fish is Normal if usable fishable water remains accessible. Exposed travelers may suffer weather Fatigue.
            {:else}
              Heat Wave: Forage and Hunt are at Disadvantage; Fish is Normal if usable fishable water remains accessible. Treat as Extreme Heat for Water Usage.
            {/if}
          </div>
        {/if}

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
                  Pace, Weather, terrain pressure, Wilderness Craft, and Forced March are active. Wilderness Events and supply consumption come next.
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
                        {#if task.response.skillRank !== undefined}WC R{task.response.skillRank}, {/if}
                        modifier {task.response.modifier >= 0 ? "+" : ""}{task.response.modifier},
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

              {#if forcedMarchFailures.length}
                <div class="mt-2 border border-red-300 bg-red-50 rounded-md p-2 text-[10px] text-red-800">
                  Forced March failure: {forcedMarchFailures.map((task) => task.playerName).join(", ")} gained 1 Fatigue and cannot travel another Quarter today.
                  The rules require the Company to halt or continue without the failed traveler. Company splitting is not automated yet, so Quarter completion is blocked here rather than silently choosing for you.
                </div>
              {/if}

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
