import OBR from "@owlbear-rodeo/sdk";
import type { Player } from "@owlbear-rodeo/sdk";
import { withDefaults } from "../model/ReforgedCharacter";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { debounce, clamp } from "../utils";
import { writable, get, derived } from "svelte/store";
import { getSaveSlot, saveSaveSlot } from "./LocalStorageSaver";
import { CurrentSaveSlot, NUM_SLOTS } from "./SaveSlotTracker";
import type { ReforgedCharacter } from "../types";
import { NOTIFICATION_KEY, showPopover } from "./Notifier";
import { initExpeditionStore } from "../model/ExpeditionStore";
import { initExpeditionRolls } from "./ExpeditionRolls";

const PLUGIN_ID = "rodeo.owlbear.reforged-sheet";

const PlayerMetaDataMapStore = writable<{ [pId: string]: PlayerMetaData }>({});
const PlayerMetaDataStore = writable<PlayerMetaData>({});
type PlayerMetaData = {
  [key in `slot-${1 | 2 | 3}`]?: ReforgedCharacter;
};

export function pluginId(s: string) {
  return `${PLUGIN_ID}/${s}`;
}

export type ReforgedPresence = {
  id: string;
  connectionId: string;
  name: string;
  role: "GM" | "PLAYER";
  lastSeen: number;
};

export const isGM = writable(false);
export const CurrentPlayerId = writable("");
export const CurrentPlayerName = writable("");
export const PartyStore = writable<Player[]>([]);
export const ReforgedPresenceStore = writable<ReforgedPresence[]>([]);
export const TrackedPlayer = writable<string>();
export const GmId = writable<string>();
export const GmPlayer = writable<Player>();

export const isTrackedPlayerGM = derived(TrackedPlayer, ($trackedPlayer) => {
  return $trackedPlayer == get(GmId);
});

export async function init() {
  OBR.onReady(async () => {
    CurrentPlayerId.set(OBR.player.id);
    CurrentPlayerName.set(await OBR.player.getName());
    const role = await OBR.player.getRole();
    isGM.set(role === "GM");

    OBR.player.onChange((player) => {
      CurrentPlayerId.set(player.id);
      CurrentPlayerName.set(player.name);
      isGM.set(player.role === "GM");
      if (player.role === "GM") GmPlayer.set(player);
    });

    subscribeToRoomNotifications();
    subscribeToHPNudges();
    initPartyPresence();
    initReforgedPresence();
    initExpeditionRolls();
    await initExpeditionStore();

    if (get(isGM)) {
      initGM();
      // GM is also a player
      initPlayer();
    } else {
      initPlayer();
    }
  });
}

function subscribeToRoomNotifications() {
  OBR.broadcast.onMessage(NOTIFICATION_KEY, ({ data: notif }) => {
    if (typeof notif !== "string") return;
    showPopover(notif);
  });
}

// GM write-back MVP: there's no API to write directly into another client's
// player metadata, so a GM "nudge" is a room broadcast every client
// receives - only the addressed player's own client applies it, to its own
// live PlayerCharacterStore (which then saves via initPlayer's normal
// debounced subscription, same as any other edit that client makes).
// Trust-based, like every other broadcast this extension sends - there's no
// real auth on an OBR room broadcast.
export const HP_NUDGE_KEY = pluginId("gm-hp-nudge");
type HPNudge = { targetPlayerId: string; delta: number; reason: string; fromName: string };

function subscribeToHPNudges() {
  OBR.broadcast.onMessage(HP_NUDGE_KEY, ({ data }) => {
    const nudge = data as HPNudge;
    if (!nudge || nudge.targetPlayerId !== OBR.player.id) return;
    const pc = get(PlayerCharacterStore);
    const before = pc.hitPoints;
    const after = clamp(before + nudge.delta, 0, pc.maxHitPoints);
    PlayerCharacterStore.set({ ...pc, hitPoints: after });
    showPopover(
      `${nudge.fromName}: ${nudge.delta >= 0 ? "+" : ""}${nudge.delta} HP${nudge.reason ? ` (${nudge.reason})` : ""} - ${before} -> ${after}`,
    );
  });
}

export async function sendHPNudge(targetPlayerId: string, delta: number, reason: string) {
  const fromName = await OBR.player.getName();
  const nudge: HPNudge = { targetPlayerId, delta, reason, fromName };
  OBR.broadcast.sendMessage(HP_NUDGE_KEY, nudge);
}


const PRESENCE_KEY = pluginId("presence");
type PresenceMessage = {
  type: "hello" | "announce";
  id: string;
  connectionId: string;
  name: string;
  role: "GM" | "PLAYER";
  timestamp: number;
};

function upsertReforgedPresence(message: PresenceMessage) {
  ReforgedPresenceStore.update((current) => {
    const next = current.filter(
      (entry) => !(entry.id === message.id && entry.connectionId === message.connectionId),
    );
    next.push({
      id: message.id,
      connectionId: message.connectionId,
      name: message.name,
      role: message.role,
      lastSeen: Date.now(),
    });
    return next;
  });
}

function pruneReforgedPresence() {
  const cutoff = Date.now() - 15000;
  ReforgedPresenceStore.update((current) => current.filter((entry) => entry.lastSeen >= cutoff));
}

function initReforgedPresence() {
  const announce = async (type: "hello" | "announce") => {
    try {
      const message: PresenceMessage = {
        type,
        id: OBR.player.id,
        connectionId: await OBR.player.getConnectionId(),
        name: await OBR.player.getName(),
        role: await OBR.player.getRole(),
        timestamp: Date.now(),
      };
      upsertReforgedPresence(message);
      OBR.broadcast.sendMessage(PRESENCE_KEY, message, { destination: "ALL" });
    } catch (error) {
      console.error("Failed to announce Reforged presence", error);
    }
  };

  OBR.broadcast.onMessage(PRESENCE_KEY, ({ data }) => {
    const message = data as PresenceMessage;
    if (
      !message ||
      (message.type !== "hello" && message.type !== "announce") ||
      typeof message.id !== "string" ||
      typeof message.connectionId !== "string" ||
      typeof message.name !== "string" ||
      (message.role !== "GM" && message.role !== "PLAYER")
    ) {
      return;
    }

    upsertReforgedPresence(message);

    // A newly opened Reforged client announces "hello". Existing clients
    // immediately answer so it doesn't need to wait for the next heartbeat.
    if (message.type === "hello" && message.connectionId !== undefined) {
      announce("announce");
    }
  });

  announce("hello");
  window.setInterval(() => announce("announce"), 5000);
  window.setInterval(pruneReforgedPresence, 5000);
}

function initPartyPresence() {
  const refresh = () => {
    OBR.party.getPlayers().then((party) => PartyStore.set(party)).catch((error) => {
      console.error("Failed to refresh Owlbear party", error);
    });
  };

  OBR.party.onChange((party) => {
    PartyStore.set(party);
  });

  refresh();
  // A room can already contain players while the action iframe is still
  // establishing its SDK connection. Re-read once after startup so those
  // existing connections are not missed if no join/leave event fires.
  window.setTimeout(refresh, 750);
}

async function initGM() {
  GmId.set(OBR.player.id);
  TrackedPlayer.set(OBR.player.id);

  OBR.player.onChange((gm) => {
    GmPlayer.set(gm);
  });

  PartyStore.subscribe(async (party) => {
    const pmd: { [pId: string]: PlayerMetaData } = {};

    // include the GM's own sheet too
    pmd[OBR.player.id] = (await OBR.player.getMetadata())[pluginId("sheetData")] as PlayerMetaData;

    for (const p of party) {
      pmd[p.id] = p.metadata[pluginId("sheetData")] as PlayerMetaData;
    }
    PlayerMetaDataMapStore.set(pmd);

    // if the tracked player leaves the party, fall back to viewing your own
    const trackedPlayer = get(TrackedPlayer);
    if (!party.find((p) => p.id === trackedPlayer) && trackedPlayer !== OBR.player.id) {
      TrackedPlayer.set(OBR.player.id);
    }
  });

  PlayerMetaDataMapStore.subscribe((pmd) => {
    const slot = get(CurrentSaveSlot);
    const pId = get(TrackedPlayer);
    if (!pId || pId === get(GmId)) return;
    PlayerCharacterStore.set(withDefaults(pmd[pId]?.[`slot-${slot}`]));
  });

  CurrentSaveSlot.subscribe((slot) => {
    const pmd = get(PlayerMetaDataMapStore);
    const pId = get(TrackedPlayer);
    PlayerCharacterStore.set(withDefaults(pmd[pId]?.[`slot-${slot}`]));
  });

  TrackedPlayer.subscribe((pId) => {
    const pmd = get(PlayerMetaDataMapStore);
    const slot = get(CurrentSaveSlot);
    PlayerCharacterStore.set(withDefaults(pmd[pId]?.[`slot-${slot}`]));
  });

}

async function initPlayer() {
  CurrentSaveSlot.set(await getSaveSlot());

  const existing = ((await OBR.player.getMetadata())[pluginId("sheetData")] as PlayerMetaData) ?? {};
  const playerMd: PlayerMetaData = {};
  for (let i = 1; i <= NUM_SLOTS; i++) {
    const key = `slot-${i}` as const;
    playerMd[key] = withDefaults(existing[key]);
  }
  PlayerMetaDataStore.set(playerMd);
  PlayerCharacterStore.set(playerMd[`slot-${get(CurrentSaveSlot)}` as const]);

  // Keep the local save-slot model in sync immediately so Owlbear/party
  // metadata refreshes can never rehydrate a stale copy over a just-made edit.
  // Only the network write is debounced.
  PlayerCharacterStore.subscribe((pc: ReforgedCharacter) => {
    if (get(isGM) && !get(isTrackedPlayerGM)) return;

    const slot = get(CurrentSaveSlot);
    PlayerMetaDataStore.set({
      ...get(PlayerMetaDataStore),
      [`slot-${slot}` as const]: pc,
    });
  });

  CurrentSaveSlot.subscribe((slot) => {
    if (get(isGM) && !get(isTrackedPlayerGM)) return;

    saveSaveSlot(slot);
    const pmd = get(PlayerMetaDataStore);
    PlayerCharacterStore.set(withDefaults(pmd[`slot-${slot}` as const]));
  });

  const persistPlayerMetadata = debounce((pmd: PlayerMetaData) => {
    OBR.player.setMetadata({
      [pluginId("sheetData")]: pmd,
    });
  }, 1000);

  PlayerMetaDataStore.subscribe((pmd) => {
    if (get(isGM)) {
      if (!get(isTrackedPlayerGM)) return;
      const pId = get(GmId);
      PlayerMetaDataMapStore.update((pmdMap) => ({
        ...pmdMap,
        [pId]: pmd,
      }));
    }

    persistPlayerMetadata(pmd);
  });
}
