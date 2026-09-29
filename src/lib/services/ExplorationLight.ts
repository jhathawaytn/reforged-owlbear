import OBR from "@owlbear-rodeo/sdk";
import { get, writable } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import type { GearItem, UsageDieState } from "../types";
import { DIE_SIDES, stepDownDie } from "../types";
import { rollSingleDie } from "./DicePlus";

const DECLARE_KEY = "rodeo.owlbear.reforged-sheet/exploration-light-declare";
const CHECK_KEY = "rodeo.owlbear.reforged-sheet/exploration-light-check";
const CHECK_RESULT_KEY = "rodeo.owlbear.reforged-sheet/exploration-light-check-result";

export type ExplorationLightMode = "open" | "dimmed" | "closed";

export type ExplorationLightDeclaration = {
  nonce: string;
  action: "upsert" | "extinguish";
  ownerId: string;
  ownerName: string;
  sourceItemId: string;
  sourceName: string;
  fuelItemId: string;
  fuelName: string;
  fuelDie: UsageDieState;
  mode: ExplorationLightMode;
  reachFeet: number;
};

export type ExplorationLightCheckRequest = {
  requestId: string;
  ownerId: string;
  sourceItemId: string;
  fuelItemId: string;
};

export type ExplorationLightCheckResponse = {
  requestId: string;
  ownerId: string;
  sourceItemId: string;
  fuelItemId: string;
  fuelName: string;
  before: UsageDieState;
  roll: number;
  after: UsageDieState;
  exhausted: boolean;
};

export const ExplorationLightDeclarationStore =
  writable<ExplorationLightDeclaration | null>(null);

let initialized = false;

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function activeUsage(
  item: GearItem | undefined,
): item is GearItem & { usageDie: Exclude<UsageDieState, "depleted"> } {
  return !!item?.usageDie && item.usageDie !== "depleted";
}

export function lightReach(sourceName: string, mode: ExplorationLightMode): number {
  if (sourceName === "Bullseye Lantern") return mode === "closed" ? 0 : 60;
  if (sourceName === "Hooded Lantern") {
    if (mode === "closed") return 0;
    if (mode === "dimmed") return 10;
    return 30;
  }
  if (sourceName === "Torch Bundle" || sourceName === "Lantern") {
    return mode === "closed" ? 0 : 30;
  }
  return 0;
}

export function isLantern(sourceName: string): boolean {
  return ["Lantern", "Hooded Lantern", "Bullseye Lantern"].includes(sourceName);
}

export function initExplorationLight(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(DECLARE_KEY, ({ data }) => {
    const declaration = data as ExplorationLightDeclaration;
    if (!declaration || typeof declaration.ownerId !== "string") return;
    ExplorationLightDeclarationStore.set(declaration);
  });

  OBR.broadcast.onMessage(CHECK_KEY, async ({ data }) => {
    const request = data as ExplorationLightCheckRequest;
    if (!request || request.ownerId !== OBR.player.id) return;

    let pc = get(PlayerCharacterStore);
    pc = { ...pc, gear: pc.gear.map((item) => ({ ...item })) };
    const fuel = pc.gear.find((item) => item.id === request.fuelItemId);

    let before: UsageDieState = fuel?.usageDie ?? "depleted";
    let roll = 0;
    let after: UsageDieState = before;

    if (activeUsage(fuel)) {
      roll = await rollSingleDie(DIE_SIDES[fuel.usageDie], {
        rollTarget: "everyone",
        showResults: true,
      });
      after = roll <= 3 ? stepDownDie(fuel.usageDie) : fuel.usageDie;
      fuel.usageDie = after;
      PlayerCharacterStore.set(pc);
    }

    const response: ExplorationLightCheckResponse = {
      requestId: request.requestId,
      ownerId: request.ownerId,
      sourceItemId: request.sourceItemId,
      fuelItemId: request.fuelItemId,
      fuelName: fuel?.name ?? "Missing fuel stock",
      before,
      roll,
      after,
      exhausted: after === "depleted",
    };

    OBR.broadcast.sendMessage(CHECK_RESULT_KEY, response, { destination: "ALL" });
  });
}

export async function declareExplorationLight(
  input: Omit<ExplorationLightDeclaration, "nonce" | "ownerId" | "ownerName">,
): Promise<void> {
  if (!OBR.isAvailable) return;
  const declaration: ExplorationLightDeclaration = {
    ...input,
    nonce: id("light"),
    ownerId: OBR.player.id,
    ownerName: await OBR.player.getName(),
  };
  ExplorationLightDeclarationStore.set(declaration);
  OBR.broadcast.sendMessage(DECLARE_KEY, declaration, { destination: "ALL" });
}

export async function requestExplorationLightCheck(
  ownerId: string,
  sourceItemId: string,
  fuelItemId: string,
  timeoutMs = 20000,
): Promise<ExplorationLightCheckResponse | null> {
  if (!OBR.isAvailable) return null;
  const requestId = id("lightcheck");
  const request: ExplorationLightCheckRequest = {
    requestId,
    ownerId,
    sourceItemId,
    fuelItemId,
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: ExplorationLightCheckResponse | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(response);
    };

    const unsubscribe = OBR.broadcast.onMessage(CHECK_RESULT_KEY, ({ data }) => {
      const response = data as ExplorationLightCheckResponse;
      if (response?.requestId === requestId) finish(response);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);

    OBR.broadcast.sendMessage(CHECK_KEY, request, { destination: "ALL" });
  });
}
