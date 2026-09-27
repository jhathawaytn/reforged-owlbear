import OBR from "@owlbear-rodeo/sdk";
import { get, writable } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { rollReforgedSave, rollSingleDie } from "./DicePlus";
import { showPopover } from "./Notifier";
import type { Attribute } from "../types";
import type { SaveRollMode, SaveRollResult } from "../utils";

const REQUEST_KEY = "rodeo.owlbear.reforged-sheet/expedition-roll-request";
const RESULT_KEY = "rodeo.owlbear.reforged-sheet/expedition-roll-result";

export type ExpeditionRollKind =
  | "Trailblaze"
  | "Forage for Food"
  | "Forage for Water"
  | "Hunt"
  | "Fish"
  | "Make Camp"
  | "Forced March";

export type ExpeditionAttributeMode = "INT" | "STR" | "HIGHER_INT_DEX" | "INT_OR_STR";

export type ExpeditionRollRequest = {
  requestId: string;
  targetPlayerId: string;
  kind: ExpeditionRollKind;
  attributeMode: ExpeditionAttributeMode;
  baseModifier: number;
  useWildernessCraft: boolean;
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  applyFailureFatigue: boolean;
  requestedBy: string;
  note?: string;
};

export type ExpeditionRollResponse = {
  requestId: string;
  targetPlayerId: string;
  kind: ExpeditionRollKind;
  status: "rolled" | "declined";
  playerName: string;
  characterName: string;
  attribute?: Attribute;
  target?: number;
  skillRank?: number;
  modifier?: number;
  mode?: SaveRollMode;
  roll?: SaveRollResult;
  outcome?: string;
  fatigueApplied?: boolean;
};

export const PendingExpeditionRollStore = writable<ExpeditionRollRequest | null>(null);

let initialized = false;

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function wildernessCraftRank(): number {
  const pc = get(PlayerCharacterStore);
  let highest = 0;
  for (const node of pc.skillTreeNodes) {
    if (node.tree !== "Wilderness Craft") continue;
    const match = node.node.match(/^R([1-4])$/);
    if (match) highest = Math.max(highest, parseInt(match[1], 10));
  }
  return highest;
}

function attributeFor(request: ExpeditionRollRequest, choice?: "INT" | "STR"): Attribute {
  const pc = get(PlayerCharacterStore);
  if (request.attributeMode === "INT") return "INT";
  if (request.attributeMode === "STR") return "STR";
  if (request.attributeMode === "HIGHER_INT_DEX") {
    return pc.attributes.INT >= pc.attributes.DEX ? "INT" : "DEX";
  }
  return choice ?? "INT";
}

function rollModeFor(request: ExpeditionRollRequest, rank: number): SaveRollMode {
  const hasAdvantage = request.hasAdvantage;
  const hasDisadvantage =
    request.hasDisadvantage || (request.useWildernessCraft && rank === 0);

  if (hasAdvantage && hasDisadvantage) return "normal";
  if (hasAdvantage) return "advantage";
  if (hasDisadvantage) return "disadvantage";
  return "normal";
}

async function outcomeFor(kind: ExpeditionRollKind, roll: SaveRollResult): Promise<string> {
  if (kind === "Forced March") {
    return roll.success
      ? "Forced March succeeds; traveler may complete this Quarter."
      : "Forced March fails: +1 Fatigue and this traveler cannot travel another Quarter today.";
  }
  if (kind === "Trailblaze") {
    const pieces = [roll.success ? "Quarter progress succeeds." : "Quarter spent; no progress."];
    if (roll.natural === 1) pieces.push("Natural 1: Travel Boon.");
    if (roll.natural === 20) pieces.push("Natural 20: Travel Bane.");
    return pieces.join(" ");
  }
  if (kind === "Forage for Food") {
    return roll.success ? "Gain 1 × d6 Fresh Ration." : "Nothing found; Quarter spent.";
  }
  if (kind === "Forage for Water") {
    return roll.success
      ? "Establish a usable local water source if the terrain and fiction support one."
      : "No usable water found; Quarter spent.";
  }
  if (kind === "Hunt") {
    if (!roll.success) return "No prey taken; Quarter spent.";
    const prey = await rollSingleDie(6, { rollTarget: "everyone", showResults: true });
    const stocks = prey <= 3 ? 1 : prey <= 5 ? 2 : 4;
    return `Prey d6 = ${prey}: gain ${stocks} × d6 Fresh Ration${stocks === 1 ? "" : "s"}.${roll.natural === 1 ? " Also recover a hide or other usable material." : ""}`;
  }
  if (kind === "Fish") {
    if (!roll.success) return "No useful catch; Quarter spent.";
    const catchRoll = await rollSingleDie(6, { rollTarget: "everyone", showResults: true });
    const stocks = catchRoll <= 3 ? 1 : catchRoll <= 5 ? 2 : 3;
    return `Catch d6 = ${catchRoll}: gain ${stocks} × d6 Fresh Ration${stocks === 1 ? "" : "s"}.`;
  }
  return roll.success
    ? "Camp established; it supports a Normal Rest when the Company Sleeps."
    : "Camp established but supports only a Perilous Rest; GM applies one listed consequence.";
}

export function initExpeditionRolls(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(REQUEST_KEY, ({ data }) => {
    const request = data as ExpeditionRollRequest;
    if (!request || request.targetPlayerId !== OBR.player.id) return;
    PendingExpeditionRollStore.set(request);
    showPopover(`${request.requestedBy} requests ${request.kind}. Open Company Expedition to roll.`);
  });
}

export async function requestExpeditionRoll(
  input: Omit<ExpeditionRollRequest, "requestId" | "requestedBy">,
  timeoutMs = 90000,
): Promise<ExpeditionRollResponse | null> {
  const requestId = id();
  const requestedBy = await OBR.player.getName();
  const request: ExpeditionRollRequest = { ...input, requestId, requestedBy };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ExpeditionRollResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = OBR.broadcast.onMessage(RESULT_KEY, ({ data }) => {
      const response = data as ExpeditionRollResponse;
      if (response?.requestId === requestId) finish(response);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);

    OBR.broadcast.sendMessage(REQUEST_KEY, request, { destination: "ALL" });
  });
}

export async function resolvePendingExpeditionRoll(choice?: "INT" | "STR"): Promise<ExpeditionRollResponse | null> {
  const request = get(PendingExpeditionRollStore);
  if (!request) return null;
  if (request.attributeMode === "INT_OR_STR" && !choice) return null;

  const pc = get(PlayerCharacterStore);
  const rank = request.useWildernessCraft ? wildernessCraftRank() : 0;
  const attribute = attributeFor(request, choice);
  const modifier = request.baseModifier - (request.useWildernessCraft ? rank * 2 : 0);
  const mode = rollModeFor(request, rank);
  const roll = await rollReforgedSave(pc.attributes[attribute], modifier, mode, "everyone");
  const outcome = await outcomeFor(request.kind, roll);

  let fatigueApplied = false;
  if (request.applyFailureFatigue && !roll.success) {
    PlayerCharacterStore.set({ ...pc, fatigue: (pc.fatigue ?? 0) + 1 });
    fatigueApplied = true;
  }

  const response: ExpeditionRollResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: request.kind,
    status: "rolled",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
    attribute,
    target: pc.attributes[attribute],
    skillRank: request.useWildernessCraft ? rank : undefined,
    modifier,
    mode,
    roll,
    outcome,
    fatigueApplied,
  };

  PendingExpeditionRollStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
  return response;
}

export async function declinePendingExpeditionRoll(): Promise<void> {
  const request = get(PendingExpeditionRollStore);
  if (!request) return;
  const pc = get(PlayerCharacterStore);
  const response: ExpeditionRollResponse = {
    requestId: request.requestId,
    targetPlayerId: request.targetPlayerId,
    kind: request.kind,
    status: "declined",
    playerName: await OBR.player.getName(),
    characterName: pc.name || (await OBR.player.getName()),
  };
  PendingExpeditionRollStore.set(null);
  OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
}
