import OBR from "@owlbear-rodeo/sdk";
import { get } from "svelte/store";
import { PlayerCharacterStore } from "../model/ReforgedCharacter";
import { applyLifeAction } from "../lifeState";
import type { LifeAction } from "../lifeState";
import { notify } from "./Notifier";
import { TrackedPlayer } from "./OBRHelper";

// GM-only life-or-death switches (V-011): Stabilized, the Clinging exits,
// Mark dead / Undo death. Same pattern as the GM HP nudge: Owlbear only lets
// a player's own client write their sheet, so the GM's click is broadcast and
// the patient's own sheet applies it, then answers. No answer = their sheet
// isn't open; the GM tries again later.

const REQUEST_KEY = "rodeo.owlbear.reforged-sheet/life-action-request";
const RESULT_KEY = "rodeo.owlbear.reforged-sheet/life-action-result";

type LifeActionRequest = { requestId: string; targetPlayerId: string; action: LifeAction };
type LifeActionResponse = { requestId: string; ok: boolean; message: string };

let initialized = false;

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function initLifeActions(): void {
  if (initialized || !OBR.isAvailable) return;
  initialized = true;
  OBR.broadcast.onMessage(REQUEST_KEY, async ({ data }) => {
    const request = data as LifeActionRequest;
    if (!request || request.targetPlayerId !== OBR.player.id) return;
    if ((await OBR.player.getRole()) === "GM") return;
    const result = applyLifeAction(get(PlayerCharacterStore), request.action);
    const response: LifeActionResponse =
      "error" in result
        ? { requestId: request.requestId, ok: false, message: result.error }
        : { requestId: request.requestId, ok: true, message: result.message };
    if (!("error" in result)) {
      PlayerCharacterStore.set(result.pc);
      notify(result.message);
    }
    OBR.broadcast.sendMessage(RESULT_KEY, response, { destination: "ALL" });
  });
}

// From the GM's view of a player's sheet. A GM looking at their own sheet
// (an NPC they run) applies it directly.
export async function sendLifeAction(action: LifeAction, timeoutMs = 10000): Promise<string> {
  const targetPlayerId = get(TrackedPlayer);
  if (!OBR.isAvailable || !targetPlayerId || targetPlayerId === OBR.player.id) {
    const result = applyLifeAction(get(PlayerCharacterStore), action);
    if ("error" in result) return result.error;
    PlayerCharacterStore.set(result.pc);
    notify(result.message);
    return result.message;
  }
  const request: LifeActionRequest = { requestId: id(), targetPlayerId, action };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(message);
    };
    const unsubscribe = OBR.broadcast.onMessage(RESULT_KEY, ({ data }) => {
      const response = data as LifeActionResponse;
      if (response?.requestId === request.requestId) finish(response.message);
    });
    const timer = setTimeout(
      () => finish("Their sheet didn't answer - it has to be open for this to apply. Try again when they're back."),
      timeoutMs,
    );
    OBR.broadcast.sendMessage(REQUEST_KEY, request, { destination: "ALL" });
  });
}
