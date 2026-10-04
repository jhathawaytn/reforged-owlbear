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
    type ExplorationActiveLight,
    type ExplorationFormationRow,
    type ExplorationMovementMode,
    type ExplorationActivity,
    type ExplorationActivityAssignment,
    type DungeonCampMeal,
    type DungeonCampResult,
    type ExpeditionAssignment,
    type WildernessActivity,
    type WildernessRole,
    type CompanyNpc,
    type CompanyNpcKind,
    type RestQuality,
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
  import { PlayerCharacterStore as localPc } from "../model/ReforgedCharacter";
  import type { Attribute, GearItem } from "../types";
  import { ATTRIBUTES } from "../types";
  import { lostAttributes } from "../services/RestRecovery";
  import {
    PendingExpeditionDailyStore,
    LastExpeditionDailyStore,
    requestExpeditionDaily,
    resolvePendingConsumption,
    resolvePendingRest,
    applyDayCloseout,
    type ExpeditionDailyResponse,
  } from "../services/ExpeditionDaily";
  import {
    ExplorationLightDeclarationStore,
    declareExplorationLight,
    requestExplorationLightCheck,
    lightReach,
    isLantern,
    type ExplorationLightMode,
    type ExplorationLightDeclaration,
  } from "../services/ExplorationLight";
  import { newId } from "../utils";

  type TravelWorkflowStep =
    | "climate"
    | "terrain"
    | "route"
    | "weather"
    | "pace"
    | "plan"
    | "resolve"
    | "complete";

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
    "Stand Watch",
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
  const EXPLORATION_MOVEMENT: ExplorationMovementMode[] = [
    "New / Unsecured",
    "Explored",
    "Rush",
  ];
  const EXPLORATION_ACTIVITIES: ExplorationActivity[] = [
    "None",
    "Focused Search",
    "Focused Listening",
    "Dedicated Watch",
    "Technical / Security Work",
    "Force / Haul",
    "Operate Mechanism",
    "Other",
  ];
  const RUSH_INCOMPATIBLE_ACTIVITIES: ExplorationActivity[] = [
    "Focused Search",
    "Focused Listening",
    "Dedicated Watch",
  ];
  const DUNGEON_CAMP_MEALS: DungeonCampMeal[] = ["None", "Simple", "Fancy"];

  let company: CompanyMember[] = [];
  let quarterTasks: QuarterTask[] = [];
  let quarterPlanActive = false;
  let quarterMessage = "";
  let dayMessage = "";
  let watchMessage = "";
  let watchTask: QuarterTask | null = null;
  let playerRollBusy = false;
  let dailyBusy = false;
  let rationChoice = "";
  let waterChoice = "";
  let restAttributeChoice: Attribute = "STR";
  let manualRestQuality: RestQuality = "Perilous";
  const pendingConsumptionIds = new Set<string>();
  const pendingRestIds = new Set<string>();
  let npcName = "";
  let npcKind: CompanyNpcKind = "Guide Hireling";
  let npcLevel = 1;
  let npcNotes = "";
  let eventConspicuous = false;
  let selectedLightSourceId = "";
  let selectedLampOilId = "";
  let selectedLightMode: ExplorationLightMode = "open";
  let lastLightDeclarationNonce = "";
  let explorationMessage = "";

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
  $: keepWatchAssignment = currentAssignments.find(
    (a) => a.role === "Keep Watch" && a.activity === "Travel",
  );
  $: keepWatchMember = keepWatchAssignment
    ? company.find((member) => member.id === keepWatchAssignment.playerId)
    : undefined;
  $: standWatchAssignment = currentAssignments.find((a) => a.activity === "Stand Watch");
  $: standWatchMember = standWatchAssignment
    ? company.find((member) => member.id === standWatchAssignment.playerId)
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
  $: mixedTravelPlan =
    !haltsForActivity &&
    assignedCompany.some(({ assignment }) => assignment.activity === "Travel") &&
    assignedCompany.some(({ assignment }) =>
      ["Make Camp", "Stand Watch", "Sleep", "Other"].includes(assignment.activity),
    );
  $: activeWatchMember = travelingThisQuarter ? keepWatchMember : standWatchMember;
  $: activeWatchMode = travelingThisQuarter
    ? keepWatchMember
      ? "Travel Keep Watch"
      : ""
    : standWatchMember
      ? "Camp Stand Watch"
      : "";
  $: playerMembers = company.filter((member) => member.source === "player");
  $: sleeperEntries = assignedCompany.filter(({ assignment }) => assignment.activity === "Sleep");
  $: playerSleeperIds = sleeperEntries
    .filter(({ member }) => member.source === "player")
    .map(({ member }) => member.id);
  $: npcSleeperIds = sleeperEntries
    .filter(({ member }) => member.source === "npc")
    .map(({ member }) => member.id);
  $: restQualityReady =
    $expedition.wilderness.campRestQualityDay === $expedition.wilderness.day &&
    !!$expedition.wilderness.campRestQuality;
  $: quarterRequiresConsumption =
    (makeCampEntries.length > 0 ||
      (quarterIndex($expedition.wilderness.quarter) >= quarterIndex("Evening") && !travelingThisQuarter)) &&
    (!dailyConsumptionReady || !extraWaterReady);
  $: dailyConsumptionReady = playerMembers.every((member) =>
    $expedition.wilderness.consumptionResolvedPlayerIds.includes(member.id),
  );
  $: extraWaterReady = playerMembers.every((member) => {
    const heatExtra = $expedition.wilderness.weatherEffect === "heat-wave" ? 2 : 0;
    const required =
      ($expedition.wilderness.forcedMarchAttemptsByPlayer[member.id] ?? 0) + heatExtra;
    const resolved = $expedition.wilderness.extraWaterRollsResolvedByPlayer[member.id] ?? 0;
    return resolved >= required;
  });
  $: sleepersResolved = playerSleeperIds.every((id) =>
    $expedition.wilderness.sleptPlayerIdsToday.includes(id),
  ) && npcSleeperIds.every((id) =>
    $expedition.wilderness.sleptPlayerIdsToday.includes(id),
  );
  $: unresolvedConsumptionMembers = playerMembers.filter((member) => {
    const ordinaryMissing =
      !$expedition.wilderness.consumptionResolvedPlayerIds.includes(member.id);
    const extraMissing = unresolvedExtraWaterRolls(member.id) > 0;
    return ordinaryMissing || extraMissing;
  });
  $: unresolvedSleepMembers = sleeperEntries.filter(
    ({ member }) => !$expedition.wilderness.sleptPlayerIdsToday.includes(member.id),
  );
  $: quarterRollsDone =
    quarterPlanActive && quarterTasks.every((task) => task.status === "done");
  $: forcedMarchFailures = quarterTasks.filter(
    (task) => task.kind === "Forced March" && task.response?.roll?.success === false,
  );
  $: allQuarterTasksDone =
    quarterPlanActive &&
    quarterTasks.every((task) => task.status === "done") &&
    forcedMarchFailures.length === 0 &&
    (!quarterRequiresConsumption || (dailyConsumptionReady && extraWaterReady)) &&
    (!sleeperEntries.length || (restQualityReady && sleepersResolved));
  $: paceTravelTarget =
    $expedition.wilderness.pace === "Cautious"
      ? 1
      : $expedition.wilderness.pace === "Steady"
        ? 2
        : $expedition.wilderness.forcedTravelTarget;
  $: climateReady = $expedition.wilderness.climateLocked;
  $: terrainReady = $expedition.wilderness.terrainConfirmedDay === $expedition.wilderness.day;
  $: routeReady = $expedition.wilderness.routeConfirmedDay === $expedition.wilderness.day;
  $: weatherReady = $expedition.wilderness.weatherRolledDay === $expedition.wilderness.day;
  $: paceReady = $expedition.wilderness.paceDeclaredDay === $expedition.wilderness.day;
  $: knownRouteComplete =
    $expedition.wilderness.routeMode === "Known Route" &&
    $expedition.wilderness.routeTimeQuarters > 0 &&
    $expedition.wilderness.progress >= $expedition.wilderness.routeTimeQuarters;
  $: arrivalCanBeRecorded =
    $expedition.wilderness.destination.trim().length > 0 &&
    ($expedition.wilderness.routeMode === "Unmapped Country" || knownRouteComplete);
  $: unmappedEventDue =
    $expedition.wilderness.routeMode === "Unmapped Country" &&
    $expedition.wilderness.wildernessEventCheckedDay !== $expedition.wilderness.day;
  $: knownRouteBaseEventRange =
    $expedition.wilderness.routeTimeQuarters <= 0
      ? { min: 0, max: 0 }
      : $expedition.wilderness.routeTimeQuarters <= 2
        ? { min: 0, max: 1 }
        : $expedition.wilderness.routeTimeQuarters <= 7
          ? { min: 1, max: 2 }
          : { min: 2, max: 3 };
  $: knownRouteEventMin = Math.max(
    0,
    knownRouteBaseEventRange.min +
      ($expedition.wilderness.knownRouteDangerous ? 1 : 0) -
      ($expedition.wilderness.knownRouteCautiousCommitment ? 1 : 0),
  );
  $: knownRouteEventMax = Math.max(
    0,
    knownRouteBaseEventRange.max +
      ($expedition.wilderness.knownRouteDangerous ? 1 : 0) -
      ($expedition.wilderness.knownRouteCautiousCommitment ? 1 : 0),
  );
  $: knownRouteEventsRemaining =
    $expedition.wilderness.knownRouteEventBudget < 0
      ? 0
      : Math.max(
          0,
          $expedition.wilderness.knownRouteEventBudget -
            $expedition.wilderness.knownRouteEventsResolved,
        );
  $: workflowStep = (
    !climateReady
      ? "climate"
      : !terrainReady
        ? "terrain"
        : !routeReady
          ? "route"
          : !weatherReady
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
    workflowStep === "climate" ? 1 :
    workflowStep === "terrain" ? 2 :
    workflowStep === "route" ? 3 :
    workflowStep === "weather" ? 4 :
    workflowStep === "pace" ? 5 :
    workflowStep === "plan" ? 6 :
    workflowStep === "resolve" ? 7 : 8;

  $: localRationItems = $localPc.gear.filter(
    (item) => item.usageKind === "Rations" && item.usageDie && item.usageDie !== "depleted",
  );
  $: localWaterItems = $localPc.gear.filter(
    (item) => item.usageKind === "Water" && item.usageDie && item.usageDie !== "depleted",
  );
  $: localLightSources = $localPc.gear.filter(
    (item) =>
      (item.name === "Torch Bundle" && item.usageDie && item.usageDie !== "depleted") ||
      ["Lantern", "Hooded Lantern", "Bullseye Lantern"].includes(item.name),
  );
  $: localLampOil = $localPc.gear.filter(
    (item) => item.name === "Lamp Oil" && item.usageDie && item.usageDie !== "depleted",
  );
  $: selectedLightSource =
    localLightSources.find((item) => item.id === selectedLightSourceId) ??
    localLightSources[0];
  $: selectedLampOil =
    localLampOil.find((item) => item.id === selectedLampOilId) ??
    localLampOil[0];
  $: if (selectedLightSource?.name !== "Hooded Lantern" && selectedLightMode !== "open") {
    selectedLightMode = "open";
  }
  $: explorationHour = Math.floor(($expedition.exploration.turn - 1) / 6) + 1;
  $: explorationTurnInHour = (($expedition.exploration.turn - 1) % 6) + 1;
  $: dungeonEventDue =
    $expedition.exploration.dungeonEventCheckedHour !== explorationHour;
  $: localActiveLights = $expedition.exploration.activeLights.filter(
    (light) => light.ownerId === $CurrentPlayerId && light.active,
  );
  $: formationIds = $expedition.exploration.formationRows.flatMap((row) =>
    [row.leftId, row.rightId].filter(Boolean),
  );
  $: formationHasDuplicates = new Set(formationIds).size !== formationIds.length;
  $: movementAreaLimit =
    $expedition.exploration.movementMode === "New / Unsecured"
      ? 1
      : $expedition.exploration.movementMode === "Explored"
        ? 2
        : 4;
  $: explorationActivityConflicts = $expedition.exploration.activityAssignments.filter(
    (assignment) =>
      $expedition.exploration.movementMode === "Rush" &&
      RUSH_INCOMPATIBLE_ACTIVITIES.includes(assignment.activity),
  );
  $: localLostAttributes = lostAttributes($localPc);
  let preparedDailyRequestId = "";
  $: if ($PendingExpeditionDailyStore && $PendingExpeditionDailyStore.requestId !== preparedDailyRequestId) {
    preparedDailyRequestId = $PendingExpeditionDailyStore.requestId;
    dailyBusy = false;
    if ($PendingExpeditionDailyStore.kind === "Consumption") {
      rationChoice = $PendingExpeditionDailyStore.ordinaryRequired
        ? localRationItems[0]?.id ?? "none"
        : "none";
      waterChoice =
        ($PendingExpeditionDailyStore.ordinaryRequired || $PendingExpeditionDailyStore.extraWaterRolls > 0)
          ? localWaterItems[0]?.id ?? "none"
          : "none";
    } else if (
      $PendingExpeditionDailyStore.quality === "Comfortable" &&
      localLostAttributes.length
    ) {
      restAttributeChoice = localLostAttributes[0];
    }
  }
  $: if (
    $PendingExpeditionDailyStore?.kind === "Rest" &&
    $PendingExpeditionDailyStore.quality === "Comfortable" &&
    localLostAttributes.length &&
    !localLostAttributes.includes(restAttributeChoice)
  ) {
    restAttributeChoice = localLostAttributes[0];
  }

  async function handleLightDeclaration(
    declaration: ExplorationLightDeclaration,
  ) {
    if (!$isGM) return;
    const lights = [...$expedition.exploration.activeLights];
    const index = lights.findIndex(
      (light) =>
        light.ownerId === declaration.ownerId &&
        light.sourceItemId === declaration.sourceItemId,
    );

    if (declaration.action === "extinguish") {
      if (index >= 0) {
        lights[index] = {
          ...lights[index],
          fuelDie: declaration.fuelDie,
          active: false,
        };
        await patchExploration({ activeLights: lights });
      }
      return;
    }

    const existing = index >= 0 ? lights[index] : undefined;
    const continuingSameBurn =
      !!existing?.active &&
      existing.fuelItemId === declaration.fuelItemId;

    const next: ExplorationActiveLight = {
      ownerId: declaration.ownerId,
      ownerName: declaration.ownerName,
      sourceItemId: declaration.sourceItemId,
      sourceName: declaration.sourceName,
      fuelItemId: declaration.fuelItemId,
      fuelName: declaration.fuelName,
      fuelDie: declaration.fuelDie,
      mode: declaration.mode,
      reachFeet: declaration.reachFeet,
      active: true,
      lastCheckTurn: continuingSameBurn ? existing?.lastCheckTurn ?? 0 : 0,
      burnTurns: continuingSameBurn ? existing?.burnTurns ?? 0 : 0,
    };
    if (index >= 0) lights[index] = next;
    else lights.push(next);
    await patchExploration({ activeLights: lights });
  }

  $: if (
    $isGM &&
    $ExplorationLightDeclarationStore &&
    $ExplorationLightDeclarationStore.nonce !== lastLightDeclarationNonce
  ) {
    lastLightDeclarationNonce = $ExplorationLightDeclarationStore.nonce;
    void handleLightDeclaration($ExplorationLightDeclarationStore);
  }

  async function activateLocalLight() {
    const source = selectedLightSource;
    if (!source) return;

    let fuel: GearItem | undefined;
    if (source.name === "Torch Bundle") fuel = source;
    else if (isLantern(source.name)) fuel = selectedLampOil;
    if (!fuel?.usageDie || fuel.usageDie === "depleted") {
      explorationMessage =
        source.name === "Torch Bundle"
          ? "No usable Torch Bundle stock."
          : "A burning lantern needs an active Lamp Oil stock.";
      return;
    }

    const mode: ExplorationLightMode =
      source.name === "Hooded Lantern" ? selectedLightMode : "open";
    await declareExplorationLight({
      action: "upsert",
      sourceItemId: source.id,
      sourceName: source.name,
      fuelItemId: fuel.id,
      fuelName: fuel.name,
      fuelDie: fuel.usageDie,
      mode,
      reachFeet: lightReach(source.name, mode),
    });
    explorationMessage = `${source.name} declared active.`;
  }

  async function extinguishLocalLight(light: ExplorationActiveLight) {
    await declareExplorationLight({
      action: "extinguish",
      sourceItemId: light.sourceItemId,
      sourceName: light.sourceName,
      fuelItemId: light.fuelItemId,
      fuelName: light.fuelName,
      fuelDie: light.fuelDie,
      mode: light.mode,
      reachFeet: light.reachFeet,
    });
    explorationMessage = `${light.sourceName} extinguished; ${light.fuelName} steps down one die.`;
  }

  async function setExplorationActivityFor(
    member: CompanyMember,
    activity: ExplorationActivity,
    detail?: string,
  ) {
    if (!$isGM) return;
    const assignments = [...$expedition.exploration.activityAssignments];
    const index = assignments.findIndex(
      (assignment) => assignment.playerId === member.id,
    );
    const existing = index >= 0 ? assignments[index] : undefined;
    const next: ExplorationActivityAssignment = {
      playerId: member.id,
      playerName: member.name,
      activity,
      detail: detail ?? existing?.detail ?? "",
    };
    if (index >= 0) assignments[index] = next;
    else assignments.push(next);
    await patchExploration({ activityAssignments: assignments });
  }

  function onExplorationActivityChange(member: CompanyMember, event: Event) {
    void setExplorationActivityFor(
      member,
      (event.currentTarget as HTMLSelectElement).value as ExplorationActivity,
    );
  }

  function onExplorationActivityDetailChange(member: CompanyMember, event: Event) {
    void setExplorationActivityFor(
      member,
      $expedition.exploration.activityAssignments.find(
        (assignment) => assignment.playerId === member.id,
      )?.activity ?? "None",
      (event.currentTarget as HTMLInputElement).value,
    );
  }

  async function addFormationRow() {
    if (!$isGM) return;
    await patchExploration({
      formationRows: [
        ...$expedition.exploration.formationRows,
        { leftId: "", rightId: "" },
      ],
    });
  }

  async function removeFormationRow(index: number) {
    if (!$isGM) return;
    await patchExploration({
      formationRows: $expedition.exploration.formationRows.filter((_, i) => i !== index),
    });
  }

  async function setFormationMember(
    index: number,
    side: keyof ExplorationFormationRow,
    memberId: string,
  ) {
    if (!$isGM) return;
    const rows = $expedition.exploration.formationRows.map((row, i) =>
      i === index ? { ...row, [side]: memberId } : row,
    );
    await patchExploration({ formationRows: rows });
  }

  async function setExplorationMovement(mode: ExplorationMovementMode) {
    if (!$isGM) return;
    await patchExploration({ movementMode: mode });
  }

  function onExplorationMovementChange(event: Event) {
    void setExplorationMovement(
      (event.currentTarget as HTMLSelectElement).value as ExplorationMovementMode,
    );
  }

  async function setDungeonCampEstablished(established: boolean) {
    if (!$isGM) return;
    await patchExploration({
      dungeonCampEstablished: established,
      dungeonCampNaturalRoll: 0,
      dungeonCampModifiedRoll: 0,
      dungeonCampResult: "",
      dungeonCampResultHour: 0,
    });
  }

  async function toggleDungeonCampWatcher(memberId: string) {
    if (!$isGM) return;
    const current = $expedition.exploration.dungeonCampWatchIds;
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    await patchExploration({ dungeonCampWatchIds: next });
  }

  async function setDungeonCampPrepNotes(notes: string) {
    if (!$isGM) return;
    await patchExploration({ dungeonCampPrepNotes: notes });
  }

  async function rollDungeonCamp() {
    if (!$isGM) return;
    if (!$expedition.exploration.dungeonCampEstablished) {
      explorationMessage = "Establish the dungeon camp before rolling.";
      return;
    }
    const [natural] = await rollDiceValues(1, 20, {
      rollTarget: "gm_only",
      showResults: true,
    });
    const modifier =
      $expedition.exploration.dungeonCampMeal === "Fancy"
        ? -2
        : $expedition.exploration.dungeonCampMeal === "Simple"
          ? -1
          : 0;
    const modified = natural + modifier;
    let result: DungeonCampResult;
    if (natural === 20) result = "Camp Disaster";
    else if (modified <= 13) result = "Quiet Night";
    else result = "Rough Night";

    let resultHour = 0;
    if (result !== "Quiet Night") {
      [resultHour] = await rollDiceValues(1, 6, {
        rollTarget: "gm_only",
        showResults: true,
      });
    }

    await patchExploration({
      dungeonCampNaturalRoll: natural,
      dungeonCampModifiedRoll: modified,
      dungeonCampResult: result,
      dungeonCampResultHour: resultHour,
    });
  }

  async function setDungeonCampMeal(meal: DungeonCampMeal) {
    if (!$isGM) return;
    await patchExploration({
      dungeonCampMeal: meal,
      dungeonCampNaturalRoll: 0,
      dungeonCampModifiedRoll: 0,
      dungeonCampResult: "",
      dungeonCampResultHour: 0,
    });
  }

  function onDungeonCampMealChange(event: Event) {
    void setDungeonCampMeal(
      (event.currentTarget as HTMLSelectElement).value as DungeonCampMeal,
    );
  }

  async function completeSleepQuarter() {
    if (!$isGM) return;
    if (!$expedition.exploration.dungeonCampResult) {
      explorationMessage = "Roll the Dungeon Camp result before completing Sleep.";
      return;
    }
    if ($expedition.exploration.dungeonCampResult === "Camp Disaster") {
      explorationMessage =
        "Camp Disaster interrupts Sleep. Resolve the danger and re-establish a viable camp before completing a Sleep Quarter.";
      return;
    }

    const nextTurn = $expedition.exploration.turn + 36;
    await patchExploration({
      turn: nextTurn,
      activityAssignments: [],
      dungeonCampEstablished: false,
      dungeonCampWatchIds: [],
      dungeonCampPrepNotes: "",
      dungeonCampMeal: "None",
      dungeonCampNaturalRoll: 0,
      dungeonCampModifiedRoll: 0,
      dungeonCampResult: "",
      dungeonCampResultHour: 0,
      dungeonEventCheckedHour: Math.floor((nextTurn - 1) / 6) + 1,
    });
    explorationMessage =
      "Sleep Quarter completed: 6 hours elapsed (36 Exploration Turns). Daily clocks and resource requirements continue.";
  }

  async function markDungeonEventChecked() {
    if (!$isGM) return;
    await patchExploration({ dungeonEventCheckedHour: explorationHour });
  }

  async function completeExplorationTurn() {
    if (!$isGM) return;
    explorationMessage = "";
    let lights = $expedition.exploration.activeLights.map((light) => ({ ...light }));

    for (let index = 0; index < lights.length; index += 1) {
      const light = lights[index];
      if (!light.active) continue;

      const burnTurns = (light.burnTurns ?? 0) + 1;
      let nextLight: ExplorationActiveLight = {
        ...light,
        burnTurns,
      };

      if (burnTurns % 3 === 0) {
        const response = await requestExplorationLightCheck(
          light.ownerId,
          light.sourceItemId,
          light.fuelItemId,
        );
        if (!response) {
          explorationMessage +=
            `${light.ownerName}'s ${light.sourceName} did not answer its light Usage check. `;
        } else {
          nextLight = {
            ...nextLight,
            fuelDie: response.after,
            active: !response.exhausted,
            lastCheckTurn: $expedition.exploration.turn,
          };
          explorationMessage += response.exhausted
            ? `${light.ownerName}'s ${light.sourceName} exhausted ${response.fuelName} and went out. `
            : `${light.ownerName}'s ${light.sourceName}: ${response.before} rolled ${response.roll}, now ${response.after}. `;
        }
      }

      if (light.sourceName === "Torch Bundle" && burnTurns >= 6) {
        nextLight = { ...nextLight, active: false };
        explorationMessage +=
          `${light.ownerName}'s torch reached 6 Turns and went out. `;
      }

      lights[index] = nextLight;
    }

    await patchExploration({
      turn: $expedition.exploration.turn + 1,
      activeLights: lights,
      activityAssignments: [],
    });
  }

  async function exitExplorationLocation() {
    if (!$isGM) return;
    await saveExpeditionState({
      ...$expedition,
      mode: "wilderness",
      exploration: {
        ...$expedition.exploration,
        turn: 1,
        siteName: "",
        siteArea: "",
        activeLights: [],
        dungeonEventCheckedHour: 0,
        formationRows: [],
        movementMode: "New / Unsecured",
        activityAssignments: [],
        dungeonCampEstablished: false,
        dungeonCampWatchIds: [],
        dungeonCampPrepNotes: "",
        dungeonCampMeal: "None",
        dungeonCampNaturalRoll: 0,
        dungeonCampModifiedRoll: 0,
        dungeonCampResult: "",
        dungeonCampResultHour: 0,
      },
    });
  }

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
    if (!climateReady || !terrainReady || !routeReady) {
      dayMessage = "Confirm Climate, Terrain, and Route before rolling Weather.";
      return;
    }
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

  function defaultActivityForQuarter(q: TravelQuarter): WildernessActivity | null {
    if (q === "Morning" || q === "Day") return "Travel";
    if (q === "Evening") return "Sleep";
    return null;
  }

  function assignmentsForQuarter(q: TravelQuarter): ExpeditionAssignment[] {
    const activity = defaultActivityForQuarter(q);
    if (!activity) return $expedition.wilderness.assignments;

    return company.map((member) => {
      const current = assignmentFor(member.id);
      return { ...current, playerId: member.id, activity };
    });
  }

  function resetKnownRouteEventState() {
    return {
      knownRouteEventBudget: -1,
      knownRouteEventsResolved: 0,
      knownRouteDangerous: false,
      knownRouteCautiousCommitment: false,
    };
  }

  function onRouteChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({
      routeMode: (e.currentTarget as HTMLSelectElement).value as RouteMode,
      routeConfirmedDay: 0,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
      ...resetKnownRouteEventState(),
    });
  }

  async function confirmRoute() {
    if (!$isGM || !terrainReady) return;
    clearQuarterPlan();
    await patchWilderness({
      routeConfirmedDay: $expedition.wilderness.day,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
  }

  function onDestinationChange(e: Event) {
    clearQuarterPlan();
    const destination = (e.currentTarget as HTMLInputElement).value;
    const startingNewLeg =
      !$expedition.wilderness.destination.trim() &&
      destination.trim().length > 0 &&
      $expedition.wilderness.progress === 0;
    patchWilderness({
      destination,
      ...(startingNewLeg ? resetKnownRouteEventState() : {}),
    });
  }

  function onRouteTimeChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({
      routeTimeQuarters: parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0,
      ...resetKnownRouteEventState(),
    });
  }

  async function checkUnmappedWildernessEvent(markExternal = false) {
    if (!$isGM || $expedition.wilderness.routeMode !== "Unmapped Country") return;
    const dieSides = eventConspicuous ? 4 : $expedition.wilderness.pace === "Cautious" ? 8 : 6;
    const roll = markExternal ? 0 : (await rollDiceValues(1, dieSides, { rollTarget: "gm_only", showResults: true }))[0];

    await patchWilderness({
      wildernessEventCheckedDay: $expedition.wilderness.day,
      wildernessEventLastDie: markExternal ? 0 : dieSides,
      wildernessEventLastRoll: roll,
      wildernessEventOccurred: markExternal ? false : roll === 1,
    });
  }

  async function setKnownRouteEventBudget(value: number) {
    if (!$isGM || $expedition.wilderness.routeMode !== "Known Route") return;
    const budget = Number.isFinite(value) ? Math.max(0, Math.min(99, value)) : -1;
    await patchWilderness({
      knownRouteEventBudget: budget,
      knownRouteEventsResolved: Math.min($expedition.wilderness.knownRouteEventsResolved, budget),
    });
  }

  async function resolveKnownRouteEvent() {
    if (
      !$isGM ||
      $expedition.wilderness.knownRouteEventBudget < 0 ||
      knownRouteEventsRemaining <= 0
    ) return;
    await patchWilderness({
      knownRouteEventsResolved: $expedition.wilderness.knownRouteEventsResolved + 1,
    });
  }

  async function setKnownRouteDangerous(value: boolean) {
    if (!$isGM) return;
    await patchWilderness({
      knownRouteDangerous: value,
      knownRouteEventBudget: -1,
      knownRouteEventsResolved: 0,
    });
  }

  async function setKnownRouteCautiousCommitment(value: boolean) {
    if (!$isGM) return;
    await patchWilderness({
      knownRouteCautiousCommitment: value,
      knownRouteEventBudget: -1,
      knownRouteEventsResolved: 0,
    });
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
    if ($expedition.wilderness.climateLocked) return;
    clearQuarterPlan();
    patchWilderness({
      climate: (e.currentTarget as HTMLSelectElement).value as TravelClimate,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
  }

  async function lockClimate() {
    if (!$isGM) return;
    clearQuarterPlan();
    await patchWilderness({
      climateLocked: true,
      terrainConfirmedDay: 0,
      routeConfirmedDay: 0,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
  }

  async function unlockClimate() {
    if (!$isGM) return;
    clearQuarterPlan();
    await patchWilderness({
      climateLocked: false,
      terrainConfirmedDay: 0,
      routeConfirmedDay: 0,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
  }

  function onTerrainChange(e: Event) {
    clearQuarterPlan();
    patchWilderness({
      terrain: (e.currentTarget as HTMLSelectElement).value as TravelTerrain,
      terrainConfirmedDay: 0,
      routeConfirmedDay: 0,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
  }

  async function confirmTerrain() {
    if (!$isGM || !climateReady) return;
    clearQuarterPlan();
    await patchWilderness({
      terrainConfirmedDay: $expedition.wilderness.day,
      routeConfirmedDay: 0,
      weatherRolledDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherExtremeCandidate: "",
    });
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
    if (role === "Trailblazer" || role === "Keep Watch") return true;
    return npc.kind === "Professional Quartermaster" || npc.quartermasterQualified;
  }

  function standWatchEligible(member: CompanyMember): boolean {
    return member.source === "player" || !!member.npc;
  }

  function makeCampLeadEligible(member: CompanyMember): boolean {
    return member.source === "player" || !!member.npc;
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
      deprivedFromRest: false,
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
    const member = memberForId(playerId);
    let role = current.role;

    // Travel Roles are retained as the character's carried-forward preference,
    // but only become active while that character's Activity is Travel.
    // This lets Night Sleep/Stand Watch return to the prior travel setup next day.
    let others = $expedition.wilderness.assignments.filter((a) => a.playerId !== playerId);
    if (activity === "Stand Watch") {
      // Camp watch is one active watcher for the Quarter. Do not silently
      // leave a second Stand Watch assignment behind.
      others = others.map((assignment) =>
        assignment.activity === "Stand Watch"
          ? { ...assignment, activity: "Sleep" as WildernessActivity }
          : assignment,
      );
    }

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

  async function arriveAtDestination() {
    if (!$isGM || !arrivalCanBeRecorded) return;

    const arrivedAt = $expedition.wilderness.destination.trim();
    clearQuarterPlan();
    watchTask = null;
    watchMessage = "";
    dayMessage = "";

    await patchWilderness({
      currentLocation: arrivedAt,
      destination: "",
      progress: 0,
      routeTimeQuarters: 0,
      routeConfirmedDay: 0,
      wildernessEventCheckedDay: 0,
      wildernessEventLastDie: 0,
      wildernessEventLastRoll: 0,
      wildernessEventOccurred: false,
      ...resetKnownRouteEventState(),
      assignments: [],
      makeCampLeaderId: "",
    });

    quarterMessage = `Arrived at ${arrivedAt}. Enter a new destination to begin the next leg.`;
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
      terrainConfirmedDay: 0,
      routeConfirmedDay: 0,
      paceDeclaredDay: 0,
      weather: "Not rolled",
      weatherEffect: "normal",
      weatherNaturalRoll: 0,
      weatherModifiedRoll: 0,
      weatherRolledDay: 0,
      weatherExtremeCandidate: "",
      wildernessEventCheckedDay: 0,
      wildernessEventLastDie: 0,
      wildernessEventLastRoll: 0,
      wildernessEventOccurred: false,
      travelQuartersToday: 0,
      forcedMarchStoppedPlayerIds: [],
      quartermasterTodayId: "",
      quartermasterCoveredTravelQuarters: 0,
      quartermasterMissedToday: false,
      campRestQuality: "",
      campRestQualityDay: 0,
      consumptionResolvedPlayerIds: [],
      foodSatisfiedPlayerIds: [],
      waterSatisfiedPlayerIds: [],
      extraWaterRollsResolvedByPlayer: {},
      forcedMarchAttemptsByPlayer: {},
      forcedMarchAttemptKeys: [],
      sleptPlayerIdsToday: [],
    });
  }

  function heatExtraWaterRolls(): number {
    return $expedition.wilderness.weatherEffect === "heat-wave" ? 2 : 0;
  }

  function requiredExtraWaterRolls(playerId: string): number {
    return (
      ($expedition.wilderness.forcedMarchAttemptsByPlayer[playerId] ?? 0) +
      heatExtraWaterRolls()
    );
  }

  function unresolvedExtraWaterRolls(playerId: string): number {
    return Math.max(
      0,
      requiredExtraWaterRolls(playerId) -
        ($expedition.wilderness.extraWaterRollsResolvedByPlayer[playerId] ?? 0),
    );
  }

  async function recordConsumptionResponse(
    response: ExpeditionDailyResponse,
    ordinaryRequired: boolean,
  ) {
    if (response.status !== "resolved") return;

    const id = response.targetPlayerId;
    const consumptionResolvedPlayerIds = ordinaryRequired
      ? [...new Set([...$expedition.wilderness.consumptionResolvedPlayerIds, id])]
      : $expedition.wilderness.consumptionResolvedPlayerIds;

    const foodSatisfiedPlayerIds =
      ordinaryRequired && response.foodSatisfied
        ? [...new Set([...$expedition.wilderness.foodSatisfiedPlayerIds, id])]
        : $expedition.wilderness.foodSatisfiedPlayerIds.filter(
            (playerId) => !ordinaryRequired || playerId !== id || !!response.foodSatisfied,
          );

    const waterSatisfiedPlayerIds =
      ordinaryRequired && response.waterSatisfied
        ? [...new Set([...$expedition.wilderness.waterSatisfiedPlayerIds, id])]
        : $expedition.wilderness.waterSatisfiedPlayerIds.filter(
            (playerId) => !ordinaryRequired || playerId !== id || !!response.waterSatisfied,
          );

    const priorExtra = $expedition.wilderness.extraWaterRollsResolvedByPlayer[id] ?? 0;
    await patchWilderness({
      consumptionResolvedPlayerIds,
      foodSatisfiedPlayerIds,
      waterSatisfiedPlayerIds,
      extraWaterRollsResolvedByPlayer: {
        ...$expedition.wilderness.extraWaterRollsResolvedByPlayer,
        [id]: priorExtra + (response.extraWaterRollsResolved ?? 0),
      },
    });
  }

  async function promptDailyConsumption() {
    if (!$isGM) return;

    for (const member of playerMembers) {
      const ordinaryRequired =
        !$expedition.wilderness.consumptionResolvedPlayerIds.includes(member.id);
      const extraWaterRolls = unresolvedExtraWaterRolls(member.id);
      if (!ordinaryRequired && extraWaterRolls <= 0) continue;
      if (pendingConsumptionIds.has(member.id)) continue;

      pendingConsumptionIds.add(member.id);
      const threshold: 2 | 3 = quartermasterBenefitActiveSoFar ? 2 : 3;
      void requestExpeditionDaily({
        targetPlayerId: member.id,
        kind: "Consumption",
        day: $expedition.wilderness.day,
        ordinaryThreshold: threshold,
        ordinaryRequired,
        extraWaterRolls,
        note:
          (ordinaryRequired
            ? `Daily ration + Water Usage; ordinary depletion threshold 1–${threshold}.`
            : "Ordinary daily consumption already resolved.") +
          (extraWaterRolls
            ? ` ${extraWaterRolls} additional Water Usage roll${extraWaterRolls === 1 ? "" : "s"} owed from Heat/Forced March; these deplete on 1–3.`
            : ""),
      })
        .then(async (response) => {
          if (response) await recordConsumptionResponse(response, ordinaryRequired);
        })
        .finally(() => pendingConsumptionIds.delete(member.id));
    }
  }

  async function promptRestForSleepers(qualityOverride?: RestQuality) {
    if (!$isGM || !sleeperEntries.length) return;
    const quality =
      qualityOverride ??
      (restQualityReady ? ($expedition.wilderness.campRestQuality as RestQuality) : undefined);
    if (!quality) return;

    // Resolve every sleeping NPC in one room-state write. Sequential writes
    // could race through OBR metadata and leave one sleeper falsely unresolved.
    const unresolvedNpcSleepers = sleeperEntries
      .map(({ member }) => member)
      .filter(
        (member) =>
          member.source === "npc" &&
          member.npc &&
          !$expedition.wilderness.sleptPlayerIdsToday.includes(member.id),
      );

    if (unresolvedNpcSleepers.length) {
      const npcIds = new Set(unresolvedNpcSleepers.map((member) => member.id));
      await patchWilderness({
        companyNpcs: $expedition.wilderness.companyNpcs.map((npc) =>
          npcIds.has(npc.id)
            ? {
                ...npc,
                fatigue: quality === "Perilous" ? npc.fatigue : 0,
                deprivedFromRest: false,
              }
            : npc,
        ),
        sleptPlayerIdsToday: [
          ...new Set([
            ...$expedition.wilderness.sleptPlayerIdsToday,
            ...unresolvedNpcSleepers.map((member) => member.id),
          ]),
        ],
      });
    }

    for (const { member } of sleeperEntries) {
      if (member.source !== "player") continue;
      if ($expedition.wilderness.sleptPlayerIdsToday.includes(member.id)) continue;
      if (pendingRestIds.has(member.id)) continue;
      pendingRestIds.add(member.id);

      void requestExpeditionDaily({
        targetPlayerId: member.id,
        kind: "Rest",
        day: $expedition.wilderness.day,
        quality,
        note:
          `${quality} Rest from the established shelter. Rest is separate from food/water and Catch Your Breath.`,
      })
        .then(async (response) => {
          if (!response || response.status !== "resolved") return;
          await patchWilderness({
            sleptPlayerIdsToday: [
              ...new Set([
                ...$expedition.wilderness.sleptPlayerIdsToday,
                response.targetPlayerId,
              ]),
            ],
          });
        })
        .finally(() => pendingRestIds.delete(member.id));
    }
  }

  async function setManualRestQuality() {
    if (!$isGM) return;
    clearQuarterPlan();
    await patchWilderness({
      campRestQuality: manualRestQuality,
      campRestQualityDay: $expedition.wilderness.day,
    });
  }

  function recordForcedMarchAttempt(playerId: string) {
    const key = `${$expedition.wilderness.day}:${$expedition.wilderness.quarter}:${playerId}`;
    if ($expedition.wilderness.forcedMarchAttemptKeys.includes(key)) return;

    patchWilderness({
      forcedMarchAttemptKeys: [
        ...$expedition.wilderness.forcedMarchAttemptKeys,
        key,
      ],
      forcedMarchAttemptsByPlayer: {
        ...$expedition.wilderness.forcedMarchAttemptsByPlayer,
        [playerId]: ($expedition.wilderness.forcedMarchAttemptsByPlayer[playerId] ?? 0) + 1,
      },
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

    if (mixedTravelPlan) {
      quarterPlanActive = false;
      quarterTasks = [];
      quarterMessage =
        "This plan mixes Travel with Sleep, Stand Watch, Make Camp, or Other. That would split the Company, which this board does not model. Set the whole Company to a halted plan, or keep everyone moving.";
      return;
    }

    if (sleeperEntries.length && !restQualityReady && makeCampEntries.length === 0) {
      quarterPlanActive = false;
      quarterTasks = [];
      quarterMessage =
        "Sleep resolves Rest, but no Rest quality is established for today. Include Make Camp in this Quarter, complete Make Camp first, or set the shelter's Rest quality below.";
      return;
    }

    const quartermasterAssignment = currentAssignments.find(
      (assignment) =>
        assignment.role === "Quartermaster" &&
        (assignment.activity === "Travel" || assignment.activity === "Make Camp"),
    );
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
      if (!climateReady || !terrainReady || !routeReady) {
        quarterPlanActive = false;
        quarterTasks = [];
        quarterMessage = "Confirm Climate, Terrain, and Route before resolving travel.";
        return;
      }
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
        const trailAssignment = currentAssignments.find(
          (a) => a.role === "Trailblazer" && a.activity === "Travel",
        );
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

    // The ordinary daily ration/Water checkpoint is normally the Evening
    // Make Camp Quarter. If the Company skips camp to Force March, closeout
    // below will still require these obligations before the next day begins.
    if (quarterRequiresConsumption) {
      void promptDailyConsumption();
    }

    if (sleeperEntries.length && (restQualityReady || makeCampEntries.length === 0)) {
      void promptRestForSleepers();
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

    if (response.kind === "Make Camp" && response.roll) {
      const quality: RestQuality = response.roll.success ? "Normal" : "Perilous";
      await patchWilderness({
        campRestQuality: quality,
        campRestQualityDay: $expedition.wilderness.day,
      });
      if (sleeperEntries.length) {
        await promptRestForSleepers(quality);
      }
    }

    if (response.kind === "Forced March") {
      recordForcedMarchAttempt(response.targetPlayerId);

      if (response.roll?.success === false) {
        await patchWilderness({
          forcedMarchStoppedPlayerIds: [
            ...new Set([...$expedition.wilderness.forcedMarchStoppedPlayerIds, response.targetPlayerId]),
          ],
        });
      }
    }
  }

  async function triggerKeepWatch() {
    if (!$isGM) return;
    watchTask = null;
    watchMessage = "";

    const watcher = activeWatchMember;
    if (!watcher) {
      watchMessage = "No one is on Watch. If this trigger would surprise the Company, the Company is surprised automatically.";
      return;
    }

    if (travelingThisQuarter) {
      if (!roleEligible(watcher, "Keep Watch")) {
        watchMessage = `${watcher.name} is not eligible to serve as Keep Watch while traveling.`;
        return;
      }
    } else if (!standWatchEligible(watcher)) {
      watchMessage = `${watcher.name} is not eligible to Stand Watch with their current NPC Job/Type.`;
      return;
    }

    const cautiousAdvantage = travelingThisQuarter && $expedition.wilderness.pace === "Cautious";
    const weatherDisadvantage = weatherDisadvantages("Keep Watch");
    const task = makeTask("Keep Watch", watcher, "INT", {
      skill: "Detection",
      untrainedDisadvantage: true,
      hasAdvantage: cautiousAdvantage,
      hasDisadvantage: weatherDisadvantage,
      note:
        `${activeWatchMode ? `${activeWatchMode}. ` : ""}` +
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
      const assignment = currentAssignments.find(
        (entry) => entry.role === "Quartermaster" && entry.activity === "Travel",
      );
      const member = assignment ? memberForId(assignment.playerId) : undefined;
      if (assignment && member && roleEligible(member, "Quartermaster")) {
        if (!quartermasterTodayId) quartermasterTodayId = assignment.playerId;
        if (quartermasterTodayId === assignment.playerId) quartermasterCoveredTravelQuarters += 1;
        else quartermasterMissedToday = true;
      } else {
        quartermasterMissedToday = true;
      }
    }

    let campRestQuality = $expedition.wilderness.campRestQuality;
    let campRestQualityDay = $expedition.wilderness.campRestQualityDay;
    const makeCampTask = quarterTasks.find((task) => task.kind === "Make Camp");
    if (makeCampTask?.response?.roll) {
      campRestQuality = makeCampTask.response.roll.success ? "Normal" : "Perilous";
      campRestQualityDay = $expedition.wilderness.day;
    }

    const weatherDelay = travelingThisQuarter ? weatherTravelDelay() : 0;
    const clockCost = 1 + weatherDelay;
    const next = advanceClock($expedition.wilderness.quarter, clockCost);
    const completedLabel = `Day ${$expedition.wilderness.day} ${$expedition.wilderness.quarter}`;
    const travelCount = $expedition.wilderness.travelQuartersToday + (travelingThisQuarter ? 1 : 0);
    const nextDay = $expedition.wilderness.day + next.daysAdvanced;

    // Consumption may be delayed by Forced March, but it is never waived.
    // Do not cross dawn until ordinary daily consumption and every Heat /
    // Forced March extra Water obligation have been resolved for connected PCs.
    if (next.daysAdvanced && (!dailyConsumptionReady || !extraWaterReady)) {
      await promptDailyConsumption();
      quarterMessage =
        "Daily closeout is still owed. Food/Water prompts were sent; complete them before beginning the next day.";
      return;
    }

    let companyNpcs = $expedition.wilderness.companyNpcs;
    if (next.daysAdvanced) {
      for (const member of playerMembers) {
        applyDayCloseout(
          member.id,
          $expedition.wilderness.day,
          $expedition.wilderness.foodSatisfiedPlayerIds.includes(member.id),
          $expedition.wilderness.sleptPlayerIdsToday.includes(member.id),
        );
      }

      companyNpcs = companyNpcs.map((npc) => {
        if ($expedition.wilderness.sleptPlayerIdsToday.includes(npc.id)) return npc;
        return {
          ...npc,
          fatigue: (npc.fatigue ?? 0) + 1,
          deprivedFromRest: true,
        };
      });
    }

    const nextAssignments = assignmentsForQuarter(next.quarter);
    const nextMakeCampLeaderId =
      defaultActivityForQuarter(next.quarter) === null
        ? $expedition.wilderness.makeCampLeaderId
        : "";

    await patchWilderness({
      progress,
      quarter: next.quarter,
      day: nextDay,
      terrainConfirmedDay: next.daysAdvanced ? 0 : $expedition.wilderness.terrainConfirmedDay,
      routeConfirmedDay: next.daysAdvanced ? 0 : $expedition.wilderness.routeConfirmedDay,
      travelQuartersToday: next.daysAdvanced ? 0 : travelCount,
      forcedMarchStoppedPlayerIds: next.daysAdvanced ? [] : $expedition.wilderness.forcedMarchStoppedPlayerIds,
      quartermasterTodayId: next.daysAdvanced ? "" : quartermasterTodayId,
      quartermasterCoveredTravelQuarters: next.daysAdvanced ? 0 : quartermasterCoveredTravelQuarters,
      quartermasterMissedToday: next.daysAdvanced ? false : quartermasterMissedToday,
      campRestQuality: next.daysAdvanced ? "" : campRestQuality,
      campRestQualityDay: next.daysAdvanced ? 0 : campRestQualityDay,
      consumptionResolvedPlayerIds: next.daysAdvanced ? [] : $expedition.wilderness.consumptionResolvedPlayerIds,
      foodSatisfiedPlayerIds: next.daysAdvanced ? [] : $expedition.wilderness.foodSatisfiedPlayerIds,
      waterSatisfiedPlayerIds: next.daysAdvanced ? [] : $expedition.wilderness.waterSatisfiedPlayerIds,
      extraWaterRollsResolvedByPlayer: next.daysAdvanced ? {} : $expedition.wilderness.extraWaterRollsResolvedByPlayer,
      forcedMarchAttemptsByPlayer: next.daysAdvanced ? {} : $expedition.wilderness.forcedMarchAttemptsByPlayer,
      forcedMarchAttemptKeys: next.daysAdvanced ? [] : $expedition.wilderness.forcedMarchAttemptKeys,
      sleptPlayerIdsToday: next.daysAdvanced ? [] : $expedition.wilderness.sleptPlayerIdsToday,
      assignments: nextAssignments,
      makeCampLeaderId: nextMakeCampLeaderId,
      companyNpcs,
    });

    quarterTasks = [];
    quarterPlanActive = false;
    watchTask = null;
    watchMessage = "";
    quarterMessage =
      `${completedLabel} resolved. ` +
      `${progressMade ? "Travel progress +1. " : travelingThisQuarter ? "No travel progress. " : "Company did not travel. "}` +
      `${makeCampTask?.response?.roll ? `Camp established for ${campRestQuality} Rest. ` : ""}` +
      `${weatherDelay ? `Weather consumed +${weatherDelay} additional Quarter${weatherDelay === 1 ? "" : "s"}. ` : ""}` +
      `${next.daysAdvanced ? `Day ${nextDay} begins; missing Sleep applied +1 Fatigue and Rest deprivation, then Terrain/Route confirmation begins.` : ""}`;
  }

  async function playerResolveConsumption() {
    const request = $PendingExpeditionDailyStore;
    if (dailyBusy || !request || request.kind !== "Consumption") return;
    dailyBusy = true;
    try {
      await resolvePendingConsumption({
        rationSource: rationChoice || "none",
        waterSource: waterChoice || "none",
      });
    } finally {
      dailyBusy = false;
    }
  }

  async function playerResolveRest() {
    const request = $PendingExpeditionDailyStore;
    if (dailyBusy || !request || request.kind !== "Rest") return;
    dailyBusy = true;
    try {
      await resolvePendingRest(
        request.quality === "Comfortable" && localLostAttributes.length
          ? restAttributeChoice
          : undefined,
      );
    } finally {
      dailyBusy = false;
    }
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
          </div>
        </div>

        <div class="mt-2 text-[10px] border rounded px-2 py-1 bg-gray-50 flex items-center gap-2">
          <span class="font-bold">Journey</span>
          <span>{$expedition.wilderness.currentLocation || "Origin not set"}</span>
          <i class="material-icons text-xs text-gray-500">arrow_forward</i>
          <span>{$expedition.wilderness.destination || "Destination not set"}</span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-1 mt-2 text-[10px]">
          <div class="status-box">
            <div class="status-label">Climate</div>
            <div class="font-bold">{$expedition.wilderness.climate}{climateReady ? "" : " · SETUP"}</div>
          </div>
          <div class="status-box">
            <div class="status-label">Terrain</div>
            <div class="font-bold">{$expedition.wilderness.terrain}{terrainReady ? "" : " · CONFIRM"}</div>
          </div>
          <div class="status-box">
            <div class="status-label">Route</div>
            <div class="font-bold">{$expedition.wilderness.routeMode}{routeReady ? "" : " · CONFIRM"}</div>
          </div>
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
          <div class="status-box md:col-span-2">
            <div class="status-label">Journey Progress</div>
            <div class="font-bold">
              {#if $expedition.wilderness.routeMode === "Known Route"}
                {$expedition.wilderness.progress} / {$expedition.wilderness.routeTimeQuarters || "?"} Quarters
              {:else}
                {$expedition.wilderness.progress} successful travel {$expedition.wilderness.progress === 1 ? "Quarter" : "Quarters"}
              {/if}
            </div>
          </div>
        </div>

        {#if knownRouteComplete}
          <div class="mt-2 border border-emerald-300 bg-emerald-50 rounded-md px-2 py-2 text-xs">
            <div class="font-bold">Known Route complete</div>
            <div class="text-[10px] text-emerald-900">
              The recorded travel time has been reached. Record Arrival before beginning another leg.
            </div>
            {#if $isGM && arrivalCanBeRecorded}
              <button class="mt-1 bg-emerald-800 text-white rounded px-2 py-1 text-[10px]" on:click={arriveAtDestination}>
                Arrive at {$expedition.wilderness.destination}
              </button>
            {/if}
          </div>
        {/if}

        <div class="workflow-card mt-2">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="text-[9px] uppercase tracking-wide text-gray-500">Current Step · {workflowStepNumber} of 8</div>
              {#if workflowStep === "climate"}
                <div class="font-bold text-sm">Journey Setup — Lock Climate</div>
              {:else if workflowStep === "terrain"}
                <div class="font-bold text-sm">Day {$expedition.wilderness.day} — Confirm Terrain</div>
              {:else if workflowStep === "route"}
                <div class="font-bold text-sm">Day {$expedition.wilderness.day} — Confirm Route</div>
              {:else if workflowStep === "weather"}
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
              {workflowStep === "climate" ? "Choose once for the whole journey" :
               workflowStep === "terrain" ? "Terrain may change each Travel Day" :
               workflowStep === "route" ? "Route state follows the day's Terrain" :
               workflowStep === "weather" ? "Weather comes after Terrain and Route" :
               workflowStep === "pace" ? "One Pace for the Travel Phase" :
               workflowStep === "plan" ? "Everyone takes one Quarter Activity" :
               workflowStep === "resolve" ? "Required Saves are resolving" :
               "Advance when the Quarter is settled"}
            </div>
          </div>

          {#if workflowStep === "climate"}
            <div class="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <label>
                Climate / Season
                <select disabled={!$isGM} value={$expedition.wilderness.climate} on:change={onClimateChange}>
                  {#each CLIMATES as climate}<option value={climate}>{climate}</option>{/each}
                </select>
              </label>
              <div class="text-[10px] text-gray-500 flex-1 min-w-[180px]">
                Climate is selected once and locked for this journey because it drives the persistent weather table.
              </div>
              {#if $isGM}<button class="primary-action" on:click={lockClimate}>Lock Climate</button>{/if}
            </div>
          {:else if workflowStep === "terrain"}
            <div class="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <label>
                Terrain
                <select disabled={!$isGM} value={$expedition.wilderness.terrain} on:change={onTerrainChange}>
                  {#each TERRAINS as terrain}<option value={terrain}>{terrain}</option>{/each}
                </select>
              </label>
              <div class="text-[10px] text-gray-500 flex-1 min-w-[180px]">
                Confirm the terrain for Day {$expedition.wilderness.day}. It may change again at the next dawn.
              </div>
              {#if $isGM}<button class="primary-action" on:click={confirmTerrain}>Confirm Terrain</button>{/if}
            </div>
          {:else if workflowStep === "route"}
            <div class="mt-2 flex flex-wrap items-end gap-2 text-xs">
              <label>
                Route
                <select disabled={!$isGM} value={$expedition.wilderness.routeMode} on:change={onRouteChange}>
                  {#each ROUTES as route}<option value={route}>{route}</option>{/each}
                </select>
              </label>
              <div class="text-[10px] text-gray-500 flex-1 min-w-[180px]">
                Confirm whether today's travel follows a Known Route or crosses Unmapped Country.
              </div>
              {#if $isGM}<button class="primary-action" on:click={confirmRoute}>Confirm Route</button>{/if}
            </div>
          {:else if workflowStep === "weather"}
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
                The previous Quarter's Activities and Roles are carried forward. Change only what is different, then confirm the Quarter.
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
              {#if quarterMessage}
                <div class="mt-1 text-[10px] border rounded px-2 py-1 bg-amber-50">{quarterMessage}</div>
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
              {#if quarterRequiresConsumption}
                <div class="mt-2 border-2 border-amber-500 rounded p-2 bg-amber-50 text-[10px]">
                  <div class="flex items-center gap-2">
                    <span class="font-bold">WAITING — Daily Food & Water</span>
                    <span class="ml-auto">
                      {$expedition.wilderness.consumptionResolvedPlayerIds.length}/{playerMembers.length} players
                    </span>
                    {#if $isGM}
                      <button class="border rounded px-2 py-0.5 bg-white" on:click={promptDailyConsumption}>Prompt Again</button>
                    {/if}
                  </div>
                  {#if unresolvedConsumptionMembers.length}
                    <div class="mt-1">
                      Waiting on: {unresolvedConsumptionMembers.map((member) => member.name).join(", ")}.
                      The Quarter cannot complete until their required Ration/Water Usage is resolved.
                    </div>
                  {/if}
                </div>
              {/if}
              {#if sleeperEntries.length}
                <div
                  class="mt-1 border rounded px-2 py-1 text-[10px]"
                  class:border-amber-500={!sleepersResolved}
                  class:bg-amber-50={!sleepersResolved}
                  class:bg-white={sleepersResolved}
                >
                  <div class="flex items-center gap-2">
                    <span class="font-bold">{sleepersResolved ? "Sleep / Rest" : "WAITING — Sleep / Rest"}</span>
                    <span>{$expedition.wilderness.campRestQuality || "No quality set"}</span>
                    <span class="ml-auto">
                      {$expedition.wilderness.sleptPlayerIdsToday.filter((id) => sleeperEntries.some(({ member }) => member.id === id)).length}/{sleeperEntries.length}
                    </span>
                    {#if $isGM && restQualityReady && !sleepersResolved}
                      <button class="border rounded px-2 py-0.5 bg-white" on:click={() => promptRestForSleepers()}>Prompt Again</button>
                    {/if}
                  </div>
                  {#if unresolvedSleepMembers.length}
                    <div class="mt-1">Waiting on: {unresolvedSleepMembers.map(({ member }) => member.name).join(", ")}.</div>
                  {/if}
                </div>
              {/if}
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
                {#if !allQuarterTasksDone}
                  <div class="text-[10px] text-amber-800 mt-1">
                    {#if !quarterRollsDone}
                      Waiting for required Quarter Saves.
                    {:else if unresolvedConsumptionMembers.length}
                      Waiting for daily Food/Water: {unresolvedConsumptionMembers.map((member) => member.name).join(", ")}.
                    {:else if unresolvedSleepMembers.length}
                      Waiting for Rest: {unresolvedSleepMembers.map(({ member }) => member.name).join(", ")}.
                    {/if}
                  </div>
                {/if}
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

        {#if $isGM}
          <div class="mt-2 border-2 border-slate-400 rounded-md bg-slate-50 p-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold">GM · Wilderness Events</div>
                <div class="text-[9px] text-gray-500">Private referee procedure. Players do not see this panel or its rolls.</div>
              </div>
              {#if $expedition.wilderness.routeMode === "Unmapped Country"}
                <span class="status-chip">{unmappedEventDue ? "CHECK DUE" : "CHECKED"}</span>
              {:else if $expedition.wilderness.knownRouteEventBudget < 0}
                <span class="status-chip">SET BUDGET</span>
              {:else}
                <span class="status-chip">{knownRouteEventsRemaining} REMAIN</span>
              {/if}
            </div>

            {#if $expedition.wilderness.routeMode === "Unmapped Country"}
              <div class="mt-2">
                <div class="text-[10px]">
                  One Wilderness Event check per travel day, placed in an appropriate Quarter — not one check per Quarter.
                </div>
                {#if unmappedEventDue}
                  <label class="flex items-center gap-1 mt-1 text-[10px]">
                    <input type="checkbox" bind:checked={eventConspicuous} />
                    Company is loud, lit, bleeding, or leaving an obvious trail
                  </label>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <button class="bg-black text-white rounded px-2 py-1 text-[10px]" on:click={() => checkUnmappedWildernessEvent(false)}>
                      Roll 1-in-{eventConspicuous ? 4 : $expedition.wilderness.pace === "Cautious" ? 8 : 6}
                    </button>
                    <button class="border rounded px-2 py-1 text-[10px]" on:click={() => checkUnmappedWildernessEvent(true)}>
                      Mark Checked Externally
                    </button>
                  </div>
                {:else}
                  <div class="mt-1 text-[10px]">
                    {#if $expedition.wilderness.wildernessEventLastRoll > 0}
                      Day {$expedition.wilderness.day}: d{$expedition.wilderness.wildernessEventLastDie}
                      → {$expedition.wilderness.wildernessEventLastRoll}.
                      {$expedition.wilderness.wildernessEventOccurred ? "Event occurs." : "No event."}
                    {:else}
                      Day {$expedition.wilderness.day}: marked checked externally.
                    {/if}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="mt-2">
                {#if $expedition.wilderness.routeTimeQuarters <= 0}
                  <div class="text-[10px]">Enter the recorded route time to determine the whole-journey Event budget range.</div>
                {:else}
                  <div class="text-[10px]">
                    Whole-journey budget guideline: <span class="font-bold">{knownRouteEventMin}–{knownRouteEventMax}</span>
                    event{knownRouteEventMax === 1 ? "" : "s"} for {$expedition.wilderness.routeTimeQuarters} recorded Quarter{$expedition.wilderness.routeTimeQuarters === 1 ? "" : "s"}.
                  </div>
                  <div class="flex flex-wrap gap-3 mt-1 text-[10px]">
                    <label class="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={$expedition.wilderness.knownRouteDangerous}
                        on:change={(e) => setKnownRouteDangerous(e.currentTarget.checked)}
                      />
                      Contested / dangerous / long untraveled (+1)
                    </label>
                    <label class="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={$expedition.wilderness.knownRouteCautiousCommitment}
                        on:change={(e) => setKnownRouteCautiousCommitment(e.currentTarget.checked)}
                      />
                      Cautious for whole journey (−1, min 0)
                    </label>
                  </div>
                  <div class="flex items-end gap-2 mt-2">
                    <label>
                      Event Budget
                      <input
                        class="w-20"
                        type="number"
                        min="0"
                        value={$expedition.wilderness.knownRouteEventBudget < 0 ? "" : $expedition.wilderness.knownRouteEventBudget}
                        placeholder={`${knownRouteEventMin}–${knownRouteEventMax}`}
                        on:change={(e) => setKnownRouteEventBudget(parseInt(e.currentTarget.value, 10))}
                      />
                    </label>
                    {#if $expedition.wilderness.knownRouteEventBudget >= 0}
                      <div class="text-[10px] pb-1">
                        {$expedition.wilderness.knownRouteEventsResolved} resolved · {knownRouteEventsRemaining} remaining
                      </div>
                      <button
                        class="border rounded px-2 py-1 text-[10px] mb-0.5"
                        disabled={knownRouteEventsRemaining <= 0}
                        on:click={resolveKnownRouteEvent}
                      >
                        Mark One Event Resolved
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

        <details class="mt-2 border rounded-md bg-gray-50">
          <summary class="px-2 py-1 text-xs font-bold cursor-pointer">Journey Setup & GM Tools</summary>
          <div class="p-2 pt-1 text-xs">
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
              <label>
                Climate / Season
                <select disabled={!$isGM || climateReady} value={$expedition.wilderness.climate} on:change={onClimateChange}>
                  {#each CLIMATES as climate}<option value={climate}>{climate}</option>{/each}
                </select>
                <div class="text-[9px] text-gray-500">{climateReady ? "Locked for journey" : "Select first"}</div>
              </label>
              <label>
                Terrain
                <select disabled={!$isGM || !climateReady} value={$expedition.wilderness.terrain} on:change={onTerrainChange}>
                  {#each TERRAINS as terrain}<option value={terrain}>{terrain}</option>{/each}
                </select>
                <div class="text-[9px] text-gray-500">{terrainReady ? `Confirmed Day ${$expedition.wilderness.day}` : "Confirm each day"}</div>
              </label>
              <label>
                Route
                <select disabled={!$isGM || !terrainReady} value={$expedition.wilderness.routeMode} on:change={onRouteChange}>
                  {#each ROUTES as route}<option value={route}>{route}</option>{/each}
                </select>
                <div class="text-[9px] text-gray-500">{routeReady ? `Confirmed Day ${$expedition.wilderness.day}` : "Confirm after Terrain"}</div>
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
                on:change={onDestinationChange}
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
                    on:change={onRouteTimeChange}
                  />
                  <span class="text-[10px] text-gray-500">Quarters</span>
                </div>
              </label>
            {/if}

            {#if $isGM && $expedition.wilderness.destination.trim()}
              <div class="mt-2 border rounded-md bg-white px-2 py-1.5">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="font-bold text-[10px]">Arrival</div>
                    <div class="text-[9px] text-gray-500">
                      {$expedition.wilderness.routeMode === "Known Route"
                        ? knownRouteComplete
                          ? "Recorded route time reached."
                          : `${$expedition.wilderness.progress} / ${$expedition.wilderness.routeTimeQuarters || "?"} Quarters complete.`
                        : "GM records Arrival when the destination is reached."}
                    </div>
                  </div>
                  <button
                    class="border rounded px-2 py-1 text-[10px]"
                    class:bg-emerald-800={arrivalCanBeRecorded}
                    class:text-white={arrivalCanBeRecorded}
                    disabled={!arrivalCanBeRecorded}
                    title={
                      arrivalCanBeRecorded
                        ? "Move the Company to this destination and clear this leg's route progress."
                        : "Known Routes can record Arrival after their recorded route time is reached."
                    }
                    on:click={arriveAtDestination}
                  >
                    Record Arrival
                  </button>
                </div>
              </div>
            {/if}

            {#if $isGM}
              <div class="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                {#if climateReady}<button class="border rounded px-2 py-1 text-[10px]" on:click={unlockClimate}>Unlock Climate</button>{/if}
                {#if climateReady && !terrainReady}<button class="border rounded px-2 py-1 text-[10px]" on:click={confirmTerrain}>Confirm Terrain</button>{/if}
                {#if terrainReady && !routeReady}<button class="border rounded px-2 py-1 text-[10px]" on:click={confirmRoute}>Confirm Route</button>{/if}
                {#if paceReady}<button class="border rounded px-2 py-1 text-[10px]" on:click={unlockPace}>Unlock Pace</button>{/if}
                <button class="border border-red-300 bg-red-50 text-red-800 rounded px-2 py-1 text-[10px]" on:click={resetTravel}>Reset Travel</button>
                <button class="border border-red-300 bg-red-50 text-red-800 rounded px-2 py-1 text-[10px]" on:click={resetDay}>Reset Day</button>
              </div>
            {/if}
          </div>
        </details>
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
              <div class="text-[10px] text-gray-500">Edit the plan in the right-hand Company panel. Travel Roles apply only while moving; Stand Watch is the non-travel camp watch Activity.</div>
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
                  <span class="font-bold">Watch</span>
                  <span>{activeWatchMember?.name ?? "Unassigned"}</span>
                  {#if activeWatchMember}<span class="role-chip">{activeWatchMode}</span>{/if}
                  {#if $isGM}
                    <button class="ml-auto border rounded px-2 py-1" title="GM override/test: roll only when something would otherwise surprise the Company" on:click={triggerKeepWatch}>Trigger</button>
                  {/if}
                </div>
                <div class="text-gray-500 mt-0.5">
                  {#if travelingThisQuarter}
                    {keepWatchMember
                      ? "Travel Keep Watch is armed. No Quarter roll; roll only on a surprise trigger."
                      : "No traveling watcher assigned; a surprise trigger leaves the Company automatically surprised."}
                  {:else}
                    {standWatchMember
                      ? "Camp Stand Watch is armed while the rest of the Company may Sleep. The watcher does not Sleep this Quarter."
                      : "No camp watcher assigned; choose Stand Watch as a Quarter Activity if someone remains awake."}
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
              <div class="border rounded-md p-2 bg-white text-[10px] md:col-span-2">
                <div class="flex items-center gap-2">
                  <span class="font-bold">Daily Closeout</span>
                  <span>
                    Food/Water {$expedition.wilderness.consumptionResolvedPlayerIds.length}/{playerMembers.length}
                  </span>
                  <span>·</span>
                  <span>Rest {$expedition.wilderness.sleptPlayerIdsToday.length}/{company.length}</span>
                  {#if restQualityReady}
                    <span class="role-chip">{$expedition.wilderness.campRestQuality} Rest</span>
                  {/if}
                </div>
                {#if sleeperEntries.length && !restQualityReady}
                  <div class="flex flex-wrap items-end gap-1 mt-1">
                    <span class="text-gray-500 flex-1 min-w-[180px]">
                      Sleep is declared but no camp/shelter quality is established. Use this only for existing shelter or open-ground Rest; Make Camp sets this automatically.
                    </span>
                    {#if $isGM}
                      <select bind:value={manualRestQuality} class="w-auto">
                        <option>Perilous</option>
                        <option>Normal</option>
                        <option>Comfortable</option>
                      </select>
                      <button class="border rounded px-2 py-1" on:click={setManualRestQuality}>Set Shelter Rest</button>
                    {/if}
                  </div>
                {/if}
                <div class="text-gray-500 mt-1">
                  No Sleep Quarter by dawn: +1 Fatigue and Deprived from lack of Rest. Food and Water are tracked separately.
                </div>
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
        {#if !$isGM && $PendingExpeditionDailyStore}
          <div class="border-2 border-black rounded-md p-2 mb-2 bg-gray-50">
            {#if $PendingExpeditionDailyStore.kind === "Consumption"}
              <div class="font-bold text-xs">DAILY FOOD & WATER</div>
              <div class="text-[10px] text-gray-500 mt-0.5">
                Day {$PendingExpeditionDailyStore.day}
                {#if $PendingExpeditionDailyStore.ordinaryRequired}
                  · ordinary Ration + Water Usage
                {:else}
                  · additional Water only
                {/if}
              </div>
              {#if $PendingExpeditionDailyStore.note}
                <div class="text-[10px] mt-1">{$PendingExpeditionDailyStore.note}</div>
              {/if}

              {#if $PendingExpeditionDailyStore.ordinaryRequired}
                <label class="block mt-2 text-xs">
                  Ration source
                  <select bind:value={rationChoice}>
                    {#each localRationItems as item (item.id)}
                      <option value={item.id}>{item.name} · {item.usageDie}</option>
                    {/each}
                    <option value="none">No ration available</option>
                  </select>
                </label>
              {/if}

              {#if $PendingExpeditionDailyStore.ordinaryRequired || $PendingExpeditionDailyStore.extraWaterRolls > 0}
                <label class="block mt-1 text-xs">
                  Water source
                  <select bind:value={waterChoice}>
                    {#each localWaterItems as item (item.id)}
                      <option value={item.id}>{item.name} · {item.usageDie}</option>
                    {/each}
                    <option value="none">No accessible Water</option>
                  </select>
                </label>
              {/if}

              <div class="text-[9px] text-gray-500 mt-1">
                A die that depletes still supplied that use. Missing Water causes Deprived immediately; missing food is checked at dawn.
              </div>
              <button
                class="bg-black text-white rounded-md px-3 py-1 text-xs mt-2"
                disabled={dailyBusy}
                on:click={playerResolveConsumption}
              >
                {dailyBusy ? "Resolving…" : "Roll Daily Usage"}
              </button>
            {:else}
              <div class="font-bold text-xs">SLEEP / REST</div>
              <div class="text-xs mt-1">
                {$PendingExpeditionDailyStore.quality} Rest · Day {$PendingExpeditionDailyStore.day}
              </div>
              {#if $PendingExpeditionDailyStore.note}
                <div class="text-[10px] text-gray-500 mt-1">{$PendingExpeditionDailyStore.note}</div>
              {/if}
              {#if $PendingExpeditionDailyStore.quality === "Comfortable" && localLostAttributes.length}
                <label class="block mt-2 text-xs">
                  Restore Attribute
                  <select bind:value={restAttributeChoice}>
                    {#each localLostAttributes as attribute}
                      <option value={attribute}>{attribute}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              <div class="text-[9px] text-gray-500 mt-1">
                Perilous prevents Rest deprivation. Normal also removes all Fatigue. Comfortable also restores 1 lost Attribute point. Light Injuries can heal with appropriate Medical supplies and a full night’s Rest.
              </div>
              <button
                class="bg-black text-white rounded-md px-3 py-1 text-xs mt-2"
                disabled={dailyBusy}
                on:click={playerResolveRest}
              >
                {dailyBusy ? "Resting…" : "Resolve " + $PendingExpeditionDailyStore.quality + " Rest"}
              </button>
            {/if}
          </div>
        {/if}

        {#if !$isGM && !$PendingExpeditionDailyStore && $LastExpeditionDailyStore}
          <div class="border rounded-md p-2 mb-2 bg-gray-50">
            <div class="font-bold text-xs">LAST DAILY RESOLUTION</div>
            {#if $LastExpeditionDailyStore.kind === "Consumption"}
              <div class="text-[10px] mt-1">
                Food: {$LastExpeditionDailyStore.foodSatisfied ? "satisfied" : "not satisfied"}
                · Water: {$LastExpeditionDailyStore.waterSatisfied ? "satisfied" : "not satisfied"}
              </div>
              {#if $LastExpeditionDailyStore.usage?.length}
                <div class="flex flex-col gap-0.5 mt-1">
                  {#each $LastExpeditionDailyStore.usage as use}
                    <div class="text-[9px]">
                      {use.category} · {use.itemName}: {use.before} rolled {use.roll}
                      {use.after === use.before ? " — holds" : " — " + use.after}
                    </div>
                  {/each}
                </div>
              {/if}
            {:else if $LastExpeditionDailyStore.rest}
              <div class="text-[10px] mt-1">
                {$LastExpeditionDailyStore.rest.quality} Rest resolved.
                {#if $LastExpeditionDailyStore.rest.fatigueRemoved}
                  {$LastExpeditionDailyStore.rest.fatigueRemoved} Fatigue removed.
                {/if}
                {#if $LastExpeditionDailyStore.rest.healedLightInjuries}
                  {$LastExpeditionDailyStore.rest.healedLightInjuries} Light Injury(ies) healed.
                {/if}
                {#if $LastExpeditionDailyStore.rest.restoredAttribute}
                  {$LastExpeditionDailyStore.rest.restoredAttribute} +1.
                {/if}
              </div>
            {/if}
          </div>
        {/if}

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
          Common Activities prefill by Quarter: Morning/Day Travel, Evening Sleep, Night carries the current plan. Roles stay assigned until you change them.
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
                  Role
                  <select
                    disabled={!$isGM || (assignment.activity !== "Travel" && assignment.activity !== "Make Camp")}
                    value={assignment.role ?? ""}
                    on:change={(e) => onRoleChange(p.id, e)}
                  >
                    <option value="">None</option>
                    {#each ROLES as role}
                      <option
                        value={role}
                        disabled={
                          !roleEligible(p, role) ||
                          ((role === "Trailblazer" || role === "Keep Watch") && assignment.activity !== "Travel") ||
                          (role === "Quartermaster" && incompatibleWithQuartermaster(assignment.activity))
                        }
                      >
                        {role}
                      </option>
                    {/each}
                  </select>
                </label>
                {#if assignment.activity === "Make Camp" && assignment.role === "Quartermaster"}
                  <div class="text-[9px] text-gray-500 mt-0.5">
                    Quartermaster remains active and may assist Make Camp. The daily supply benefit still depends on having managed the day's traveling Quarters.
                  </div>
                {:else if assignment.activity !== "Travel" && assignment.role}
                  <div class="text-[9px] text-gray-500 mt-0.5">
                    {assignment.role} is stored and becomes active again when this member returns to Travel.
                  </div>
                {/if}

                {#if assignment.activity === "Stand Watch"}
                  <div class="mt-1 text-[9px] text-gray-500">
                    Camp watch. This character stays awake; use the Watch trigger only if something would otherwise surprise the Company.
                  </div>
                {/if}

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
                        {#each ATTRIBUTES as attr}
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
        {#if $isGM}
          <div class="flex items-center justify-between gap-2">
            <div>
              <h2>DUNGEON / LOCATION EXPLORATION</h2>
              <div class="text-[10px] text-gray-500">
                Shared 10-minute Exploration Turn · Hour {explorationHour}, Turn {explorationTurnInHour} of 6
              </div>
            </div>
            <span class="status-chip">Turn {$expedition.exploration.turn}</span>
          </div>
        {:else}
          <div class="border-2 border-black rounded-lg p-3 bg-white">
            <div class="flex items-center justify-between gap-2">
              <h2>DUNGEON / LOCATION EXPLORATION</h2>
              <span class="text-[9px] text-gray-500">Each Turn ≈ 10 min</span>
            </div>
            <div class="grid grid-cols-3 gap-2 mt-2 text-center">
              <div class="border rounded-md py-2 bg-gray-50">
                <div class="text-[9px] uppercase tracking-wide text-gray-500">Hour</div>
                <div class="text-3xl font-black leading-none">{explorationHour}</div>
              </div>
              <div class="border rounded-md py-2 bg-gray-50">
                <div class="text-[9px] uppercase tracking-wide text-gray-500">Turn This Hour</div>
                <div class="text-3xl font-black leading-none">
                  {explorationTurnInHour}<span class="text-sm font-bold text-gray-500"> / 6</span>
                </div>
              </div>
              <div class="border rounded-md py-2 bg-gray-50">
                <div class="text-[9px] uppercase tracking-wide text-gray-500">Total Turn</div>
                <div class="text-3xl font-black leading-none">{$expedition.exploration.turn}</div>
              </div>
            </div>
          </div>
        {/if}

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

        <div class="mt-2 border rounded-md p-2 bg-gray-50">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-xs">Movement This Turn</div>
              <div class="text-[9px] text-gray-500">
                Site Areas, not feet: new/unsecured 1 · explored 2 · Rush 4.
              </div>
            </div>
            <span class="status-chip">MAX {movementAreaLimit} {movementAreaLimit === 1 ? "AREA" : "AREAS"}</span>
          </div>
          <div class="flex flex-wrap items-end gap-2 mt-1 text-[10px]">
            <label>
              Ground / Pace
              <select
                disabled={!$isGM}
                value={$expedition.exploration.movementMode}
                on:change={onExplorationMovementChange}
              >
                {#each EXPLORATION_MOVEMENT as mode}
                  <option value={mode}>{mode}</option>
                {/each}
              </select>
            </label>
            {#if $expedition.exploration.movementMode === "Rush"}
              <div class="text-amber-700 font-bold max-w-[360px]">
                Rush is only for explored, currently passable ground. Focused Search, Focused Listening, and dedicated Watch cannot be maintained while Rushing.
              </div>
            {:else if $expedition.exploration.movementMode === "New / Unsecured"}
              <div class="text-gray-500 max-w-[360px]">
                Normal movement into new ground is already cautious; extra care is a specific substantial activity rather than a slower universal pace.
              </div>
            {/if}
          </div>
        </div>

        {#if $isGM}
          <div class="mt-2 border rounded-md p-2 bg-gray-50">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold text-xs">GM · Optional Activity Notes</div>
                <div class="text-[9px] text-gray-500">
                  Players can simply tell you what they are doing. Use this only when a written snapshot is useful.
                </div>
              </div>
              <span class="status-chip">
                {$expedition.exploration.activityAssignments.filter((assignment) => assignment.activity !== "None").length} NOTED
              </span>
            </div>

            <div class="flex flex-col gap-1 mt-2">
              {#each company as member (member.id)}
                {@const assignment = $expedition.exploration.activityAssignments.find((entry) => entry.playerId === member.id)}
                <div class="grid grid-cols-[minmax(90px,0.8fr)_minmax(130px,1fr)_minmax(160px,1.5fr)] gap-1 items-center border rounded px-2 py-1 bg-white text-[10px]">
                  <div class="font-bold truncate">{member.name}</div>
                  <select
                    value={assignment?.activity ?? "None"}
                    on:change={(event) => onExplorationActivityChange(member, event)}
                  >
                    {#each EXPLORATION_ACTIVITIES as activity}
                      <option value={activity}>{activity}</option>
                    {/each}
                  </select>
                  <input
                    value={assignment?.detail ?? ""}
                    placeholder={assignment?.activity === "Focused Search"
                      ? "where/how + intended information"
                      : assignment?.activity === "Dedicated Watch"
                        ? "direction / threat"
                        : "optional note"}
                    on:change={(event) => onExplorationActivityDetailChange(member, event)}
                  />
                </div>
              {/each}
            </div>

            {#if explorationActivityConflicts.length}
              <div class="mt-1 border border-amber-400 bg-amber-50 rounded px-2 py-1 text-[10px] text-amber-800 font-bold">
                Rush conflict: {explorationActivityConflicts.map((assignment) => `${assignment.playerName}: ${assignment.activity}`).join(", ")}.
              </div>
            {/if}
          </div>
        {/if}

        <div class="mt-3 border-2 border-black rounded-md p-2 bg-white">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-xs">Light & Visibility</div>
              <div class="text-[9px] text-gray-500">
                Light follows its carrier. Walls, doors, corners, smoke, and actual position still determine what it illuminates.
              </div>
            </div>
            <span class="status-chip">PER-SOURCE BURN CLOCKS</span>
          </div>

          {#if $expedition.exploration.activeLights.some((light) => light.active)}
            <div class="flex flex-col gap-1 mt-2">
              {#each $expedition.exploration.activeLights.filter((light) => light.active) as light (light.ownerId + ":" + light.sourceItemId)}
                <div class="border rounded px-2 py-1 text-[10px] flex items-center gap-2 bg-gray-50">
                  <span class="font-bold">{light.ownerName}</span>
                  <span>{light.sourceName}</span>
                  {#if light.sourceName === "Hooded Lantern"}
                    <span class="text-gray-500">{light.mode}</span>
                  {/if}
                  <span class="ml-auto">{light.reachFeet} ft</span>
                  <span
                    class:font-bold={3 - ((light.burnTurns ?? 0) % 3) === 1}
                    class:text-amber-700={3 - ((light.burnTurns ?? 0) % 3) === 1}
                  >
                    {3 - ((light.burnTurns ?? 0) % 3) === 1
                      ? "FUEL CHECK THIS TURN"
                      : `Fuel check in ${3 - ((light.burnTurns ?? 0) % 3)} Turns`}
                  </span>
                  {#if light.sourceName === "Torch Bundle"}
                    <span class:font-bold={(light.burnTurns ?? 0) >= 4} class:text-amber-700={(light.burnTurns ?? 0) >= 4}>
                      {(light.burnTurns ?? 0) >= 5
                        ? "FINAL TURN"
                        : (light.burnTurns ?? 0) >= 4
                          ? "BURNING LOW"
                          : `Torch Turn ${(light.burnTurns ?? 0) + 1}/6`}
                    </span>
                  {:else}
                    <span>{light.burnTurns ?? 0} burn Turns</span>
                  {/if}
                  <span class="font-bold">{light.fuelName} {light.fuelDie}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="mt-2 border border-amber-400 bg-amber-50 rounded px-2 py-1 text-[10px] font-bold">
              No active carried light is declared.
            </div>
          {/if}

          <div class="mt-2 border-t pt-2">
            <div class="font-bold text-[10px]">Your Carried Light</div>
            {#if localLightSources.length}
              <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-1 items-end mt-1">
                <label class="text-[10px]">
                  Source
                  <select class="w-full" bind:value={selectedLightSourceId}>
                    {#each localLightSources as item (item.id)}
                      <option value={item.id}>
                        {item.name}{item.usageDie ? ` · ${item.usageDie}` : ""}
                      </option>
                    {/each}
                  </select>
                </label>
                {#if selectedLightSource?.name === "Hooded Lantern"}
                  <label class="text-[10px]">
                    Hood
                    <select bind:value={selectedLightMode}>
                      <option value="open">Open · 30 ft</option>
                      <option value="dimmed">Dimmed · 10 ft</option>
                      <option value="closed">Closed · 0 ft</option>
                    </select>
                  </label>
                {/if}
                {#if selectedLightSource && isLantern(selectedLightSource.name)}
                  <label class="text-[10px]">
                    Lamp Oil
                    <select bind:value={selectedLampOilId} disabled={!localLampOil.length}>
                      {#if localLampOil.length}
                        {#each localLampOil as oil (oil.id)}
                          <option value={oil.id}>{oil.name} · {oil.usageDie}</option>
                        {/each}
                      {:else}
                        <option value="">No Lamp Oil</option>
                      {/if}
                    </select>
                  </label>
                {/if}
              </div>
              <button
                class="border rounded px-2 py-1 text-[10px] mt-1"
                disabled={!!selectedLightSource && isLantern(selectedLightSource.name) && !localLampOil.length}
                on:click={activateLocalLight}
              >
                Light / Update Source
              </button>
            {:else}
              <div class="text-[10px] text-gray-400 mt-1">
                No Torch Bundle or lantern is carried on this character.
              </div>
            {/if}

            {#if localActiveLights.length}
              <div class="flex flex-wrap gap-1 mt-1">
                {#each localActiveLights as light (light.sourceItemId)}
                  <button
                    class="border rounded px-2 py-1 text-[10px]"
                    on:click={() => extinguishLocalLight(light)}
                  >
                    Extinguish {light.sourceName}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        {#if $isGM}
          <div class="mt-2 border-2 border-black rounded-md p-2 bg-white text-xs">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold">Dungeon Camp / Sleep Quarter</div>
                <div class="text-[9px] text-gray-500">
                  Sleeping in an active dangerous site uses one 6-hour Sleep Quarter (36 Exploration Turns) and one secret Dungeon Camp roll.
                </div>
              </div>
              <span class="status-chip">6 HOURS · 36 TURNS</span>
            </div>

            <div class="mt-2 border rounded-md p-2 bg-gray-50">
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 text-[10px] font-bold">
                  <input
                    type="checkbox"
                    checked={$expedition.exploration.dungeonCampEstablished}
                    on:change={(event) => setDungeonCampEstablished(event.currentTarget.checked)}
                  />
                  Camp established
                </label>
                <span class="text-[9px] text-gray-500">
                  Record the actual preparations that matter; they do not add a numeric camp modifier.
                </span>
              </div>

              <div class="mt-2">
                <div class="font-bold text-[10px]">Watchers</div>
                <div class="text-[9px] text-gray-500">
                  Mark anyone assigned to watch during the Sleep Quarter. Watches matter fictionally if something manifests.
                </div>
                <div class="flex flex-wrap gap-1 mt-1">
                  {#each company as member (member.id)}
                    <label class="border rounded px-2 py-1 bg-white text-[10px] flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={$expedition.exploration.dungeonCampWatchIds.includes(member.id)}
                        on:change={() => toggleDungeonCampWatcher(member.id)}
                      />
                      {member.name}
                    </label>
                  {/each}
                </div>
              </div>

              <label class="text-[10px] block mt-2">
                Camp Preparations
                <input
                  class="w-full"
                  value={$expedition.exploration.dungeonCampPrepNotes}
                  placeholder="Barricades, alarms, shelter, dry bedding, concealed light, fire discipline, sleeping positions..."
                  on:change={(event) => setDungeonCampPrepNotes(event.currentTarget.value)}
                />
              </label>

              <div class="flex flex-wrap items-end gap-2 mt-2">
                <label class="text-[10px]">
                  Shared Meal
                  <select
                    value={$expedition.exploration.dungeonCampMeal}
                    on:change={onDungeonCampMealChange}
                  >
                    {#each DUNGEON_CAMP_MEALS as meal}
                      <option value={meal}>
                        {meal === "None" ? "None / ordinary food (+0)" : meal === "Simple" ? "Simple Meal (−1)" : "Fancy Meal (−2)"}
                      </option>
                    {/each}
                  </select>
                </label>
                <button
                  class="border rounded px-2 py-1 text-[10px]"
                  disabled={!$expedition.exploration.dungeonCampEstablished}
                  on:click={rollDungeonCamp}
                >
                  Roll Secret Dungeon Camp
                </button>
              </div>
              <div class="text-[9px] text-gray-500 mt-1">
                Meal tier only applies as a Company-wide modifier if all sleepers able to eat actually received that tier.
              </div>
            </div>

            {#if $expedition.exploration.dungeonCampResult}
              <div class="mt-2 border rounded p-2 bg-gray-50">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-bold">{$expedition.exploration.dungeonCampResult}</span>
                  <span>
                    d20 {$expedition.exploration.dungeonCampNaturalRoll}
                    {#if $expedition.exploration.dungeonCampMeal !== "None"}
                      → {$expedition.exploration.dungeonCampModifiedRoll}
                    {/if}
                  </span>
                  {#if $expedition.exploration.dungeonCampResultHour}
                    <span class="status-chip">
                      MANIFESTS HOUR {$expedition.exploration.dungeonCampResultHour}
                    </span>
                  {/if}
                </div>
                {#if $expedition.exploration.dungeonCampResult === "Quiet Night"}
                  <div class="text-[10px] text-gray-600 mt-1">
                    No camp timing roll is needed. Sleep may complete if no other consequence interrupts it.
                  </div>
                {:else if $expedition.exploration.dungeonCampResult === "Rough Night"}
                  <div class="text-[10px] text-amber-800 mt-1 font-bold">
                    Rough Night normally allows Sleep to complete, but achieved Rest quality cannot exceed Perilous.
                  </div>
                {:else}
                  <div class="text-[10px] text-red-700 mt-1 font-bold">
                    Camp Disaster interrupts Sleep. Resolve the danger before a Sleep Quarter can complete.
                  </div>
                {/if}
              </div>
            {/if}

            <div class="flex flex-wrap gap-2 mt-2">
              <button
                class="primary-action"
                disabled={!$expedition.exploration.dungeonCampResult || $expedition.exploration.dungeonCampResult === "Camp Disaster"}
                on:click={completeSleepQuarter}
              >
                Complete Sleep Quarter
              </button>
              <div class="text-[9px] text-gray-500 self-center max-w-[440px]">
                This advances elapsed Exploration time by 36 Turns. Routine hourly Dungeon Event generation is replaced by the Dungeon Camp roll during this stationary Sleep period.
              </div>
            </div>
          </div>

          <div class="mt-2 border rounded-md p-2 bg-slate-50 text-xs">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold">GM · Exploration Pressure</div>
                <div class="text-[9px] text-gray-500">Dungeon Event state is private to the GM.</div>
              </div>
              <span class="status-chip">{dungeonEventDue ? "EVENT CHECK DUE" : "EVENT CHECKED"}</span>
            </div>
            {#if dungeonEventDue}
              <div class="text-[10px] mt-1">
                Start of exploration Hour {explorationHour}: make the secret Dungeon Event roll, then mark it checked.
              </div>
              <button class="border rounded px-2 py-1 text-[10px] mt-1" on:click={markDungeonEventChecked}>
                Mark Dungeon Event Checked
              </button>
            {/if}
            <div class="mt-2 text-[10px]">
              Completing Turn {$expedition.exploration.turn} advances the shared clock by 10 minutes.
              Each active light checks its governing Usage stock after every 3 burn Turns.
              Torches warn on their 5th Turn and go out after their 6th.
            </div>
            <div class="flex flex-wrap gap-2 mt-1">
              <button class="primary-action" on:click={completeExplorationTurn}>
                Complete Exploration Turn
              </button>
              <button
                class="border border-black rounded-md px-3 py-1.5 text-xs font-bold bg-white"
                on:click={exitExplorationLocation}
              >
                Exit Location
              </button>
            </div>
            <div class="text-[9px] text-gray-500 mt-1">
              Exit Location ends active Exploration pressure and returns to Wilderness without resetting the continuing Exploration clock or inventory state.
            </div>
          </div>
        {/if}

        {#if explorationMessage}
          <div class="mt-1 border rounded px-2 py-1 bg-amber-50 text-[10px]">{explorationMessage}</div>
        {/if}

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
        <div class="flex items-center justify-between gap-2">
          <h2>MARCHING FORMATION</h2>
          {#if $isGM}
            <button class="border rounded px-2 py-1 text-[10px]" on:click={addFormationRow}>Add Row</button>
          {/if}
        </div>
        <div class="text-[9px] text-gray-500 mt-1">
          Front to rear. Left / right within a row matters when the space allows it; constrictions compress the recorded order.
        </div>

        {#if $expedition.exploration.formationRows.length}
          <div class="flex flex-col gap-1 mt-2">
            {#each $expedition.exploration.formationRows as row, index}
              <div class="border rounded p-1 bg-gray-50">
                <div class="flex items-center gap-1 text-[9px] font-bold">
                  <span>ROW {index + 1}</span>
                  {#if $isGM}
                    <button class="ml-auto border rounded px-1" on:click={() => removeFormationRow(index)}>×</button>
                  {/if}
                </div>
                <div class="grid grid-cols-2 gap-1 mt-1">
                  <label class="text-[9px]">
                    Left
                    <select
                      class="w-full"
                      disabled={!$isGM}
                      value={row.leftId}
                      on:change={(e) => setFormationMember(index, "leftId", e.currentTarget.value)}
                    >
                      <option value="">—</option>
                      {#each company as member}
                        <option value={member.id}>{member.name}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="text-[9px]">
                    Right
                    <select
                      class="w-full"
                      disabled={!$isGM}
                      value={row.rightId}
                      on:change={(e) => setFormationMember(index, "rightId", e.currentTarget.value)}
                    >
                      <option value="">—</option>
                      {#each company as member}
                        <option value={member.id}>{member.name}</option>
                      {/each}
                    </select>
                  </label>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-[10px] text-gray-400 mt-2">No formation recorded.</div>
        {/if}

        {#if formationHasDuplicates}
          <div class="mt-1 border border-red-300 bg-red-50 rounded px-2 py-1 text-[10px] text-red-700 font-bold">
            A Company member appears more than once in the formation.
          </div>
        {/if}

        <div class="mt-3 border-t pt-2">
          <h2>COMPANY</h2>
          {#if company.length}
            <div class="flex flex-col gap-1 mt-2">
              {#each company as p}
                <div class="border rounded-md px-2 py-1 text-xs flex items-center gap-2">
                  <i class="material-icons text-sm">{p.source === "npc" ? "badge" : "person"}</i>
                  <span class="truncate">{p.name}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-xs text-gray-400">No player characters currently connected.</div>
          {/if}
        </div>
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
