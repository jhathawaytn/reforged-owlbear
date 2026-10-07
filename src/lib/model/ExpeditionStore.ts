import OBR from "@owlbear-rodeo/sdk";
import type { FoundResource } from "../services/ExpeditionRolls";
import { writable, get } from "svelte/store";
import { legacyBaseBudget } from "../expeditionRules";

export type ExpeditionMode = "wilderness" | "exploration";
export type TravelQuarter = "Morning" | "Day" | "Evening" | "Night";
export type RouteMode = "Known Route" | "Unmapped Country";
export type TravelPace = "Cautious" | "Steady" | "Forced";
export type TravelTerrain = "Open" | "Broken" | "Difficult" | "Severe";
export type TravelClimate =
  | "Cold / Winter"
  | "Temperate Spring / Fall"
  | "Temperate Summer"
  | "Tropical"
  | "Desert / Arid";
export type TravelWeatherEffect = "normal" | "heavy" | "severe" | "cold-snap" | "heat-wave";
export type RestQuality = "Perilous" | "Normal" | "Comfortable";

export type WildernessActivity =
  | "Travel"
  | "Forage for Food"
  | "Forage for Water"
  | "Hunt"
  | "Fish"
  | "Make Camp"
  | "Stand Watch"
  | "Sleep"
  | "Other";

export type WildernessRole = "Trailblazer" | "Keep Watch" | "Quartermaster";

export type CompanyNpcKind =
  | "Guide Hireling"
  | "Camp Hand Hireling"
  | "Scout Henchman"
  | "Professional Quartermaster"
  | "Apprentice"
  | "Other";

export type CompanyNpc = {
  id: string;
  name: string;
  kind: CompanyNpcKind;
  level: number;
  attributes: { STR: number; DEX: number; INT: number; WIL: number };
  wildernessCraftRank: number;
  detectionRank: number;
  quartermasterQualified: boolean;
  fatigue: number;
  notes: string;
  deprivedFromRest: boolean;
};

export type ExpeditionAssignment = {
  playerId: string;
  activity: WildernessActivity;
  role?: WildernessRole;
};

export type WildernessExpeditionState = {
  day: number;
  quarter: TravelQuarter;
  routeMode: RouteMode;
  pace: TravelPace;
  paceDeclaredDay: number;
  forcedTravelTarget: 3 | 4;
  terrain: TravelTerrain;
  terrainConfirmedDay: number;
  routeConfirmedDay: number;
  climate: TravelClimate;
  climateLocked: boolean;
  weather: string;
  weatherEffect: TravelWeatherEffect;
  weatherModifier: number;
  weatherNaturalRoll: number;
  weatherModifiedRoll: number;
  weatherRolledDay: number;
  weatherExtremeCandidate: "" | "Cold Snap" | "Heat Wave";
  travelQuartersToday: number;
  forcedMarchStoppedPlayerIds: string[];
  companyNpcs: CompanyNpc[];
  makeCampLeaderId: string;
  quartermasterTodayId: string;
  quartermasterCoveredTravelQuarters: number;
  quartermasterMissedToday: boolean;
  campRestQuality: "" | RestQuality;
  campRestQualityDay: number;
  consumptionResolvedPlayerIds: string[];
  foodSatisfiedPlayerIds: string[];
  waterSatisfiedPlayerIds: string[];
  extraWaterRollsResolvedByPlayer: Record<string, number>;
  forcedMarchAttemptsByPlayer: Record<string, number>;
  forcedMarchAttemptKeys: string[];
  sleptPlayerIdsToday: string[];
  currentLocation: string;
  destination: string;
  progress: number;
  routeTimeQuarters: number;
  wildernessEventCheckedDay: number;
  wildernessEventLastDie: number;
  wildernessEventLastRoll: number;
  wildernessEventOccurred: boolean;
  // GM's pick from the §11.8.2 table, BEFORE the +1/−1 modifiers (−1 = not
  // picked yet). The effective budget is derived - see expeditionRules.ts.
  // Replaced `knownRouteEventBudget` (modifiers baked in) in 0.1.19.
  knownRouteBaseBudget: number;
  knownRouteEventsResolved: number;
  knownRouteDangerous: boolean;
  knownRouteCautiousCommitment: boolean;
  assignments: ExpeditionAssignment[];
  // Food/water found this trip that the GM hasn't applied to sheets yet (V-005).
  foundResources: FoundResourceEntry[];
  // V-003: maps, rumors, guide estimates for this leg. Informational only:
  // never affects Trailblaze, Arrival, or Known Route status (M-002).
  routeNotes: string;
  // Set by an Unmapped Arrival until the GM records or skips the Known
  // Route (V-006, §11.1.3). Kept in room state so a reload doesn't lose it.
  pendingKnownRoute: { from: string; to: string; notes: string } | null;
};

export type FoundResourceEntry = {
  id: string;
  day: number;
  quarter: TravelQuarter;
  source: string; // "Hunt - Mara", "Trailblaze Boon 21 - Pip"
  resource: FoundResource;
};

export type ExplorationActiveLight = {
  ownerId: string;
  ownerName: string;
  sourceItemId: string;
  sourceName: string;
  fuelItemId: string;
  fuelName: string;
  fuelDie: "d4" | "d6" | "d8" | "d10" | "d12" | "depleted";
  mode: "open" | "dimmed" | "closed";
  reachFeet: number;
  active: boolean;
  lastCheckTurn: number;
  burnTurns: number;
};

export type ExplorationFormationRow = {
  leftId: string;
  rightId: string;
};

export type ExplorationMovementMode = "New / Unsecured" | "Explored" | "Rush";

export type ExplorationActivity =
  | "None"
  | "Focused Search"
  | "Focused Listening"
  | "Dedicated Watch"
  | "Technical / Security Work"
  | "Force / Haul"
  | "Operate Mechanism"
  | "Other";

export type ExplorationActivityAssignment = {
  playerId: string;
  playerName: string;
  activity: ExplorationActivity;
  detail: string;
};

export type DungeonCampMeal = "None" | "Simple" | "Fancy";
export type DungeonCampResult = "" | "Quiet Night" | "Rough Night" | "Camp Disaster";

export type ExplorationExpeditionState = {
  turn: number;
  siteName: string;
  siteArea: string;
  notes: string;
  activeLights: ExplorationActiveLight[];
  dungeonEventCheckedHour: number;
  formationRows: ExplorationFormationRow[];
  movementMode: ExplorationMovementMode;
  activityAssignments: ExplorationActivityAssignment[];
  dungeonCampEstablished: boolean;
  dungeonCampWatchIds: string[];
  dungeonCampPrepNotes: string;
  dungeonCampMeal: DungeonCampMeal;
  dungeonCampNaturalRoll: number;
  dungeonCampModifiedRoll: number;
  dungeonCampResult: DungeonCampResult;
  dungeonCampResultHour: number;
};

export type ExpeditionState = {
  version: 1;
  mode: ExpeditionMode;
  wilderness: WildernessExpeditionState;
  exploration: ExplorationExpeditionState;
};

export const defaultExpeditionState = (): ExpeditionState => ({
  version: 1,
  mode: "wilderness",
  wilderness: {
    day: 1,
    quarter: "Morning",
    routeMode: "Unmapped Country",
    pace: "Steady",
    paceDeclaredDay: 0,
    forcedTravelTarget: 3,
    terrain: "Open",
    terrainConfirmedDay: 0,
    routeConfirmedDay: 0,
    climate: "Temperate Spring / Fall",
    climateLocked: false,
    weather: "Not rolled",
    weatherEffect: "normal",
    weatherModifier: 0,
    weatherNaturalRoll: 0,
    weatherModifiedRoll: 0,
    weatherRolledDay: 0,
    weatherExtremeCandidate: "",
    travelQuartersToday: 0,
    forcedMarchStoppedPlayerIds: [],
    companyNpcs: [],
    makeCampLeaderId: "",
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
    currentLocation: "",
    destination: "",
    progress: 0,
    routeTimeQuarters: 0,
    wildernessEventCheckedDay: 0,
    wildernessEventLastDie: 0,
    wildernessEventLastRoll: 0,
    wildernessEventOccurred: false,
    knownRouteBaseBudget: -1,
    knownRouteEventsResolved: 0,
    knownRouteDangerous: false,
    knownRouteCautiousCommitment: false,
    assignments: [],
    foundResources: [],
    routeNotes: "",
    pendingKnownRoute: null,
  },
  exploration: {
    turn: 1,
    siteName: "",
    siteArea: "",
    notes: "",
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

export const ExpeditionStore = writable<ExpeditionState>(defaultExpeditionState());

const EXPEDITION_METADATA_KEY = "rodeo.owlbear.reforged-sheet/expedition";

export function expeditionStateWithDefaults(value: Partial<ExpeditionState> | undefined): ExpeditionState {
  const base = defaultExpeditionState();
  if (!value) return base;
  const { knownRouteEventBudget: legacyBudget, ...legacyWilderness } = (value.wilderness ?? {}) as Partial<WildernessExpeditionState> & {
    targetQuarters?: number;
    knownRouteEventBudget?: number;
  };
  return {
    ...base,
    ...value,
    wilderness: {
      ...base.wilderness,
      ...legacyWilderness,
      knownRouteBaseBudget:
        legacyWilderness.knownRouteBaseBudget ??
        legacyBaseBudget(
          legacyBudget ?? -1,
          legacyWilderness.knownRouteDangerous ?? false,
          legacyWilderness.knownRouteCautiousCommitment ?? false,
        ),
      routeTimeQuarters:
        legacyWilderness.routeTimeQuarters ?? legacyWilderness.targetQuarters ?? base.wilderness.routeTimeQuarters,
      companyNpcs: (legacyWilderness.companyNpcs ?? base.wilderness.companyNpcs).map((npc) => ({
        ...npc,
        deprivedFromRest: npc.deprivedFromRest ?? false,
      })),
    },
    exploration: {
      ...base.exploration,
      ...(value.exploration ?? {}),
      activeLights: ((value.exploration?.activeLights ?? base.exploration.activeLights) as ExplorationActiveLight[]).map((light) => ({
        ...light,
        burnTurns: light.burnTurns ?? 0,
      })),
    },
  };
}

export async function initExpeditionStore(): Promise<void> {
  if (!OBR.isAvailable) return;

  const metadata = await OBR.room.getMetadata();
  ExpeditionStore.set(expeditionStateWithDefaults(metadata[EXPEDITION_METADATA_KEY] as Partial<ExpeditionState> | undefined));

  OBR.room.onMetadataChange((next) => {
    ExpeditionStore.set(expeditionStateWithDefaults(next[EXPEDITION_METADATA_KEY] as Partial<ExpeditionState> | undefined));
  });
}

export async function saveExpeditionState(next: ExpeditionState): Promise<void> {
  ExpeditionStore.set(next);
  if (!OBR.isAvailable) return;
  if ((await OBR.player.getRole()) !== "GM") return;

  await OBR.room.setMetadata({
    [EXPEDITION_METADATA_KEY]: next,
  });
}

export async function updateExpedition(
  updater: (current: ExpeditionState) => ExpeditionState,
): Promise<void> {
  const next = updater(get(ExpeditionStore));
  await saveExpeditionState(next);
}
