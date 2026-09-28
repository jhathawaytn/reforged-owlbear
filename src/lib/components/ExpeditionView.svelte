<script lang="ts">
  import {
    isGM,
    CurrentPlayerId,
    CurrentPlayerName,
    PartyStore,
    ReforgedPresenceStore,
    type ReforgedPresence,
  } from "../services/OBRHelper";
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
    type CompanyNpc,
    type CompanyNpcKind,
  } from "../model/ExpeditionStore";
  import {
    PendingExpeditionRollStore,
    LastExpeditionRollStore,
    requestExpeditionRoll,
    resolvePendingExpeditionRoll,
    declinePendingExpeditionRoll,
    type ExpeditionRollKind,
    type ExpeditionRollResponse,
    type ExpeditionAttributeMode,
    type ExpeditionSkill,
    expeditionRollMode,
    resolveExpeditionOutcome,
  } from "../services/ExpeditionRolls";
  import { rollDiceValues, rollReforgedSave } from "../services/DicePlus";
  import { newId } from "../utils";

  type TravelWorkflowStep = "weather" | "pace" | "plan" | "resolve" | "complete";

  type CompanyMember = {
    id: string;
    name: string;
    source: "player" | "npc";
    presence?: ReforgedPresence;
    npc?: CompanyNpc;
  };
  type QuarterTask = {
    id: string;
    kind: ExpeditionRollKind;
    playerId: string;
    playerName: string;
    attributeMode: ExpeditionAttributeMode;
    baseModifier: number;
    skill?: ExpeditionSkill;
    untrainedDisadvantage: boolean;
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
  const NPC_KINDS: CompanyNpcKind[] = [
    "Guide Hireling",
    "Camp Hand Hireling",
    "Scout Henchman",
    "Professional Quartermaster",
    "Apprentice",
    "Other",
  ];
  const RANKS = [0, 1, 2, 3, 4];

  let company: CompanyMember[] = [];
  let quarterTasks: QuarterTask[] = [];
  let quarterPlanActive = false;
  let quarterMessage = "";
  let dayMessage = "";
  let watchMessage = "";
  let watchTask: QuarterTask | null = null;
  let playerRollBusy = false;
  let npcName = "";
  let npcKind: CompanyNpcKind = "Guide Hireling";
  let npcLevel = 1;
  let npcNotes = "";

  $: {
    const merged = new Map<string, CompanyMember>();
    const presenceById = new Map($ReforgedPresenceStore.map((client) => [client.id, client]));

    for (const player of $PartyStore) {
      if (player.id === $CurrentPlayerId || player.role !== "PLAYER") continue;
      const presence = presenceById.get(player.id);
      merged.set(player.id, {
        id: player.id,
        name: presence?.characterName || player.name,
        source: "player",
        presence,
      });
    }

    for (const client of $ReforgedPresenceStore) {
      if (client.id === $CurrentPlayerId || client.role !== "PLAYER") continue;
      merged.set(client.id, {
        id: client.id,
        name: client.characterName || client.name,
        source: "player",
        presence: client,
      });
    }

    if (!$isGM && $CurrentPlayerId) {
      const self = presenceById.get($CurrentPlayerId);
      merged.set($CurrentPlayerId, {
        id: $CurrentPlayerId,
        name: self?.characterName || self?.name || $CurrentPlayerName || "You",
        source: "player",
        presence: self,
      });
    }

    for (const npc of $expedition.wilderness.companyNpcs) {
      merged.set(npc.id, {
        id: npc.id,
        name: npc.name,
        source: "npc",
        npc,
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
  $: keepWatchAssignment = currentAssignments.find((a) => a.role === "Keep Watch");
  $: keepWatchMember = keepWatchAssignment
    ? company.find((member) => member.id === keepWatchAssignment.playerId)
    : undefined;
  $: quartermasterMember = $expedition.wilderness.quartermasterTodayId
    ? company.find((member) => member.id === $expedition.wilderness.quartermasterTodayId)
    : undefined;
  $: quartermasterBenefitActiveSoFar =
    !!$expedition.wilderness.quartermasterTodayId &&
    !$expedition.wilderness.quartermasterMissedToday &&
    $expedition.wilderness.quartermasterCoveredTravelQuarters === $expedition.wilderness.travelQuartersToday &&
    $expedition.wilderness.travelQuartersToday > 0;
  $: makeCampEntries = assignedCompany.filter(({ assignment }) => assignment.activity === "Make Camp");
  $: effectiveMakeCampLeaderId =
    $expedition.wilderness.makeCampLeaderId ||
    (makeCampEntries.length === 1 ? makeCampEntries[0].member.id : "");
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
  $: workflowStep = (
    !weatherReady
      ? "weather"
      : !paceReady
        ? "pace"
        : !quarterPlanActive
          ? "plan"
          : allQuarterTasksDone
            ? "complete"
            : "resolve"
  ) as TravelWorkflowStep;
  $: workflowStepNumber =
    workflowStep === "weather" ? 1 :
    workflowStep === "pace" ? 2 :
    workflowStep === "plan" ? 3 :
    workflowStep === "resolve" ? 4 : 5;

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
      return ["Trailblaze", "Keep Watch", "Forage for Food", "Forage for Water", "Hunt", "Fish", "Make Camp"].includes(kind);
    }
    if (effect === "severe") {
      return kind === "Trailblaze" || kind === "Keep Watch" || kind === "Make Camp";
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

  function memberForId(id: string): CompanyMember | undefined {
    return company.find((member) => member.id === id);
  }

  function scoutAttributes(level: number): CompanyNpc["attributes"] {
    if (level <= 2) return { STR: 10, DEX: 12, INT: 11, WIL: 10 };
    if (level <= 4) return { STR: 10, DEX: 13, INT: 12, WIL: 10 };
    if (level <= 7) return { STR: 10, DEX: 14, INT: 13, WIL: 10 };
    return { STR: 10, DEX: 15, INT: 14, WIL: 10 };
  }

  function roleEligible(member: CompanyMember, role: WildernessRole): boolean {
    if (member.source === "player") {
      if (role === "Quartermaster") return member.presence?.quartermasterQualified === true;
      return true;
    }

    const npc = member.npc;
    if (!npc) return false;
    if (role === "Trailblazer") {
      return npc.kind === "Guide Hireling" || npc.kind === "Scout Henchman" || npc.kind === "Apprentice";
    }
    if (role === "Keep Watch") {
      return npc.kind === "Scout Henchman" || npc.kind === "Apprentice";
    }
    return npc.kind === "Professional Quartermaster" || npc.quartermasterQualified;
  }

  function makeCampLeadEligible(member: CompanyMember): boolean {
    if (member.source === "player") return true;
    const npc = member.npc;
    if (!npc) return false;
    return (
      npc.kind === "Camp Hand Hireling" ||
      npc.kind === "Scout Henchman" ||
      npc.kind === "Apprentice" ||
      npc.wildernessCraftRank > 0
    );
  }

  function npcPracticedExpertise(npc: CompanyNpc, kind: ExpeditionRollKind): boolean {
    if (npc.kind === "Guide Hireling") return kind === "Trailblaze";
    if (npc.kind === "Camp Hand Hireling") return kind === "Make Camp";
    if (npc.kind === "Scout Henchman") {
      return [
        "Trailblaze",
        "Keep Watch",
        "Make Camp",
        "Forage for Food",
        "Forage for Water",
        "Hunt",
        "Fish",
      ].includes(kind);
    }
    return false;
  }

  function npcRank(npc: CompanyNpc, skill: ExpeditionSkill | undefined): number {
    if (skill === "Wilderness Craft") return npc.wildernessCraftRank;
    if (skill === "Detection") return npc.detectionRank;
    return 0;
  }

  async function addNpc() {
    if (!$isGM || !npcName.trim()) return;
    const level = Math.max(1, Math.min(10, npcLevel || 1));
    const npc: CompanyNpc = {
      id: `npc:${newId()}`,
      name: npcName.trim(),
      kind: npcKind,
      level,
      attributes: npcKind === "Scout Henchman" ? scoutAttributes(level) : { STR: 10, DEX: 10, INT: 10, WIL: 10 },
      wildernessCraftRank: 0,
      detectionRank: 0,
      quartermasterQualified: npcKind === "Professional Quartermaster",
      fatigue: 0,
      notes: npcNotes.trim(),
    };
    await patchWilderness({ companyNpcs: [...$expedition.wilderness.companyNpcs, npc] });
    npcName = "";
    npcKind = "Guide Hireling";
    npcLevel = 1;
    npcNotes = "";
  }

  async function patchNpc(id: string, patch: Partial<CompanyNpc>) {
    if (!$isGM) return;
    await patchWilderness({
      companyNpcs: $expedition.wilderness.companyNpcs.map((npc) =>
        npc.id === id ? { ...npc, ...patch } : npc,
      ),
    });
  }

  async function removeNpc(id: string) {
    if (!$isGM) return;
    clearQuarterPlan();
    await patchWilderness({
      companyNpcs: $expedition.wilderness.companyNpcs.filter((npc) => npc.id !== id),
      assignments: $expedition.wilderness.assignments.filter((assignment) => assignment.playerId !== id),
      makeCampLeaderId: $expedition.wilderness.makeCampLeaderId === id ? "" : $expedition.wilderness.makeCampLeaderId,
      quartermasterTodayId:
        $expedition.wilderness.quartermasterTodayId === id ? "" : $expedition.wilderness.quartermasterTodayId,
      forcedMarchStoppedPlayerIds: $expedition.wilderness.forcedMarchStoppedPlayerIds.filter(
        (memberId) => memberId !== id,
      ),
    });
  }

  async function onNpcLevelChange(npc: CompanyNpc, e: Event) {
    const level = Math.max(1, Math.min(10, parseInt((e.currentTarget as HTMLInputElement).value, 10) || 1));
    await patchNpc(npc.id, {
      level,
      attributes: npc.kind === "Scout Henchman" ? scoutAttributes(level) : npc.attributes,
    });
  }

  async function onNpcAttributeChange(
    npc: CompanyNpc,
    attribute: "STR" | "DEX" | "INT" | "WIL",
    e: Event,
  ) {
    const value = Math.max(1, Math.min(20, parseInt((e.currentTarget as HTMLInputElement).value, 10) || 10));
    await patchNpc(npc.id, { attributes: { ...npc.attributes, [attribute]: value } });
  }

  async function onNpcRankChange(
    npc: CompanyNpc,
    skill: "Wilderness Craft" | "Detection",
    e: Event,
  ) {
    const value = Math.max(0, Math.min(4, parseInt((e.currentTarget as HTMLSelectElement).value, 10) || 0));
    if (skill === "Wilderness Craft") await patchNpc(npc.id, { wildernessCraftRank: value });
    else await patchNpc(npc.id, { detectionRank: value });
  }

  async function onNpcQuartermasterChange(npc: CompanyNpc, e: Event) {
    await patchNpc(npc.id, { quartermasterQualified: (e.currentTarget as HTMLInputElement).checked });
  }

  function onNewNpcKindChange(e: Event) {
    npcKind = (e.currentTarget as HTMLSelectElement).value as CompanyNpcKind;
  }

  function onNewNpcLevelChange(e: Event) {
    npcLevel = Math.max(1, Math.min(10, parseInt((e.currentTarget as HTMLInputElement).value, 10) || 1));
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

  async function onActivityChange(playerId: string, e: Event) {
    if (!$isGM) return;
    clearQuarterPlan();
    const activity = (e.currentTarget as HTMLSelectElement).value as WildernessActivity;
    const current = assignmentFor(playerId);
    let role = current.role;

    if ((role === "Trailblazer" || role === "Keep Watch") && activity !== "Travel") {
      role = undefined;
    }
    if (role === "Quartermaster" && incompatibleWithQuartermaster(activity)) {
      role = undefined;
    }

    const others = $expedition.wilderness.assignments.filter((a) => a.playerId !== playerId);
    const makeCampLeaderId =
      activity !== "Make Camp" && $expedition.wilderness.makeCampLeaderId === playerId
        ? ""
        : $expedition.wilderness.makeCampLeaderId;

    await patchWilderness({
      assignments: [...others, { playerId, activity, role }],
      makeCampLeaderId,
    });
  }

  async function onRoleChange(playerId: string, e: Event) {
    if (!$isGM) return;
    clearQuarterPlan();
    const raw = (e.currentTarget as HTMLSelectElement).value;
    const role = raw ? (raw as WildernessRole) : undefined;
    const member = memberForId(playerId);
    if (role && (!member || !roleEligible(member, role))) {
      quarterMessage = `${member?.name ?? "This member"} is not eligible for ${role} under the current follower/character rules.`;
      return;
    }

    const current = assignmentFor(playerId);
    let activity = current.activity;

    if (role === "Trailblazer" || role === "Keep Watch") {
      activity = "Travel";
    } else if (role === "Quartermaster" && incompatibleWithQuartermaster(activity)) {
      activity = "Travel";
    }

    let assignments = $expedition.wilderness.assignments
      .filter((a) => a.playerId !== playerId)
      .map((a) => (role && a.role === role ? { ...a, role: undefined } : a));

    assignments = [...assignments, { playerId, activity, role }];
    await patchWilderness({ assignments });
  }

  async function setMakeCampLeader(playerId: string) {
    if (!$isGM) return;
    const member = memberForId(playerId);
    if (!member || !makeCampLeadEligible(member)) {
      quarterMessage = `${member?.name ?? "This member"} cannot lead Make Camp with their current Job/Type.`;
      return;
    }
    await patchWilderness({ makeCampLeaderId: playerId });
  }

  async function resetTravel() {
    if (!$isGM) return;

    // Reset only the current Quarter's declared setup. Do not touch the
    // expedition clock, weather, pace, progress, completed Quartermaster
    // coverage, daily Forced March state, PCs, or Company NPCs.
    clearQuarterPlan();
    watchTask = null;
    watchMessage = "";
    dayMessage = "";

    await patchWilderness({
      assignments: [],
      makeCampLeaderId: "",
    });
  }

  async function resetDay() {
    if (!$isGM) return;

    clearQuarterPlan();
    watchTask = null;
    watchMessage = "";
    dayMessage = "";

    await patchWilderness({
      day: 1,
      quarter: "Morning",
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherEffect: "normal",
      weatherNaturalRoll: 0,
      weatherModifiedRoll: 0,
      weatherRolledDay: 0,
      weatherExtremeCandidate: "",
      travelQuartersToday: 0,
      forcedMarchStoppedPlayerIds: [],
      quartermasterTodayId: "",
      quartermasterCoveredTravelQuarters: 0,
      quartermasterMissedToday: false,
      assignments: [],
      makeCampLeaderId: "",
    });
  }

  function makeTask(
    kind: ExpeditionRollKind,
    member: CompanyMember,
    attributeMode: ExpeditionAttributeMode,
    options: {
      baseModifier?: number;
      skill?: ExpeditionSkill;
      untrainedDisadvantage?: boolean;
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
      skill: options.skill,
      untrainedDisadvantage: options.untrainedDisadvantage ?? false,
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
      quarterMessage = "No Company members are available to resolve this Quarter.";
      return;
    }

    const quartermasterAssignment = currentAssignments.find((assignment) => assignment.role === "Quartermaster");
    if (quartermasterAssignment) {
      const qm = memberForId(quartermasterAssignment.playerId);
      if (!qm || !roleEligible(qm, "Quartermaster")) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "The assigned Quartermaster is not currently eligible for the role.";
        return;
      }
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

      if ($expedition.wilderness.travelQuartersToday >= 2) {
        for (const entry of assignedCompany.filter(({ assignment }) => assignment.activity === "Travel")) {
          tasks.push(
            makeTask("Forced March", entry.member, "STR", {
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
        const trailMember = trailAssignment ? memberForId(trailAssignment.playerId) : undefined;
        if (!trailAssignment || !trailMember) {
          quarterPlanActive = false;
          quarterTasks = [];
          quarterMessage = "Unmapped travel requires a Trailblazer before this Quarter can resolve.";
          return;
        }
        if (!roleEligible(trailMember, "Trailblazer")) {
          quarterPlanActive = false;
          quarterTasks = [];
          quarterMessage = `${trailMember.name} is not eligible to serve as Trailblazer.`;
          return;
        }

        const cautiousAdvantage = $expedition.wilderness.pace === "Cautious";
        const weatherDisadvantage = weatherDisadvantages("Trailblaze");
        const delay = weatherTravelDelay();
        tasks.push(
          makeTask("Trailblaze", trailMember, "INT", {
            baseModifier: terrainPressure(),
            skill: "Wilderness Craft",
            untrainedDisadvantage: true,
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
            skill: "Wilderness Craft",
            untrainedDisadvantage: true,
            hasDisadvantage: weatherDisadvantages(kind),
            note: weatherDisadvantages(kind)
              ? `${$expedition.wilderness.weather}: this Activity is at Disadvantage.`
              : undefined,
          }),
        );
      }
    }

    const campMembers = assignedCompany.filter(({ assignment }) => assignment.activity === "Make Camp");
    if (campMembers.length) {
      const leaderId =
        $expedition.wilderness.makeCampLeaderId ||
        (campMembers.length === 1 ? campMembers[0].member.id : "");
      const leader = campMembers.find(({ member }) => member.id === leaderId);

      if (!leader) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "Choose one of the Make Camp participants as the camp leader; the others will help.";
        return;
      }
      if (!makeCampLeadEligible(leader.member)) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = `${leader.member.name} cannot lead Make Camp with their current Job/Type.`;
        return;
      }

      const helperCount = Math.min(3, campMembers.length - 1);
      const helperModifier = -helperCount;
      const severeNote =
        $expedition.wilderness.weatherEffect === "severe"
          ? " Severe storm conditions may make adequate camping impossible without suitable gear, capability, shelter, or established fiction."
          : "";
      const capacityNote =
        company.length > 6
          ? ` A normal successful camp supports six travelers; this Company currently has ${company.length}.`
          : "";

      tasks.push(
        makeTask("Make Camp", leader.member, "INT_OR_STR", {
          baseModifier: terrainPressure() + helperModifier,
          skill: "Wilderness Craft",
          untrainedDisadvantage: true,
          hasDisadvantage: weatherDisadvantages("Make Camp"),
          note:
            `Terrain: ${$expedition.wilderness.terrain} ${terrainPressure() ? `+${terrainPressure()}` : "+0"}.` +
            `${helperCount ? ` ${helperCount} helper${helperCount === 1 ? "" : "s"}: ${helperModifier}.` : ""}` +
            `${weatherDisadvantages("Make Camp") ? ` ${$expedition.wilderness.weather} imposes Disadvantage.` : ""}` +
            severeNote +
            capacityNote,
        }),
      );
    }

    quarterTasks = tasks;
    quarterPlanActive = true;
    quarterMessage = tasks.length
      ? "Required Saves are ready. Player requests will be sent automatically."
      : "No Save is required for the declared Activities. The Quarter is ready to complete.";
  }

  async function beginQuarterResolution() {
    if (!$isGM) return;

    planQuarterResolution();
    await Promise.resolve();

    if (!quarterPlanActive) return;

    for (const task of [...quarterTasks]) {
      const member = memberForId(task.playerId);

      // NPC Make Camp still needs the GM to choose INT or STR.
      if (member?.source === "npc" && task.attributeMode === "INT_OR_STR") continue;

      void resolveTask(task);
    }
  }

  function setTaskState(task: QuarterTask, watch = false) {
    if (watch) watchTask = { ...task };
    else quarterTasks = [...quarterTasks];
  }

  async function resolveNpcTask(
    task: QuarterTask,
    member: CompanyMember,
    choice?: "INT" | "STR",
  ): Promise<ExpeditionRollResponse | null> {
    const npc = member.npc;
    if (!npc) return null;
    if (task.attributeMode === "INT_OR_STR" && !choice) return null;

    let attribute: "STR" | "DEX" | "INT" | "WIL";
    if (task.attributeMode === "INT") attribute = "INT";
    else if (task.attributeMode === "STR") attribute = "STR";
    else if (task.attributeMode === "HIGHER_INT_DEX") {
      attribute = npc.attributes.INT >= npc.attributes.DEX ? "INT" : "DEX";
    } else {
      attribute = choice ?? "INT";
    }

    const rank = npcRank(npc, task.skill);
    const practiced = rank === 0 && npcPracticedExpertise(npc, task.kind);
    const modifier = task.baseModifier - rank * 2 - (practiced ? 1 : 0);
    const mode = expeditionRollMode(
      task.hasAdvantage,
      task.hasDisadvantage,
      task.untrainedDisadvantage && !!task.skill && rank === 0 && !practiced,
    );
    const roll = await rollReforgedSave(npc.attributes[attribute], modifier, mode, "everyone");
    const outcome = await resolveExpeditionOutcome(task.kind, roll);

    let fatigueApplied = false;
    if (task.applyFailureFatigue && !roll.success) {
      await patchNpc(npc.id, { fatigue: npc.fatigue + 1 });
      fatigueApplied = true;
    }

    return {
      requestId: `npc:${task.id}:${Date.now()}`,
      targetPlayerId: npc.id,
      kind: task.kind,
      status: "rolled",
      playerName: "GM",
      characterName: npc.name,
      attribute,
      target: npc.attributes[attribute],
      skill: task.skill,
      skillRank: task.skill ? rank : undefined,
      modifier,
      mode,
      roll,
      outcome: outcome.text,
      boonBane: outcome.boonBane,
      fatigueApplied,
    };
  }

  async function resolveTask(
    task: QuarterTask,
    choice?: "INT" | "STR",
    watch = false,
  ) {
    if (!$isGM || task.status === "waiting") return;
    const member = memberForId(task.playerId);
    if (!member) {
      if (watch) watchMessage = `${task.playerName} is no longer present.`;
      else quarterMessage = `${task.playerName} is no longer present.`;
      return;
    }

    task.status = "waiting";
    setTaskState(task, watch);

    const response =
      member.source === "npc"
        ? await resolveNpcTask(task, member, choice)
        : await requestExpeditionRoll({
            targetPlayerId: task.playerId,
            kind: task.kind,
            attributeMode: task.attributeMode,
            baseModifier: task.baseModifier,
            skill: task.skill,
            untrainedDisadvantage: task.untrainedDisadvantage,
            hasAdvantage: task.hasAdvantage,
            hasDisadvantage: task.hasDisadvantage,
            applyFailureFatigue: task.applyFailureFatigue,
            note: task.note,
          });

    if (!response) {
      task.status = "ready";
      setTaskState(task, watch);
      const message =
        member.source === "npc"
          ? `Choose the Attribute for ${task.playerName}'s ${task.kind} roll.`
          : `${task.playerName} did not answer the ${task.kind} request. You can request it again.`;
      if (watch) watchMessage = message;
      else quarterMessage = message;
      return;
    }

    if (response.status === "declined") {
      task.status = "ready";
      setTaskState(task, watch);
      const message = `${task.playerName} declined the ${task.kind} request.`;
      if (watch) watchMessage = message;
      else quarterMessage = message;
      return;
    }

    task.status = "done";
    task.response = response;
    setTaskState(task, watch);

    if (watch) {
      watchMessage = response.outcome ?? "";
    }

    if (response.kind === "Forced March" && response.roll?.success === false) {
      await patchWilderness({
        forcedMarchStoppedPlayerIds: [
          ...new Set([...$expedition.wilderness.forcedMarchStoppedPlayerIds, response.targetPlayerId]),
        ],
      });
    }
  }

  async function triggerKeepWatch() {
    if (!$isGM) return;
    watchTask = null;
    watchMessage = "";

    if (!keepWatchMember) {
      watchMessage = "No one is on Watch. If this trigger would surprise the Company, the Company is surprised automatically.";
      return;
    }
    if (!roleEligible(keepWatchMember, "Keep Watch")) {
      watchMessage = `${keepWatchMember.name} is not eligible to serve as Keep Watch.`;
      return;
    }

    const cautiousAdvantage = $expedition.wilderness.pace === "Cautious";
    const weatherDisadvantage = weatherDisadvantages("Keep Watch");
    const task = makeTask("Keep Watch", keepWatchMember, "INT", {
      skill: "Detection",
      untrainedDisadvantage: true,
      hasAdvantage: cautiousAdvantage,
      hasDisadvantage: weatherDisadvantage,
      note:
        `${cautiousAdvantage ? "Cautious Pace grants Advantage. " : ""}` +
        `${weatherDisadvantage ? `${$expedition.wilderness.weather} imposes Disadvantage. ` : ""}` +
        "Roll only when something would otherwise surprise the Company.",
    });
    watchTask = task;
    await resolveTask(task, undefined, true);
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

    let quartermasterTodayId = $expedition.wilderness.quartermasterTodayId;
    let quartermasterCoveredTravelQuarters = $expedition.wilderness.quartermasterCoveredTravelQuarters;
    let quartermasterMissedToday = $expedition.wilderness.quartermasterMissedToday;

    if (travelingThisQuarter) {
      const assignment = currentAssignments.find((entry) => entry.role === "Quartermaster");
      const member = assignment ? memberForId(assignment.playerId) : undefined;
      if (assignment && member && roleEligible(member, "Quartermaster")) {
        if (!quartermasterTodayId) quartermasterTodayId = assignment.playerId;
        if (quartermasterTodayId === assignment.playerId) quartermasterCoveredTravelQuarters += 1;
        else quartermasterMissedToday = true;
      } else {
        quartermasterMissedToday = true;
      }
    }

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
      quartermasterTodayId: next.daysAdvanced ? "" : quartermasterTodayId,
      quartermasterCoveredTravelQuarters: next.daysAdvanced ? 0 : quartermasterCoveredTravelQuarters,
      quartermasterMissedToday: next.daysAdvanced ? false : quartermasterMissedToday,
      makeCampLeaderId: "",
      assignments: [],
    });

    quarterTasks = [];
    quarterPlanActive = false;
    watchTask = null;
    watchMessage = "";
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
          <div>
            <h2>WILDERNESS TRAVEL</h2>
            <div class="text-[10px] text-gray-500">Guided Travel Phase · dawn to dawn</div>
          </div>
          <div class="flex items-center gap-1">
            <span class="status-chip">Day {$expedition.wilderness.day}</span>
            <span class="status-chip">{$expedition.wilderness.quarter}</span>
            <span class="status-chip">{$expedition.wilderness.routeMode}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-1 mt-2 text-[10px]">
          <div class="status-box">
            <div class="status-label">Weather</div>
            <div class="font-bold">{weatherReady ? $expedition.wilderness.weather : "Not rolled"}</div>
          </div>
          <div class="status-box">
            <div class="status-label">Pace</div>
            <div class="font-bold">{paceReady ? $expedition.wilderness.pace : "Not declared"}</div>
          </div>
          <div class="status-box">
            <div class="status-label">Travel Today</div>
            <div class="font-bold">{$expedition.wilderness.travelQuartersToday} / {paceTravelTarget} Quarters</div>
          </div>
          <div class="status-box">
            <div class="status-label">Journey Progress</div>
            <div class="font-bold">
              {#if $expedition.wilderness.routeMode === "Known Route"}
                {$expedition.wilderness.progress} / {$expedition.wilderness.routeTimeQuarters || "?"}
              {:else}
                {$expedition.wilderness.progress} successful
              {/if}
            </div>
          </div>
        </div>

        <div class="workflow-card mt-2">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-[9px] uppercase tracking-wide text-gray-500">Current Step · {workflowStepNumber} of 5</div>
              {#if workflowStep === "weather"}
                <div class="font-bold text-sm">Dawn — Roll Weather</div>
              {:else if workflowStep === "pace"}
                <div class="font-bold text-sm">Dawn — Declare Pace</div>
              {:else if workflowStep === "plan"}
                <div class="font-bold text-sm">{$expedition.wilderness.quarter} — Plan Quarter</div>
              {:else if workflowStep === "resolve"}
                <div class="font-bold text-sm">{$expedition.wilderness.quarter} — Resolve Quarter</div>
              {:else}
                <div class="font-bold text-sm">{$expedition.wilderness.quarter} — Complete Quarter</div>
              {/if}
            </div>
            <div class="text-[10px] text-gray-500">
              {workflowStep === "weather" ? "Weather before Pace and Activities" :
               workflowStep === "pace" ? "One Pace for the Travel Phase" :
               workflowStep === "plan" ? "Everyone takes one Quarter Activity" :
               workflowStep === "resolve" ? "Required Saves are resolving" :
               "Advance when the Quarter is settled"}
            </div>
          </div>

          {#if workflowStep === "weather"}
            <div class="mt-2 text-xs">
              <div class="text-gray-600">Roll the persistent 2d6 weather front for Day {$expedition.wilderness.day}.</div>
              {#if $isGM}
                <button class="primary-action mt-2" on:click={rollWeather}>Roll Weather</button>
              {/if}
            </div>
          {:else if workflowStep === "pace"}
            <div class="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <label>
                Pace
                <select disabled={!$isGM} value={$expedition.wilderness.pace} on:change={onPaceChange}>
                  {#each PACES as pace}<option value={pace}>{pace}</option>{/each}
                </select>
              </label>
              {#if $expedition.wilderness.pace === "Forced"}
                <label>
                  Planned Travel Quarters
                  <select disabled={!$isGM} value={$expedition.wilderness.forcedTravelTarget} on:change={onForcedTravelTargetChange}>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </label>
              {/if}
              <div class="text-[10px] text-gray-500 flex-1 min-w-[180px]">
                Cautious: 1 Quarter · Steady: 2 Quarters · Forced: 3–4 Quarters; the 3rd and 4th are Forced March.
              </div>
              {#if $isGM}
                <button class="primary-action" on:click={declarePace}>Declare Pace</button>
              {/if}
            </div>
          {:else if workflowStep === "plan"}
            <div class="mt-2">
              <div class="text-[10px] text-gray-600 mb-1">
                Everyone defaults to Travel. Change only the characters doing something else, then confirm the Quarter.
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                {#each assignedCompany as entry (entry.member.id)}
                  <div class="border rounded px-2 py-1 text-[10px] flex items-center gap-1 bg-white">
                    <span class="font-bold truncate">{entry.member.name}</span>
                    <span class="ml-auto">{entry.assignment.activity}</span>
                    {#if entry.assignment.role}<span class="role-chip">{entry.assignment.role}</span>{/if}
                  </div>
                {/each}
              </div>
              {#if haltsForActivity}
                <div class="mt-1 text-[10px] text-red-700 font-bold">
                  Forage / Hunt / Fish halts the Company for this Quarter.
                </div>
              {/if}
              {#if $isGM}
                <button class="primary-action mt-2" on:click={beginQuarterResolution}>Confirm Quarter & Resolve</button>
              {/if}
            </div>
          {:else if workflowStep === "resolve"}
            <div class="mt-2 text-xs">
              <div class="text-[10px] text-gray-600">
                Required player roll requests were sent automatically. NPC rolls resolve on the GM client.
              </div>
              <div class="flex flex-col gap-1 mt-1">
                {#each quarterTasks as task (task.id)}
                  <div class="border rounded px-2 py-1 bg-white flex items-center gap-2">
                    <span class="font-bold">{task.kind}</span>
                    <span>— {task.playerName}</span>
                    <span class="ml-auto text-[10px] uppercase">{task.status}</span>
                    {#if task.response?.roll}
                      <span class:font-bold={task.response.roll.success}>
                        {task.response.roll.success ? "PASS" : "FAIL"}
                      </span>
                    {:else if memberForId(task.playerId)?.source === "npc" && task.attributeMode === "INT_OR_STR"}
                      <button class="border rounded px-2 py-0.5 text-[10px]" on:click={() => resolveTask(task, "INT")}>INT</button>
                      <button class="border rounded px-2 py-0.5 text-[10px]" on:click={() => resolveTask(task, "STR")}>STR</button>
                    {/if}
                  </div>
                {/each}
              </div>
              {#if quarterMessage}<div class="mt-1 text-[10px]">{quarterMessage}</div>{/if}
            </div>
          {:else}
            <div class="mt-2 text-xs">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                {#each quarterTasks as task (task.id)}
                  <div class="border rounded px-2 py-1 bg-white">
                    <span class="font-bold">{task.kind}</span> — {task.playerName}
                    {#if task.response?.roll}
                      <span class:font-bold={task.response.roll.success}>
                        · {task.response.roll.success ? "PASS" : "FAIL"}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
              {#if forcedMarchFailures.length}
                <div class="mt-2 border border-red-300 bg-red-50 rounded p-2 text-[10px] text-red-800">
                  Forced March failure: {forcedMarchFailures.map((task) => task.playerName).join(", ")} gained 1 Fatigue and cannot travel another Quarter today.
                </div>
              {/if}
              {#if $isGM}
                <button
                  class="primary-action mt-2"
                  disabled={!allQuarterTasksDone}
                  on:click={completeQuarter}
                >
                  Complete {$expedition.wilderness.quarter} Quarter
                </button>
              {/if}
            </div>
          {/if}
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
              <button class="bg-black text-white rounded px-2 py-1 whitespace-nowrap" on:click={applyWeatherExtremeCandidate}>Apply</button>
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

        <details class="mt-2 border rounded-md bg-gray-50">
          <summary class="px-2 py-1 text-xs font-bold cursor-pointer">Journey Setup & GM Tools</summary>
          <div class="p-2 pt-1 text-xs">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                <select disabled={!$isGM || weatherReady} value={$expedition.wilderness.climate} on:change={onClimateChange}>
                  {#each CLIMATES as climate}<option value={climate}>{climate}</option>{/each}
                </select>
              </label>
            </div>

            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mt-2">
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

            {#if $expedition.wilderness.routeMode === "Known Route"}
              <label class="block mt-2 max-w-[180px]">
                Recorded Route Time
                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    disabled={!$isGM}
                    value={$expedition.wilderness.routeTimeQuarters}
                    on:change={(e) => patchWilderness({ routeTimeQuarters: parseInt(e.currentTarget.value) || 0 })}
                  />
                  <span class="text-[10px] text-gray-500">Quarters</span>
                </div>
              </label>
            {/if}

            {#if $isGM}
              <div class="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                {#if paceReady}<button class="border rounded px-2 py-1 text-[10px]" on:click={unlockPace}>Unlock Pace</button>{/if}
                <button class="border border-red-300 bg-red-50 text-red-800 rounded px-2 py-1 text-[10px]" on:click={resetTravel}>Reset Travel</button>
                <button class="border border-red-300 bg-red-50 text-red-800 rounded px-2 py-1 text-[10px]" on:click={resetDay}>Reset Day</button>
              </div>
            {/if}
          </div>
        </details>

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
              <div
                class="rounded-md border px-2 py-2 text-xs text-center"
                class:bg-black={$expedition.wilderness.quarter === q}
                class:text-white={$expedition.wilderness.quarter === q}
                class:bg-gray-100={quarterIndex(q) < quarterIndex($expedition.wilderness.quarter)}
              >
                {q}
              </div>
            {/each}
          </div>
        </div>

        <div class="mt-3 border rounded-md p-2 bg-gray-50">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-xs">Quarter Plan Summary</div>
              <div class="text-[10px] text-gray-500">Edit the plan in the right-hand Company panel. Travel Roles do not consume the Travel Activity.</div>
            </div>
            {#if haltsForActivity}
              <span class="text-[10px] font-bold text-red-700">Company halts this Quarter</span>
            {/if}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-1 mt-1">
            {#each assignedCompany as entry (entry.member.id)}
              <div class="border rounded px-2 py-1 bg-white text-[10px] flex items-center gap-1">
                <span class="font-bold truncate">{entry.member.name}</span>
                <span class="ml-auto">{entry.assignment.activity}</span>
                {#if entry.assignment.role}<span class="role-chip">{entry.assignment.role}</span>{/if}
                {#if entry.assignment.activity === "Make Camp" && entry.member.id === effectiveMakeCampLeaderId}
                  <span class="role-chip">Lead</span>
                {/if}
              </div>
            {/each}
          </div>

          <details class="mt-2">
            <summary class="text-[10px] font-bold cursor-pointer">Interrupts & Role Status</summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-1 mt-1">
              <div class="border rounded-md p-2 bg-white text-[10px]">
                <div class="flex items-center gap-2">
                  <span class="font-bold">Keep Watch</span>
                  <span>{keepWatchMember?.name ?? "Unassigned"}</span>
                  {#if $isGM}
                    <button class="ml-auto border rounded px-2 py-1" on:click={triggerKeepWatch}>Trigger</button>
                  {/if}
                </div>
                {#if watchMessage}<div class="mt-1">{watchMessage}</div>{/if}
              </div>
              <div class="border rounded-md p-2 bg-white text-[10px]">
                <div class="font-bold">Quartermaster</div>
                {#if quartermasterMember}
                  <div>{quartermasterMember.name} · {$expedition.wilderness.quartermasterCoveredTravelQuarters}/{$expedition.wilderness.travelQuartersToday} travel Quarters covered</div>
                {:else}
                  <div class="text-gray-500">No daily coverage established yet.</div>
                {/if}
              </div>
            </div>
          </details>
        </div>

        {#if $isGM}
          <div class="mt-3 border rounded-md p-2 bg-gray-50">
            <details open={quarterPlanActive}>
              <summary class="font-bold text-xs cursor-pointer">Resolution Details / Retry Rolls</summary>
              <div class="text-[10px] text-gray-500 mt-1">
                Normal roll requests are sent when you confirm the Quarter. Use these controls only for retries or NPC choices.
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
                        {#if task.response.skillRank !== undefined && task.response.skill}
                          {task.response.skill} R{task.response.skillRank},
                        {/if}
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
                      {#if memberForId(task.playerId)?.source === "npc" && task.attributeMode === "INT_OR_STR"}
                        <div class="flex gap-1 mt-1">
                          <button
                            class="border rounded-md px-2 py-1"
                            disabled={task.status === "waiting"}
                            on:click={() => resolveTask(task, "INT")}
                          >
                            Roll NPC INT
                          </button>
                          <button
                            class="border rounded-md px-2 py-1"
                            disabled={task.status === "waiting"}
                            on:click={() => resolveTask(task, "STR")}
                          >
                            Roll NPC STR
                          </button>
                        </div>
                      {:else}
                        <button
                          class="mt-1 border rounded-md px-2 py-1"
                          disabled={task.status === "waiting"}
                          on:click={() => resolveTask(task)}
                        >
                          {task.status === "waiting"
                            ? memberForId(task.playerId)?.source === "npc"
                              ? "Rolling NPC…"
                              : "Waiting for player…"
                            : memberForId(task.playerId)?.source === "npc"
                              ? "Roll NPC"
                              : "Request Roll"}
                        </button>
                      {/if}
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


            {/if}
            </details>
          </div>
        {/if}
      </div>

      <div class="exp-cell min-h-0 overflow-y-auto">
        {#if !$isGM && !$PendingExpeditionRollStore && $LastExpeditionRollStore}
          <div
            class="border-2 rounded-md p-2 mb-2"
            class:border-green-600={$LastExpeditionRollStore.roll?.success === true}
            class:bg-green-50={$LastExpeditionRollStore.roll?.success === true}
            class:border-red-600={$LastExpeditionRollStore.roll?.success === false}
            class:bg-red-50={$LastExpeditionRollStore.roll?.success === false}
            class:border-gray-400={$LastExpeditionRollStore.status === "declined"}
            class:bg-gray-50={$LastExpeditionRollStore.status === "declined"}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="font-bold text-xs">LAST TRAVEL ROLL</div>
              {#if $LastExpeditionRollStore.status === "declined"}
                <div class="font-bold text-xs">DECLINED</div>
              {:else if $LastExpeditionRollStore.roll}
                <div
                  class="font-bold text-sm"
                  class:text-green-700={$LastExpeditionRollStore.roll.success}
                  class:text-red-700={!$LastExpeditionRollStore.roll.success}
                >
                  {$LastExpeditionRollStore.roll.success ? "PASS" : "FAIL"}
                </div>
              {/if}
            </div>
            <div class="text-xs mt-1">
              {$LastExpeditionRollStore.kind}
              {#if $LastExpeditionRollStore.roll}
                — d20 {$LastExpeditionRollStore.roll.natural}
                {#if $LastExpeditionRollStore.modifier}
                  {$LastExpeditionRollStore.modifier > 0 ? "+" : ""}{$LastExpeditionRollStore.modifier}
                {/if}
                = {$LastExpeditionRollStore.roll.total}
                vs {$LastExpeditionRollStore.attribute} {$LastExpeditionRollStore.target}
              {/if}
            </div>
            {#if $LastExpeditionRollStore.mode && $LastExpeditionRollStore.status === "rolled"}
              <div class="text-[10px] text-gray-500 mt-0.5">
                {$LastExpeditionRollStore.mode}
                {#if $LastExpeditionRollStore.skillRank !== undefined && $LastExpeditionRollStore.skill}
                  · {$LastExpeditionRollStore.skill} R{$LastExpeditionRollStore.skillRank}
                {/if}
              </div>
            {/if}
            {#if $LastExpeditionRollStore.outcome}
              <div class="text-[10px] mt-1">{$LastExpeditionRollStore.outcome}</div>
            {/if}
            {#if $LastExpeditionRollStore.fatigueApplied}
              <div class="text-[10px] font-bold text-red-700 mt-1">+1 Fatigue applied to your character.</div>
            {/if}
          </div>
        {/if}

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

        <h2>QUARTER PLAN</h2>
        <div class="text-[10px] text-gray-500 mb-1">
          Everyone defaults to Travel. Change only the members doing something different, then use the Current Step card to continue.
        </div>
        <div class="text-[9px] text-gray-400 mb-2">
          Owlbear party: {$PartyStore.filter((p) => p.role === "PLAYER").length}
          · Reforged clients: {$ReforgedPresenceStore.filter((p) => p.role === "PLAYER" && p.id !== $CurrentPlayerId).length}
          · NPCs: {$expedition.wilderness.companyNpcs.length}
        </div>

        {#if company.length}
          <div class="flex flex-col gap-2">
            {#each company as p (p.id)}
              {@const assignment = assignmentFor(p.id)}
              <div class="border rounded-md p-2 text-xs">
                <div class="font-bold flex items-center gap-1 mb-1">
                  <i class="material-icons text-sm">{p.source === "npc" ? "badge" : "person"}</i>
                  <span class="truncate">{p.name}</span>
                  {#if p.npc}
                    <span class="role-chip">{p.npc.kind}</span>
                    {#if p.npc.fatigue}
                      <span class="text-[9px] text-red-700">Fatigue {p.npc.fatigue}</span>
                    {/if}
                    {#if $isGM}
                      <button
                        class="ml-auto border rounded px-1 text-[10px]"
                        title="Remove Company NPC"
                        on:click={() => removeNpc(p.id)}
                      >
                        ×
                      </button>
                    {/if}
                  {/if}
                </div>

                {#if p.npc?.notes}
                  <div class="text-[9px] text-gray-500 mb-1">{p.npc.notes}</div>
                {/if}

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
                      <option value={role} disabled={!roleEligible(p, role)}>{role}</option>
                    {/each}
                  </select>
                </label>

                {#if assignment.activity === "Make Camp"}
                  <div class="mt-1 flex items-center gap-1 text-[10px]">
                    {#if p.id === effectiveMakeCampLeaderId}
                      <span class="role-chip">Camp Leader</span>
                    {/if}
                    {#if $isGM}
                      <button
                        class="border rounded px-2 py-1"
                        disabled={!makeCampLeadEligible(p)}
                        on:click={() => setMakeCampLeader(p.id)}
                      >
                        {p.id === effectiveMakeCampLeaderId ? "Leading Make Camp" : "Set as Camp Leader"}
                      </button>
                    {/if}
                  </div>
                {/if}

                {#if p.npc && $isGM}
                  <details class="mt-1">
                    <summary class="text-[10px] cursor-pointer">NPC details</summary>

                    {#if p.npc.kind === "Scout Henchman"}
                      <label class="block mt-1">
                        Level
                        <input
                          class="w-14"
                          type="number"
                          min="1"
                          max="10"
                          value={p.npc.level}
                          on:change={(e) => onNpcLevelChange(p.npc, e)}
                        />
                      </label>
                    {/if}

                    {#if p.npc.kind === "Apprentice" || p.npc.kind === "Other"}
                      <div class="grid grid-cols-4 gap-1 mt-1">
                        {#each ["STR", "DEX", "INT", "WIL"] as attr}
                          <label class="text-[9px]">
                            {attr}
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={p.npc.attributes[attr]}
                              on:change={(e) => onNpcAttributeChange(p.npc, attr, e)}
                            />
                          </label>
                        {/each}
                      </div>
                      <div class="grid grid-cols-2 gap-1 mt-1">
                        <label class="text-[9px]">
                          Wilderness Craft
                          <select
                            value={p.npc.wildernessCraftRank}
                            on:change={(e) => onNpcRankChange(p.npc, "Wilderness Craft", e)}
                          >
                            {#each RANKS as rank}<option value={rank}>R{rank}</option>{/each}
                          </select>
                        </label>
                        <label class="text-[9px]">
                          Detection
                          <select
                            value={p.npc.detectionRank}
                            on:change={(e) => onNpcRankChange(p.npc, "Detection", e)}
                          >
                            {#each RANKS as rank}<option value={rank}>R{rank}</option>{/each}
                          </select>
                        </label>
                      </div>
                      <label class="flex items-center gap-1 mt-1 text-[9px]">
                        <input
                          type="checkbox"
                          checked={p.npc.quartermasterQualified}
                          on:change={(e) => onNpcQuartermasterChange(p.npc, e)}
                        />
                        Quartermaster-qualified
                      </label>
                    {:else}
                      <div class="text-[9px] text-gray-500 mt-1">
                        STR {p.npc.attributes.STR} · DEX {p.npc.attributes.DEX} · INT {p.npc.attributes.INT} · WIL {p.npc.attributes.WIL}
                        {#if p.npc.kind === "Guide Hireling"} · Trailblaze Practiced Expertise{/if}
                        {#if p.npc.kind === "Camp Hand Hireling"} · Make Camp Practiced Expertise{/if}
                        {#if p.npc.kind === "Scout Henchman"} · Scout Practiced Expertise{/if}
                        {#if p.npc.kind === "Professional Quartermaster"} · Quartermaster specialist{/if}
                      </div>
                    {/if}
                  </details>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-xs text-gray-400">No Company members currently available.</div>
        {/if}

        {#if $isGM}
          <div class="border-t mt-3 pt-2">
            <div class="font-bold text-xs">Add Company NPC</div>
            <div class="text-[9px] text-gray-500 mb-1">
              Expedition NPCs are shared room state. Their Saves roll on the GM client through Dice+.
            </div>
            <input class="w-full text-xs" bind:value={npcName} placeholder="NPC name" />
            <div class="grid grid-cols-2 gap-1 mt-1">
              <select class="text-xs" value={npcKind} on:change={onNewNpcKindChange}>
                {#each NPC_KINDS as kind}<option value={kind}>{kind}</option>{/each}
              </select>
              {#if npcKind === "Scout Henchman"}
                <input
                  class="text-xs"
                  type="number"
                  min="1"
                  max="10"
                  value={npcLevel}
                  on:change={onNewNpcLevelChange}
                  aria-label="Scout Henchman level"
                />
              {:else}
                <div class="text-[9px] text-gray-500 flex items-center px-1">
                  {npcKind === "Guide Hireling"
                    ? "Guide: Trailblaze PE"
                    : npcKind === "Camp Hand Hireling"
                      ? "Camp Hand: Make Camp PE"
                      : npcKind === "Professional Quartermaster"
                        ? "Quartermaster specialist"
                        : "Customizable after adding"}
                </div>
              {/if}
            </div>
            <input
              class="w-full text-xs mt-1"
              bind:value={npcNotes}
              placeholder="Region / notes (Guide should name its area)"
            />
            <button
              class="mt-1 bg-black text-white rounded px-2 py-1 text-xs"
              disabled={!npcName.trim()}
              on:click={addNpc}
            >
              Add NPC
            </button>
          </div>
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

  .role-chip {
    @apply ml-auto text-[9px] px-1 rounded bg-black text-white whitespace-nowrap;
  }

  .workflow-card {
    @apply border-2 border-black rounded-lg p-3 bg-white;
  }

  .primary-action {
    @apply bg-black text-white rounded-md px-3 py-1.5 text-xs font-bold disabled:bg-gray-300 disabled:text-gray-500;
  }

  .status-chip {
    @apply border rounded px-2 py-1 text-[10px] font-bold bg-gray-50 whitespace-nowrap;
  }

  .status-box {
    @apply border rounded-md px-2 py-1 bg-gray-50 min-w-0;
  }

  .status-label {
    @apply text-[9px] uppercase tracking-wide text-gray-500;
  }

  input,
  select,
  textarea {
    @apply border rounded px-1 py-0.5 bg-white disabled:bg-gray-100 disabled:text-gray-500;
  }
</style>
