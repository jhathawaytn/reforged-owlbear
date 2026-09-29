import OBR from "@owlbear-rodeo/sdk";
import { writable, get } from "svelte/store";

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
  knownRouteEventBudget: number;
  knownRouteEventsResolved: number;
  knownRouteDangerous: boolean;
  knownRouteCautiousCommitment: boolean;
  assignments: ExpeditionAssignment[];
};

export type ExplorationExpeditionState = {
  turn: number;
  siteName: string;
  siteArea: string;
  notes: string;
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
    knownRouteEventBudget: -1,
    knownRouteEventsResolved: 0,
    knownRouteDangerous: false,
    knownRouteCautiousCommitment: false,
    assignments: [],
  },
  exploration: {
    turn: 1,
    siteName: "",
    siteArea: "",
    notes: "",
  },
});

export const ExpeditionStore = writable<ExpeditionState>(defaultExpeditionState());

const EXPEDITION_METADATA_KEY = "rodeo.owlbear.reforged-sheet/expedition";

function withDefaults(value: Partial<ExpeditionState> | undefined): ExpeditionState {
  const base = defaultExpeditionState();
  if (!value) return base;
  const legacyWilderness = (value.wilderness ?? {}) as Partial<WildernessExpeditionState> & {
    targetQuarters?: number;
  };
  return {
    ...base,
    ...value,
    wilderness: {
      ...base.wilderness,
      ...legacyWilderness,
      routeTimeQuarters:
        legacyWilderness.routeTimeQuarters ?? legacyWilderness.targetQuarters ?? base.wilderness.routeTimeQuarters,
      companyNpcs: (legacyWilderness.companyNpcs ?? base.wilderness.companyNpcs).map((npc) => ({
        ...npc,
        deprivedFromRest: npc.deprivedFromRest ?? false,
      })),
    },
    exploration: { ...base.exploration, ...(value.exploration ?? {}) },
  };
}

export async function initExpeditionStore(): Promise<void> {
  if (!OBR.isAvailable) return;

  const metadata = await OBR.room.getMetadata();
  ExpeditionStore.set(withDefaults(metadata[EXPEDITION_METADATA_KEY] as Partial<ExpeditionState> | undefined));

  OBR.room.onMetadataChange((next) => {
    ExpeditionStore.set(withDefaults(next[EXPEDITION_METADATA_KEY] as Partial<ExpeditionState> | undefined));
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
