import OBR from "@owlbear-rodeo/sdk";
import { writable, get } from "svelte/store";
import type { KnownRouteRecord } from "../knownRoutes";

// Campaign memory (review B2): things that outlive a single expedition.
// Expedition state is trip memory and Arrival deliberately wipes it, so
// anything long-lived goes here instead. Known Routes first (V-006); the
// recovered-treasure ledger (V-016) can join later.

export type CampaignState = {
  knownRoutes: KnownRouteRecord[];
};

export const defaultCampaignState = (): CampaignState => ({
  knownRoutes: [],
});

export const CampaignStore = writable<CampaignState>(defaultCampaignState());

const CAMPAIGN_METADATA_KEY = "rodeo.owlbear.reforged-sheet/campaign";

export function campaignStateWithDefaults(value: Partial<CampaignState> | undefined): CampaignState {
  const base = defaultCampaignState();
  if (!value) return base;
  return {
    ...base,
    ...value,
    knownRoutes: (value.knownRoutes ?? []).map((route) => ({
      ...route,
      bothWays: route.bothWays ?? true,
      notes: route.notes ?? "",
    })),
  };
}

export async function initCampaignStore(): Promise<void> {
  if (!OBR.isAvailable) return;

  const metadata = await OBR.room.getMetadata();
  CampaignStore.set(campaignStateWithDefaults(metadata[CAMPAIGN_METADATA_KEY] as Partial<CampaignState> | undefined));

  OBR.room.onMetadataChange((next) => {
    CampaignStore.set(campaignStateWithDefaults(next[CAMPAIGN_METADATA_KEY] as Partial<CampaignState> | undefined));
  });
}

// GM only, like the Expedition state: players read it, the GM writes it.
export async function updateCampaign(updater: (current: CampaignState) => CampaignState): Promise<void> {
  const next = updater(get(CampaignStore));
  CampaignStore.set(next);
  if (!OBR.isAvailable) return;
  if ((await OBR.player.getRole()) !== "GM") return;
  await OBR.room.setMetadata({ [CAMPAIGN_METADATA_KEY]: next });
}
