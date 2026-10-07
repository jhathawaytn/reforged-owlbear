import OBR from "@owlbear-rodeo/sdk";
import { get } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { addFreshRations, refillWater, rollSpecificStock, sidesOf } from "../stockRules";
import type { StockCategory } from "../stockRules";
import type { DieSize, UsageDieState } from "../types";
import { rollSingleDie } from "./DicePlus";
import { showPopover } from "./Notifier";

// One way to change another player's stocks (review B1). Owlbear only lets a
// player's own client write their sheet, so the sender broadcasts a request
// and the owner's client applies it and answers. If the owner is offline no
// answer comes back (null) and the caller must offer a by-hand fallback.

const REQUEST_KEY = "rodeo.owlbear.reforged-sheet/stock-operation-request";
const RESULT_KEY = "rodeo.owlbear.reforged-sheet/stock-operation-result";

export type StockOperation =
  // V-010: someone else uses this exact stock for their daily food/water.
  | { kind: "roll"; gearId: string; category: StockCategory; threshold: number; forName: string }
  // V-005: found food/water.
  | { kind: "addFreshRations"; count: number; source: string }
  | { kind: "refillWater"; source: string };

type StockOperationRequest = {
  requestId: string;
  targetPlayerId: string;
  requestedBy: string;
  op: StockOperation;
};

export type StockOperationResponse = {
  requestId: string;
  ok: boolean;
  message: string;
  characterName: string;
  roll?: { itemName: string; before: DieSize; roll: number; after: UsageDieState };
  overburdened?: boolean;
};

let initialized = false;
// Requests are applied one at a time, in arrival order, so two travelers
// drawing on the same Waterskin roll it in sequence (and the second sees
// the stepped-down die).
let queue: Promise<void> = Promise.resolve();

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function apply(request: StockOperationRequest): Promise<Omit<StockOperationResponse, "requestId" | "characterName">> {
  const pc = get(PlayerCharacterStore);
  const op = request.op;
  if (op.kind === "roll") {
    const item = pc.gear.find((g) => g.id === op.gearId);
    if (!item || !item.usageDie || item.usageDie === "depleted") {
      return { ok: false, message: `${item?.name ?? "That stock"} is ${item ? "already empty" : "gone"}.` };
    }
    const value = await rollSingleDie(sidesOf(item.usageDie), { rollTarget: "everyone", showResults: true });
    const result = rollSpecificStock(get(PlayerCharacterStore), op.gearId, op.category, op.threshold, value);
    if ("reason" in result) return { ok: false, message: result.reason };
    PlayerCharacterStore.set(result.pc);
    const change = result.after === result.before ? "holds" : result.after === "depleted" ? "now empty" : `now ${result.after}`;
    showPopover(`${op.forName} used your ${result.itemName} (${op.category}): ${result.before} rolled ${result.roll}, ${change}.`);
    return {
      ok: true,
      message: `${result.itemName} ${result.before} rolled ${result.roll}, ${change}.`,
      roll: { itemName: result.itemName, before: result.before, roll: result.roll, after: result.after },
    };
  }
  const grant = op.kind === "addFreshRations" ? addFreshRations(pc, op.count) : refillWater(pc);
  PlayerCharacterStore.set(grant.pc);
  const warning = grant.overburdened ? " You are now Overburdened." : "";
  showPopover(`${op.source}: ${grant.summary}${warning}`);
  return { ok: true, message: grant.summary + warning, overburdened: grant.overburdened };
}

export function initStockOperations(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(REQUEST_KEY, ({ data }) => {
    const request = data as StockOperationRequest;
    if (!request || request.targetPlayerId !== OBR.player.id) return;
    queue = queue.then(async () => {
      // The GM's sheet view may be showing another player's character, so a
      // GM client never applies stock changes.
      if ((await OBR.player.getRole()) === "GM") return;
      let result: Omit<StockOperationResponse, "requestId" | "characterName">;
      try {
        result = await apply(request);
      } catch (error) {
        console.error("Stock operation failed", error);
        result = { ok: false, message: "Their sheet couldn't apply it." };
      }
      const pc = get(PlayerCharacterStore);
      const response: StockOperationResponse = {
        ...result,
        requestId: request.requestId,
        characterName: pc.name || (await OBR.player.getName()),
      };
      OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
    });
  });
}

// Resolves with the owner's answer, or null if they never answered (offline,
// sheet closed, or the GM).
export async function sendStockOperation(
  targetPlayerId: string,
  op: StockOperation,
  timeoutMs = 30000,
): Promise<StockOperationResponse | null> {
  if (!OBR.isAvailable) return null;
  const request: StockOperationRequest = {
    requestId: id(),
    targetPlayerId,
    requestedBy: await OBR.player.getName(),
    op,
  };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: StockOperationResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const unsubscribe = OBR.broadcast.onMessage(RESULT_KEY, ({ data }) => {
      const response = data as StockOperationResponse;
      if (response?.requestId === request.requestId) finish(response);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    OBR.broadcast.sendMessage(REQUEST_KEY, request, { destination: "ALL" });
  });
}
