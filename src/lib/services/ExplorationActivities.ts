import OBR from "@owlbear-rodeo/sdk";
import { writable } from "svelte/store";
import type { ExplorationActivity } from "../model/ExpeditionStore";

const DECLARE_KEY = "rodeo.owlbear.reforged-sheet/exploration-activity-declare";

export type ExplorationActivityDeclaration = {
  nonce: string;
  playerId: string;
  playerName: string;
  activity: ExplorationActivity;
  detail: string;
};

export const ExplorationActivityDeclarationStore =
  writable<ExplorationActivityDeclaration | null>(null);

let initialized = false;

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function initExplorationActivities(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;

  OBR.broadcast.onMessage(DECLARE_KEY, ({ data }) => {
    const declaration = data as ExplorationActivityDeclaration;
    if (
      !declaration ||
      typeof declaration.playerId !== "string" ||
      typeof declaration.activity !== "string"
    ) {
      return;
    }
    ExplorationActivityDeclarationStore.set(declaration);
  });
}

export async function declareExplorationActivity(
  activity: ExplorationActivity,
  detail: string,
): Promise<void> {
  if (!OBR.isAvailable) return;
  const declaration: ExplorationActivityDeclaration = {
    nonce: id(),
    playerId: OBR.player.id,
    playerName: await OBR.player.getName(),
    activity,
    detail: detail.trim(),
  };

  ExplorationActivityDeclarationStore.set(declaration);
  OBR.broadcast.sendMessage(DECLARE_KEY, declaration, { destination: "ALL" });
}
