import OBR from "@owlbear-rodeo/sdk";
import { writable, get } from "svelte/store";

export type ExpeditionMode = "wilderness" | "exploration";
export type TravelQuarter = "Morning" | "Day" | "Evening" | "Night";
export type RouteMode = "Known Route" | "Unmapped Country";
export type TravelPace = "Cautious" | "Steady" | "Forced";

export type WildernessActivity =
  | "Travel"
  | "Rest"
  | "Sleep"
  | "Make Camp"
  | "Forage"
  | "Hunt"
  | "Fish"
  | "Other";

export type WildernessRole = "Trailblazer" | "Keep Watch" | "Quartermaster";

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
  weather: string;
  currentLocation: string;
  destination: string;
  progress: number;
  targetQuarters: number;
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
    weather: "Not rolled",
    currentLocation: "",
    destination: "",
    progress: 0,
    targetQuarters: 0,
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
  return {
    ...base,
    ...value,
    wilderness: { ...base.wilderness, ...(value.wilderness ?? {}) },
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
