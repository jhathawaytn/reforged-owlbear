import OBR from "@owlbear-rodeo/sdk";
import { get, writable } from "svelte/store";
import {
  PlayerCharacterStore,
  addDeprivationCause,
  clearDeprivationCause,
} from "../model/ReforgedCharacter";
import type { Attribute, GearItem, UsageDieState } from "../types";
import { DIE_SIDES, stepDownDie } from "../types";
import type { RestQuality } from "../model/ExpeditionStore";
import { rollSingleDie } from "./DicePlus";
import { showPopover } from "./Notifier";
import { resolveRestForCurrentCharacter, type RestResolution } from "./RestRecovery";

const REQUEST_KEY = "rodeo.owlbear.reforged-sheet/expedition-daily-request";
const RESULT_KEY = "rodeo.owlbear.reforged-sheet/expedition-daily-result";
const CLOSEOUT_KEY = "rodeo.owlbear.reforged-sheet/expedition-day-closeout";

export type ExpeditionDailyRequest =
  | {
      requestId: string;
      targetPlayerId: string;
      kind: "Consumption";
      day: number;
      ordinaryThreshold: 2 | 3;
      ordinaryRequired: boolean;
      extraWaterRolls: number;
      note?: string;
      requestedBy: string;
    }
  | {
      requestId: string;
      targetPlayerId: string;
      kind: "Rest";
      day: number;
      quality: RestQuality;
      note?: string;
      requestedBy: string;
    };

export type UsageResolution = {
  itemName: string;
  before: UsageDieState;
  roll: number;
  threshold: number;
  after: UsageDieState;
  suppliedUse: boolean;
  category: "Food" | "Water";
  ordinary: boolean;
};

export type ExpeditionDailyResponse = {
  requestId: string;
  targetPlayerId: string;
  kind: "Consumption" | "Rest";
  status: "resolved" | "declined";
  playerName: string;
  characterName: string;
  foodSatisfied?: boolean;
  waterSatisfied?: boolean;
  extraWaterRollsResolved?: number;
  usage?: UsageResolution[];
  rest?: RestResolution;
};

export type ConsumptionChoice = {
  rationSource: string; // gear id, "shared", or "none"
  waterSource: string; // gear id, "shared", or "none"
};

export const PendingExpeditionDailyStore = writable<ExpeditionDailyRequest | null>(null);
export const LastExpeditionDailyStore = writable<ExpeditionDailyResponse | null>(null);

let initialized = false;

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function activeUsageItem(item: GearItem | undefined, kind: "Rations" | "Water"): item is GearItem {
  return !!item && item.usageKind === kind && !!item.usageDie && item.usageDie !== "depleted";
}

async function rollUsage(
  item: GearItem,
  threshold: number,
  category: "Food" | "Water",
  ordinary: boolean,
): Promise<UsageResolution> {
  const before = item.usageDie as Exclude<UsageDieState, "depleted">;
  const roll = await rollSingleDie(DIE_SIDES[before], { rollTarget: "everyone", showResults: true });
  const after = roll <= threshold ? stepDownDie(before) : before;
  item.usageDie = after;
  return {
    itemName: item.name,
    before,
    roll,
    threshold,
    after,
    suppliedUse: true,
    category,
    ordinary,
  };
}

export function initExpeditionDaily(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(REQUEST_KEY, ({ data }) => {
    const request = data as ExpeditionDailyRequest;
    if (!request || request.targetPlayerId !== OBR.player.id) return;
    LastExpeditionDailyStore.set(null);
    PendingExpeditionDailyStore.set(request);
    showPopover(
      request.kind === "Consumption"
        ? `${request.requestedBy} requests Day ${request.day} food/water consumption.`
        : `${request.requestedBy} requests ${request.quality} Rest for Day ${request.day}.`,
    );
  });

  OBR.broadcast.onMessage(CLOSEOUT_KEY, ({ data }) => {
    const closeout = data as {
      targetPlayerId: string;
      day: number;
      ate: boolean;
      slept: boolean;
    };
    if (!closeout || closeout.targetPlayerId !== OBR.player.id) return;

    let pc = get(PlayerCharacterStore);
    const notes: string[] = [];

    if (!closeout.ate) {
      pc = addDeprivationCause(pc, "Food");
      notes.push("No daily ration was satisfied: Deprived from Food.");
    }

    if (!closeout.slept) {
      pc = addDeprivationCause(pc, "Rest");
      pc = { ...pc, fatigue: (pc.fatigue ?? 0) + 1 };
      notes.push("No Sleep Quarter: +1 Fatigue and Deprived from lack of Rest.");
    }

    PlayerCharacterStore.set(pc);
    if (notes.length) showPopover(`Day ${closeout.day} closeout: ${notes.join(" ")}`);
  });
}

export async function requestExpeditionDaily(
  input: Omit<ExpeditionDailyRequest, "requestId" | "requestedBy">,
  timeoutMs = 180000,
): Promise<ExpeditionDailyResponse | null> {
  const requestId = id();
  const requestedBy = await OBR.player.getName();
  const request = { ...input, requestId, requestedBy } as ExpeditionDailyRequest;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ExpeditionDailyResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = OBR.broadcast.onMessage(RESULT_KEY, ({ data }) => {
      const response = data as ExpeditionDailyResponse;
      if (response?.requestId === requestId) finish(response);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);

    OBR.broadcast.sendMessage(REQUEST_KEY, request, { destination: "ALL" });
  });
}

export function applyDayCloseout(
  targetPlayerId: string,
  day: number,
  ate: boolean,
  slept: boolean,
): void {
  if (!OBR.isAvailable) return;
  OBR.broadcast.sendMessage(
    CLOSEOUT_KEY,
    { targetPlayerId, day, ate, slept },
    { destination: "ALL" },
  );
}

export async function resolvePendingConsumption(
  choice: ConsumptionChoice,
): Promise<ExpeditionDailyResponse | null> {
  const request = get(PendingExpeditionDailyStore);
  if (!request || request.kind !== "Consumption") return null;

  let pc = get(PlayerCharacterStore);
  pc = {
    ...pc,
    gear: pc.gear.map((item) => ({ ...item })),
    conditions: [...pc.conditions],
    deprivationCauses: [...pc.deprivationCauses],
  };
  const usage: UsageResolution[] = [];

  let foodSatisfied = !request.ordinaryRequired;
  if (request.ordinaryRequired) {
    if (choice.rationSource === "shared") {
      foodSatisfied = true;
    } else if (choice.rationSource !== "none") {
      const item = pc.gear.find((gear) => gear.id === choice.rationSource);
      if (activeUsageItem(item, "Rations")) {
        usage.push(await rollUsage(item, request.ordinaryThreshold, "Food", true));
        foodSatisfied = true;
      }
    }

    if (foodSatisfied) pc = clearDeprivationCause(pc, "Food");
  }

  const totalWaterRolls = (request.ordinaryRequired ? 1 : 0) + Math.max(0, request.extraWaterRolls);
  let waterSatisfied = totalWaterRolls === 0;
  const extraWaterRollsResolved = request.extraWaterRolls;

  if (choice.waterSource === "shared") {
    waterSatisfied = true;
  } else if (choice.waterSource !== "none") {
    let preferredId = choice.waterSource;
    let allWaterSupplied = true;

    for (let index = 0; index < totalWaterRolls; index += 1) {
      let item = pc.gear.find((gear) => gear.id === preferredId);
      if (!activeUsageItem(item, "Water")) {
        item = pc.gear.find((gear) => activeUsageItem(gear, "Water"));
      }
      if (!activeUsageItem(item, "Water")) {
        allWaterSupplied = false;
        break;
      }

      const ordinary = index === 0;
      usage.push(
        await rollUsage(
          item,
          ordinary ? request.ordinaryThreshold : 3,
          "Water",
          ordinary,
        ),
      );
      preferredId = item.id;
    }

    waterSatisfied = allWaterSupplied;
  }

  if (waterSatisfied) {
    pc = clearDeprivationCause(pc, "Water");
  } else {
    pc = addDeprivationCause(pc, "Water");
  }

  PlayerCharacterStore.set(pc);

  const response: ExpeditionDailyResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: "Consumption",
    status: "resolved",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
    foodSatisfied,
    waterSatisfied,
    extraWaterRollsResolved,
    usage,
  };

  LastExpeditionDailyStore.set(response);
  PendingExpeditionDailyStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
  return response;
}

export async function resolvePendingRest(
  restoreAttribute?: Attribute,
): Promise<ExpeditionDailyResponse | null> {
  const request = get(PendingExpeditionDailyStore);
  if (!request || request.kind !== "Rest") return null;

  const rest = await resolveRestForCurrentCharacter(request.quality, restoreAttribute);
  const pc = get(PlayerCharacterStore);
  const response: ExpeditionDailyResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: "Rest",
    status: "resolved",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
    rest,
  };

  LastExpeditionDailyStore.set(response);
  PendingExpeditionDailyStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
  return response;
}

export async function declinePendingExpeditionDaily(): Promise<void> {
  const request = get(PendingExpeditionDailyStore);
  if (!request) return;
  const pc = get(PlayerCharacterStore);
  const response: ExpeditionDailyResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: request.kind,
    status: "declined",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
  };
  LastExpeditionDailyStore.set(response);
  PendingExpeditionDailyStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
}
